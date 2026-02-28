# Fuzzy Guacamole Architecture

## 1) Purpose and scope

This document describes the repository's **current implemented architecture** and the **near-term target architecture** captured in [`docs/specs.MD`](./specs.MD).

As of this snapshot, the codebase is a Milestone 1 scaffold:
- React SPA client polling server status
- Fastify API exposing health and status routes
- Shared Zod schema contracts used by both client and server
- ComfyUI API client module with integration tests (not yet wired into API routes)

## 2) Repository layout

Top-level structure:

```text
/
|- src/
|  |- client/       # Vite + React SPA
|  |- server/       # Fastify API + Comfy integration code
|  `- shared/       # Cross-runtime schemas/types
|- docs/            # Product and API reference docs
|- examples/        # Example Comfy workflow JSON payloads
|- dist/            # Build output (client + server)
|- data/            # Runtime-mounted data volume for local/docker usage
`- package.json     # Single package manifest (no workspaces)
```

Import boundary rules (implemented by structure and tsconfig includes):
- `src/client` and `src/server` are separate runtimes
- shared contracts live in `src/shared`
- both sides consume `src/shared/status.ts`

## 3) Runtime architecture

### 3.1 Client runtime (browser)

Key files:
- `src/client/src/main.tsx`
- `src/client/src/App.tsx`
- `src/client/vite.config.ts`

Behavior:
- React app bootstraps under `#root`
- Uses `swr` to poll `GET /api/status`
- Validates API payloads with shared Zod schema before rendering
- Shows loading/error/state info on a simple status card

Networking:
- In dev, Vite proxies `/api/*` to `http://localhost:3000`
- This keeps client code same-origin from browser perspective

### 3.2 Server runtime (Node.js)

Key files:
- `src/server/index.ts`
- `src/server/app.ts`
- `src/server/routes/status.ts`

Behavior:
- Fastify instance created in `buildServer()`
- Exposes:
  - `GET /healthz` -> `{ ok: true }`
  - `GET /api/status` -> typed/validated status payload
- Graceful shutdown on `SIGINT` and `SIGTERM`

Current status semantics:
- Returns `state: "Starting"` with `since` timestamp from server startup
- Response shape is validated with shared Zod schema before send

### 3.3 Shared contract layer

Key file:
- `src/shared/status.ts`

Responsibilities:
- Defines canonical status enum: `Starting | Online | Offline`
- Defines API response schema including optional `lastError` and `comfy` metadata
- Exports TypeScript inferred types for compile-time correctness

This is the first contract that demonstrates the intended pattern: one source of truth for runtime validation + static types.

## 4) Comfy integration module (server-side, in progress)

Key files:
- `src/server/comfy/client.ts`
- `src/server/comfy/client.integration.test.ts`
- `src/server/comfy/__fixtures__/...`

Implemented capabilities:
- Health check via `/api/system_stats`
- Prompt submission with fallback endpoints (`/api/prompt`, `/prompt`)
- Image upload (`/api/upload/image`, `/upload/image`)
- History polling (`/api/history_v2/{prompt_id}`, fallback `/history/{prompt_id}`)
- Interrupt requests (`/api/interrupt`, `/interrupt`)
- Output image download (`/api/view`, `/view`)
- Utility helpers:
  - inject `LoadImage` node input reference
  - deterministic output image extraction from history

Design traits:
- Endpoint fallback supports OSS and API-variant environments
- Zod parsing on external responses
- explicit timeout/poll configuration

Current gap:
- This module is tested but not yet integrated into Fastify generation routes.

## 5) Build, test, and deployment architecture

### 5.1 Toolchain

- Node.js (ESM project, TypeScript)
- Vite for client bundling/dev server
- Fastify for API
- Vitest + Testing Library for tests
- ESLint flat config + Prettier

### 5.2 Build outputs

- Client build -> `dist/client` (from Vite config)
- Server build -> `dist/server` (from `src/server/tsconfig.json`)
- Production start command -> `node dist/server/index.js`

### 5.3 Docker topology

Files:
- `Dockerfile`
- `docker-compose.yml`

Compose services:
- `db`: Postgres 17
- `app`: Node 24 container running `npm run dev`

Mounted volumes:
- repo bind mount (`/app`)
- `/app/node_modules` anonymous volume
- `./data` -> `/data` (for runtime assets/config)

Note:
- Postgres/Drizzle dependencies are present, but DB access is not yet wired into active routes.

## 6) Current request/data flow

### 6.1 Implemented status flow

1. Browser loads React app
2. App polls `GET /api/status` every 5s via SWR
3. Fastify handler returns schema-validated JSON
4. Client validates again with same shared schema
5. UI renders state and timestamp

### 6.2 Implemented Comfy test flow (integration module)

1. Load workflow JSON fixture/template
2. Upload input image to Comfy
3. Inject uploaded reference into `LoadImage` node
4. Submit workflow via prompt endpoint
5. Poll history endpoint until outputs available
6. Select deterministic output and optionally download artifact

## 7) Target architecture (from specs, not fully implemented yet)

Planned major subsystems:
- Config loader for `/data/config.json`
- Preset/workflow templating from `/data/presets`
- Generation API + lifecycle state machine
- Single worker queue for one-at-a-time execution
- SSE stream for generation events
- Remote machine bring-up (WOL + SSH + Comfy readiness polling)
- Persistent generation metadata in Postgres via Drizzle
- Input/output storage under `/data/inputs` and `/data/outputs`

Planned API surface (spec):
- `/api/status`
- `/api/presets*`
- `/api/generations*`
- `/api/events/generations` (SSE)

## 8) Architectural strengths and risks

Strengths:
- Clear runtime split (client/server/shared)
- Shared Zod contracts reduce drift across API boundary
- Comfy client is already defensive and endpoint-compatible
- Build/dev flow is simple and reproducible

Current risks/gaps:
- Main API currently exposes only status/health
- No persistence wiring despite DB dependencies existing
- Comfy client not integrated into server execution paths yet
- Large target scope in spec vs current implementation footprint

## 9) Recommended next implementation slices

1. Add configuration module (`/data/config.json`) with schema validation.
2. Integrate `ComfyClient` into server service layer and expose minimal generation queue route.
3. Introduce generation persistence model and migrations (Drizzle + Postgres).
4. Add SSE generation events endpoint and worker loop.
5. Expand client from status screen to generation list + run controls.
