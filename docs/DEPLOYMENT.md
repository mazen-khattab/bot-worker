# Contabo VPS deployment

Use Ubuntu 24.04 LTS for these commands. Start with 3 concurrent sessions on the
6-core, 12-GB VPS. This guide uses PM2, Nginx and HTTPS.

| Address | Purpose |
| --- | --- |
| `https://api.naafez.com` | Existing .NET backend |
| `https://worker.naafez.com` | New worker address |
| `http://127.0.0.1:3000` | Worker's internal HTTP listener |

Replace `YOUR_SERVER_IP` below with the IPv4 address provided by Contabo.

## 1. Connect and install server packages

From Windows PowerShell on your computer:

```powershell
ssh root@YOUR_SERVER_IP
```

Enter the server password. Password characters do not appear while typing.
On the server, check the OS and install packages:

```bash
cat /etc/os-release
apt update
apt upgrade -y
apt install -y git curl ca-certificates build-essential nginx ufw nano openssl snapd
adduser deploy
usermod -aG sudo deploy
```

Choose a password for `deploy`; press Enter for optional contact fields.
For a new server using the default SSH port 22:

```bash
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
ufw status
su - deploy
```

If SSH uses another port, allow that port before enabling the firewall. If a
Contabo firewall is enabled, allow the SSH port, 80 and 443 there too. Keep port
3000 private. Run all remaining commands as `deploy`, with `sudo` where shown.

## 2. Install Node.js and download the project

```bash
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.8/install.sh | bash
source "$HOME/.nvm/nvm.sh"
nvm install 22
nvm alias default 22
nvm use 22
node --version
npm --version
mkdir -p ~/apps
cd ~/apps
git clone https://github.com/mazen-khattab/bot-worker.git
cd bot-worker
```

Commit and push the changes on your computer before cloning. Only pushed code is
downloaded. For a private repository, use your GitHub username and a personal
access token with repository read access when Git asks for a password. Do not
put the token in the repository URL.

## 3. Create the environment file

```bash
cp .env.example .env
chmod 600 .env
openssl rand -hex 32
nano .env
```

Copy the generated random string into `WORKER_API_KEY`. Set `DOTNET_API_KEY` to
the key accepted by your backend's worker callback endpoints. The file should
look like this, with both placeholders replaced:

```dotenv
HOST=127.0.0.1
PORT=3000
NODE_ENV=production
WORKER_API_KEY=PASTE_GENERATED_WORKER_KEY_HERE
DOTNET_API_URL=https://api.naafez.com
DOTNET_API_KEY=PASTE_BACKEND_CALLBACK_KEY_HERE
MAX_CONCURRENT_SESSIONS=3
IDEMPOTENCY_TTL_HOURS=24
DLQ_FILE_PATH=./data/dlq.json
DLQ_SYNC_INTERVAL_MS=60000
SCREENSHOT_DIR=./screenshots
SCREENSHOT_RETENTION_DAYS=7
```

Save in Nano with Ctrl+O, Enter, then Ctrl+X to exit.

- `WORKER_API_KEY`: the backend sends this key when calling the worker.
- `DOTNET_API_KEY`: the worker sends this key when calling the backend.
- Both directions use the `X-Worker-Api-Key` header. The keys can differ.
- The callback key is whatever your .NET worker authentication accepts; it is
  not automatically your JWT signing secret or a user's login token.
- Keep `DOTNET_API_URL` as the origin shown above. The code appends API paths.
- `.env` is ignored by Git and must be created separately on the server. Never
  commit production keys. The app loads it automatically; `source .env` is unnecessary.

## 4. Install, build and check the worker

```bash
bash setup.sh
npm test
npm run test:browser
```

The setup script selects Node.js from `.nvmrc`, installs locked npm packages,
downloads Chromium with its Linux dependencies, compiles TypeScript, validates
the environment and installs PM2. It may ask for your sudo password to install
Linux packages. It does not start the worker or edit DNS/firewall settings.

If you prefer individual commands instead of the script:

```bash
npm ci --include=dev
npx playwright install --with-deps chromium
npm run build
node -e "require('./dist/config/env')"
mkdir -p data screenshots
npm install -g pm2
```

Continue only after the build and checks succeed. No desktop or virtual display
is required because Chromium runs headless.

## 5. Start and persist the process

```bash
pm2 start ecosystem.config.js
pm2 status
pm2 logs bot-worker --lines 50
```

Ctrl+C exits the log viewer without stopping the worker. Then:

```bash
pm2 startup
```

Copy and run the exact `sudo ...` command PM2 prints, then:

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 20M
pm2 set pm2-logrotate:retain 7
pm2 save
```

Keep PM2 at one instance; `MAX_CONCURRENT_SESSIONS` controls browser jobs. Use
`pm2` as the `deploy` user rather than `sudo pm2`.

Check the local authenticated health endpoint:

```bash
read -rsp "Worker API key: " WORKER_TEST_KEY
echo
curl --fail-with-body http://127.0.0.1:3000/api/worker/health \
  -H "X-Worker-Api-Key: $WORKER_TEST_KEY"
unset WORKER_TEST_KEY
```

Paste `WORKER_API_KEY` at the prompt. Expect `status: ok` and `browser: connected`,
plus queue statistics. A missing or incorrect key returns HTTP 401.

## 6. DNS, Nginx and HTTPS

In your DNS provider, add an A record named `worker` pointing to the VPS IPv4
address. Leave `api.naafez.com` pointing to its existing backend server. Use a
direct/DNS-only record while setting up the certificate. If an AAAA record exists,
it must also point to a working IPv6 listener on this VPS; otherwise remove it.

Install the provided Nginx config:

```bash
sudo cp deploy/nginx.conf /etc/nginx/sites-available/bot-worker
sudo ln -s /etc/nginx/sites-available/bot-worker /etc/nginx/sites-enabled/bot-worker
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx
getent ahostsv4 worker.naafez.com
```

The symlink command is needed only once. If `nginx -t` fails, resolve the error
before reloading. Once DNS resolves to the VPS, obtain the certificate:

```bash
sudo snap install --classic certbot
sudo /snap/bin/certbot --nginx -d worker.naafez.com --redirect
sudo /snap/bin/certbot renew --dry-run
```

Follow the email and terms prompts. Certbot configures HTTPS and automatic
renewal. Do not overwrite its modified Nginx config with the original template
on later updates. Verify the public address:

```bash
read -rsp "Worker API key: " WORKER_TEST_KEY
echo
curl --fail-with-body https://worker.naafez.com/api/worker/health \
  -H "X-Worker-Api-Key: $WORKER_TEST_KEY"
unset WORKER_TEST_KEY
```

## 7. Connect the .NET backend

Set your backend's worker base URL to `https://worker.naafez.com`. Its actual
configuration property names depend on the backend project.

| Operation | Endpoint |
| --- | --- |
| Dispatch job | `POST https://worker.naafez.com/api/worker/dispatch-messaging` |
| Check worker health | `GET https://worker.naafez.com/api/worker/health` |
| Read job status | `GET https://worker.naafez.com/api/worker/jobs/{jobId}/status` |

Every request needs `X-Worker-Api-Key` equal to `WORKER_API_KEY`. The dispatch
route is `/dispatch-messaging`, not the old `/start` path. The `cookies` field
currently expects a JSON string containing the cookie array.

The backend must accept `DOTNET_API_KEY` on these callbacks:

```text
PUT  /api/v1/worker/leads/{id}/status
PUT  /api/v1/worker/jobs/{id}/status
PUT  /api/v1/worker/accounts/{id}/status
POST /api/v1/worker/activity-log
```

Restart the backend after changing its configuration and dispatch one small job.
Verify that status callbacks arrive. Worker health alone does not test backend
authentication, Facebook access or message delivery.

## Updates and troubleshooting

For `.env` changes, edit the file and restart from the project directory:

```bash
cd ~/apps/bot-worker
nano .env
pm2 restart bot-worker --update-env
```

Jobs and duplicate tracking are in memory. Before any restart or update, pause
dispatches from the backend and wait until both health fields `queue.pending`
and `queue.size` are zero. Stop the worker before replacing packages:

```bash
cd ~/apps/bot-worker
pm2 stop bot-worker
git pull --ff-only
bash setup.sh
npm test
npm run test:browser
```

If all commands succeed:

```bash
pm2 restart bot-worker --update-env
pm2 save
```

Check authenticated health and resume backend dispatches. Leave the worker stopped
if installation or checks fail; resolve the error before restarting.

```bash
pm2 status
pm2 logs bot-worker --lines 100
free -h
df -h
sudo nginx -t
```

Common issues:

| Symptom | Check |
| --- | --- |
| HTTP 401 from worker | Backend header must match `WORKER_API_KEY` |
| HTTP 404 at `/start` | Use `/api/worker/dispatch-messaging` |
| Nginx HTTP 502 | Check PM2 logs and `HOST=127.0.0.1`, `PORT=3000` |
| Chromium executable missing | Run `npx playwright install --with-deps chromium` as `deploy` |
| Callback HTTP 401/403 | Check `DOTNET_API_KEY` against backend authentication |
| Backend certificate error | Repair the backend certificate/chain; keep verification enabled |
| Callbacks pending in `data/dlq.json` | Check backend reachability and callback logs |
| Worker does not return after reboot | Run the command from `pm2 startup`, then `pm2 save` |

If changing the installed Node.js version later, regenerate the PM2 startup
service with `pm2 unstartup` and `pm2 startup`, following their printed commands.

Reference documentation: [Playwright installation](https://playwright.dev/docs/intro),
[browser dependencies](https://playwright.dev/docs/browsers),
[NVM](https://github.com/nvm-sh/nvm),
[PM2 startup](https://pm2.keymetrics.io/docs/usage/startup/),
[Ubuntu firewall](https://ubuntu.com/server/docs/how-to/security/firewalls/),
[Nginx proxy](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass),
[Certbot](https://certbot.eff.org/instructions?ws=nginx&os=snap).
