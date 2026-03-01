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
- `npm run test`: run Vitest tests
- `npm run lint`: run ESLint (flat config)
- `npm run format`: check Prettier formatting
- `npm run format:write`: apply Prettier formatting
- `npm run typecheck`: run TypeScript checks for client and server

## Docker Dev

The compose stack starts:

- `db`: Postgres 17
- `app`: Node 24 container running `npm run dev`

Run:

- `docker compose up --build`

Client URL:

- `http://localhost:5173`

API URL:

- `http://localhost:3000/api/status`

The `app` service mounts `./data` into `/data` for runtime assets.
