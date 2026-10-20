# bot-worker

Node.js, TypeScript and Playwright worker controlled by the .NET backend at
`https://api.naafez.com`. Each job runs in its own Chromium browser context.

For the Contabo VPS, follow [the deployment guide](docs/DEPLOYMENT.md). It includes
Ubuntu packages, Node.js, `.env`, PM2, DNS, Nginx, HTTPS and backend settings.

## Local setup

```bash
nvm install
nvm use
npm ci --include=dev
npx playwright install --with-deps chromium
cp .env.example .env
# Fill in both keys. Set NODE_ENV=development for local development.
npm run dev
```

Chromium runs headless, so a desktop is not required. The server defaults to
`127.0.0.1:3000`. The environment template points to `https://api.naafez.com`;
change `DOTNET_API_URL` if using another backend. HTTPS certificates are verified.
For local HTTPS, install a trusted development CA (or use `NODE_EXTRA_CA_CERTS`);
do not disable certificate verification.

## Configuration

See [.env.example](.env.example) for every setting. Both API keys must be filled in
before starting. The app loads `.env` from its working directory and validates
settings at startup. PM2 uses the repository directory as its working directory.
Keep `.env` out of Git.

`WORKER_API_KEY` authenticates backend requests to this worker. `DOTNET_API_KEY`
authenticates callbacks to the backend. Both use the `X-Worker-Api-Key` header.

## HTTP contract

Every worker endpoint requires `X-Worker-Api-Key`:

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/worker/health` | Browser connectivity and queue statistics |
| POST | `/api/worker/dispatch-messaging` | Queue a messaging job |
| GET | `/api/worker/jobs/:jobId/status` | Current in-memory job status |

The dispatch payload includes numeric `jobId`, `botId`, `accountId`, string
`userId`, optional `correlationId`, `leads`, and `cookies`. The HTTP `cookies`
field currently expects a JSON-encoded string containing the cookie array.
See [the route validator](src/routes/index.ts) for the accepted fields.

Callbacks use `DOTNET_API_URL` as the origin; do not append `/api` to that setting:

| Method | Backend path |
| --- | --- |
| PUT | `/api/v1/worker/leads/:id/status` |
| PUT | `/api/v1/worker/jobs/:id/status` |
| PUT | `/api/v1/worker/accounts/:id/status` |
| POST | `/api/v1/worker/activity-log` |

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development with automatic reload |
| `npm run build` | Compile to `dist/` |
| `npm start` | Start the compiled worker |
| `npm run start:pm2` | Start one worker process under PM2 |
| `npm test` | Unit tests without a browser |
| `npm run test:browser` | Real headless-browser smoke test |
| `npm run lint` | Check lint rules |

## Operations

- `MAX_CONCURRENT_SESSIONS` caps simultaneous jobs within the single worker process.
  Start at 3 for the 6-core, 12-GB VPS.
- Failed callbacks are stored in `DLQ_FILE_PATH` and retried periodically.
- Jobs, status tracking and duplicate detection are in memory. Wait for both
  `queue.pending` and `queue.size` to reach zero before restarting or updating.
- Error screenshots are removed after `SCREENSHOT_RETENTION_DAYS`.
- Browser health does not verify backend credentials or successful message delivery.

## Docker alternative

Use Docker instead of PM2 when preferred; do not start both on port 3000.

```bash
cp .env.example .env
# Fill in the two API keys.
docker compose up -d --build
```

The image installs Chromium from the locked Playwright version and runs as the
non-root `node` user. Compose publishes port 3000 only on the host's loopback
interface, sets `HOST=0.0.0.0` inside the container, rotates logs and persists
callbacks/screenshots in named volumes. Existing deployments using the old bind
mounts must migrate their `data/` and `screenshots/` contents before switching to
these named volumes. Do not use `docker compose down -v` unless deleting that data
is intended. Configure Nginx and HTTPS as described in the deployment guide.
