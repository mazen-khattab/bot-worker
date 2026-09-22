#!/bin/bash

# Exit immediately if any command fails
set -e

echo "=== [1/7] Updating OS Package Lists ==="
sudo apt-get update

echo "=== [2/7] Configuring Node.js Environment via NVM ==="
export NVM_DIR="$HOME/.nvm"
if [ -s "$NVM_DIR/nvm.sh" ]; then
    # Load NVM
    \. "$NVM_DIR/nvm.sh"
    echo "Using NVM... Installing & selecting version from .nvmrc"
    nvm install
    nvm use
elif command -v node &> /dev/null; then
    echo "NVM not found. Continuing with system Node version: $(node -v)"
else
    echo "❌ Error: Neither NVM nor Node.js is installed on this system."
    echo "Please install NVM (https://github.com/nvm-sh/nvm) or Node.js v22+ first."
    exit 1
fi

echo "=== [3/7] Validating Environment File (.env) ==="
if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        echo "⚠️ .env file not found. Creating from .env.example..."
        cp .env.example .env
        echo "⚠️ ACTION REQUIRED: Update .env with real credentials before running the bot!"
    else
        echo "⚠️ Warning: No .env or .env.example found. The bot will fail if env vars are missing."
    fi
fi

echo "=== [4/7] Installing Project Dependencies ==="
npm ci

echo "=== [5/7] Installing Playwright Chromium & OS Dependencies ==="
# Installs Chromium binary and system libraries (libgbm, libnss3, etc.)
npx playwright install --with-deps chromium

echo "=== [6/7] Compiling TypeScript Project ==="
npm run build

echo "=== [7/7] Configuring PM2 & Runtime Directories ==="
if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2 globally..."
    # Do NOT use sudo if NVM is active
    if [ -n "$NVM_BIN" ]; then
        npm install -g pm2
    else
        sudo npm install -g pm2
    fi
fi

# Ensure storage directories exist
mkdir -p screenshots
mkdir -p data

echo "===================================================="
echo " ✅ Setup Completed Successfully!"
echo "===================================================="
echo "Next steps for production:"
echo " 1. Verify your .env file: nano .env"
echo " 2. Start the worker:     npm run start:pm2"
echo " 3. Enable auto-restart on server reboot:"
echo "    pm2 startup"
echo "    (run the sudo command that pm2 outputs, then:)"
echo "    pm2 save"
echo "===================================================="