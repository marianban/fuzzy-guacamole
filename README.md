# Comfy Frontend Orchestrator

Milestone 1 scaffold for the LAN-only Comfy Frontend Orchestrator.

## Requirements

- Node.js 24+
- npm 11+
- Docker + Docker Compose (optional for containerized dev)

## Quick Start (Local)

1. Install dependencies:
   - `npm install`
2. Run both services in dev mode:
   - `npm run dev`
3. Open the client:
   - `http://localhost:5173`
4. Check API status endpoint:
   - `http://localhost:3000/api/status`

Expected `/api/status` response shape:

```json
{
  "state": "Starting",
  "since": "2026-02-22T10:00:00.000Z"
}
```

## Scripts

- `npm run dev`: run Fastify API + Vite client together
- `npm run build`: build client and server into `dist/`
- `npm run start`: run compiled server from `dist/server/index.js`
- `npm run test` or `npm run test:unit`: run unit tests (memory/mocked dependencies)
- `npm run test:e2e`: run end-to-end tests against local API + local ComfyUI
- `npm run lint`: run ESLint (flat config)
- `npm run format`: check Prettier formatting
- `npm run format:write`: apply Prettier formatting
- `npm run typecheck`: run TypeScript checks for client and server

Local e2e prerequisites:
- Start the local API server (`npm run dev:server` or equivalent).
- Ensure at least one preset exists under `data/presets` (a default `img2img-basic/basic` is included).
- Start local ComfyUI at `COMFY_BASE_URL` (defaults to `http://127.0.0.1:8188`).

## Configuration Strategy

- Commit `data/config.json` so the full configuration structure is always visible in git.
- Use `ENV:VARIABLE_NAME` tokens in `data/config.json` for sensitive or deployment-specific values.
- Set those variables in `.env` for local development and through environment variables in deployments.
- Keep `.env.example` committed as the contract of required variables.
- `CONFIG_PATH` must be set (default local value in `.env.example` is `./data/config.json`).

## Docker Dev

Local development now starts Postgres automatically when you run the server:

- `npm run dev` (or `npm run dev:server`)

That command runs `docker compose -f docker-compose.dev.yml up -d --wait db` before the API starts.
When server process exits, it runs `docker compose -f docker-compose.dev.yml down`.

### Postgres Env Variables

Set in `.env` (see `.env.example`):

- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_DB`
- `POSTGRES_PORT`
- `DATABASE_URL`

### Persistence Strategy

Two options are supported:

1. Reset DB on server stop (`DEV_DB_RESET_ON_STOP=1`)
2. Keep data in local Docker volume (`DEV_DB_RESET_ON_STOP=0`, default)

Tradeoff summary:

1. Reset mode gives a clean DB every run and avoids stale data, but startup workflows take longer because you lose all data.
2. Volume mode is faster and keeps local state between runs, but can accumulate stale schema/data and may require occasional manual cleanup.
