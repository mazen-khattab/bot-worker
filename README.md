# bot-worker

A Node.js + TypeScript + Playwright automation worker, controlled by a .NET backend over HTTP.

## What this is

- **.NET → Node**: `.NET` calls `POST /api/worker/start` with a job (cookies + leads). This service
  queues it, runs the Playwright automation, and returns `200 OK` immediately (fire-and-forget, like `Task.Run`).
- **Node → .NET**: as the job progresses, this service calls back into the .NET API to report
  per-lead status, job status, and activity logs — with automatic retry and a local fallback
  queue if the .NET API is temporarily unreachable.

## Getting started

```bash
npm install
npx playwright install --with-deps chromium
cp .env.example .env   # fill in real values
npm run dev
```

The dev server runs on `http://localhost:3000` (or `PORT` from `.env`) and hot-reloads via `tsx watch`.

## Project structure

```
src/
├── server.ts                 # entry point: browser init, HTTP listen, graceful shutdown
├── app.ts                    # Express app assembly (helmet, cors, rate-limit, routes)
├── config/env.ts             # zod-validated environment config (fail-fast on startup)
├── utils/logger.ts           # pino logger + per-job correlationId child logger
├── browser/browserManager.ts # singleton Playwright browser, stealth, auto-recovery
├── queue/jobQueue.ts         # p-queue concurrency control + idempotency (dedupe by jobId)
├── services/
│   ├── DotNetApiClient.ts    # calls back to .NET, with retry + Dead Letter Queue fallback
│   ├── dlqSync.ts            # periodically retries failed callbacks from the DLQ file
│   ├── messengerEngine.ts    # the actual Playwright automation, per-lead error isolation
│   └── screenshotCleanup.ts  # daily cleanup of old error screenshots
├── middlewares/
│   ├── auth.ts                # timing-safe X-Worker-Api-Key check
│   └── errorHandler.ts        # global error handler + 404 handler
├── routes/index.ts           # GET /health, POST /start
├── types/index.ts            # shared payload interfaces
└── tests/                    # vitest unit tests (+ one opt-in browser smoke test)
```

## Environment variables

See `.env.example` for the full list with comments. All of them are validated at startup by
`src/config/env.ts` — the process refuses to start if anything required is missing or malformed.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Run with hot-reload (tsx) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled build |
| `npm run start:pm2` | Run under PM2 using `ecosystem.config.js` |
| `npm test` | Run unit tests (fast, no real browser) |
| `npx vitest run src/tests/stealth.smoke.test.ts` | Run the opt-in real-browser stealth smoke test |
| `npm run lint` / `npm run format` | Lint / format the codebase |

## Design notes worth knowing before you extend this

- **One browser process, many contexts.** `browserManager` launches Chromium once; every job gets
  its own isolated `BrowserContext` (cookies injected in-memory only, never written to disk) that is
  always closed, even on error.
- **Concurrency is capped**, not by trusting the .NET side to throttle itself, but by `p-queue`
  (`MAX_CONCURRENT_SESSIONS`) on this side.
- **Idempotency**: duplicate `jobId` submissions (e.g. a .NET-side retry) are detected and ignored.
  The dedupe map is swept hourly so it doesn't grow forever (`IDEMPOTENCY_TTL_HOURS`).
- **Reliability of callbacks to .NET**: `axios-retry` handles transient failures; if the .NET API is
  down entirely, updates are persisted to a local Dead Letter Queue file (`DLQ_FILE_PATH`) and
  re-synced periodically by `dlqSync.ts` — nothing silently vanishes.
- **Stealth caveat**: `puppeteer-extra-plugin-stealth` was built for Puppeteer; not every evasion is
  guaranteed to behave identically on Playwright, and target platforms change their bot detection
  over time. Re-check periodically with the smoke test; consider `patchright` if a target platform
  starts detecting this worker again.
- **Graceful shutdown**: both `SIGTERM` and `SIGINT` drain the job queue and close the browser before
  exiting — PM2 sends `SIGINT` by default on restart, so `ecosystem.config.js` sets `kill_timeout`
  generously to give that sequence time to finish.

## Docker

```bash
docker compose up --build
```

Uses the official `mcr.microsoft.com/playwright` base image so Chromium + all OS dependencies are
already present — no separate `playwright install` step needed in the image.

## Next steps you'll need to do yourself

1. Replace the placeholder selectors in `messengerEngine.ts` (`getByRole('button', { name: /message/i })`,
   etc.) with the real locators for your target platform.
2. Implement the three matching endpoints on the .NET side: `POST /api/worker/lead-status`,
   `POST /api/worker/job-status`, `POST /api/worker/activity-log`.
3. Decide on real values for `WORKER_API_KEY` / `DOTNET_API_KEY` (secrets manager, not `.env` in prod).
"# bot-worker" 
