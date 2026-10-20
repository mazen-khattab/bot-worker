#!/usr/bin/env bash
set -eo pipefail

# Resolve paths relative to this script, even when called from another directory.
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

if [ "$(id -u)" -eq 0 ]; then
    echo "Run this script as the deploy user, not root: su - deploy"
    exit 1
fi

if [ -s "$HOME/.nvm/nvm.sh" ]; then
    source "$HOME/.nvm/nvm.sh"
    nvm install
    nvm use
elif ! command -v node >/dev/null 2>&1; then
    echo "Install Node.js 22 first. See docs/DEPLOYMENT.md."
    exit 1
fi

node -e 'if (Number(process.versions.node.split(".")[0]) < 22) { console.error("Node.js 22 or newer is required."); process.exit(1); }'

if [ ! -f .env ]; then
    (umask 077; cp .env.example .env)
    echo "Created .env. Set WORKER_API_KEY and DOTNET_API_KEY with nano .env, then run bash setup.sh again."
    exit 1
fi
chmod 600 .env

echo "Installing project packages..."
npm ci --include=dev

echo "Installing Chromium and its Linux dependencies (sudo may request your password)..."
npx playwright install --with-deps chromium

echo "Building the worker..."
npm run build

echo "Checking environment settings..."
node -e "require('./dist/config/env')"

mkdir -p data screenshots

if ! command -v pm2 >/dev/null 2>&1; then
    echo "Installing PM2..."
    if [ -n "${NVM_BIN:-}" ]; then
        npm install -g pm2
    else
        sudo npm install -g pm2
    fi
fi

echo "Setup finished. Start the worker with: pm2 start ecosystem.config.js"
echo "Enable reboot recovery: pm2 startup (run its printed command), then pm2 save."
echo "Configure Nginx and HTTPS using docs/DEPLOYMENT.md before connecting the backend."
