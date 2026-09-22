# ---- Build stage ----
FROM mcr.microsoft.com/playwright:v1.47.0-jammy AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Runtime stage ----
# Official Playwright image already includes Chromium + all OS-level
# dependencies, so we don't have to install/debug them ourselves.
FROM mcr.microsoft.com/playwright:v1.47.0-jammy AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist

# Persist these across container restarts via bind mounts / volumes in your
# docker-compose / orchestrator config.
RUN mkdir -p /app/data /app/screenshots

EXPOSE 3000
CMD ["node", "dist/server.js"]
