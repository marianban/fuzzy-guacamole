# Build the v1 Comfy Frontend Orchestrator MVP (LAN-only)

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository already contains the canonical product spec at `docs/specs.MD` and the ExecPlan requirements at `.agent/PLANS.md`. This document must be maintained in accordance with `.agent/PLANS.md` (repo-relative path).

## Purpose / Big Picture

After this work, a user on the LAN can open a simple web UI, pick a preset (img2img or txt2img), optionally upload an input image (img2img), click Generate, and receive exactly one output image produced by a remote ComfyUI machine. The backend transparently ensures the remote machine and ComfyUI are online (Wake-on-LAN + SSH + health polling), runs a single-worker queue, persists generations in Postgres, stores inputs/outputs on disk under `/data`, and supports canceling queued/running jobs. The system is demonstrably working when: (1) `GET /api/status` returns `Online`, (2) presets load from disk, (3) a generation can be created and queued, and (4) a mocked (and later real) ComfyUI flow yields a saved output image visible in the UI.

## Progress

- [x] (2026-01-24) Drafted initial ExecPlan from `docs/specs.MD` and `.agent/PLANS.md`.
- [x] (2026-01-25) Updated ExecPlan to match latest `docs/specs.MD` (txt2img support, SSH/remote start config, `/api/system_stats` readiness).
- [x] (2026-01-25) Updated ExecPlan to match latest `docs/specs.MD` (`/api/history_v2` polling + readiness rules).
- [x] (2026-01-25) Updated ExecPlan to match `docs/specs.MD` (Radix UI + UI layout at the time: prompt in canvas, Generate/Cancel, logs panel).
- [x] (2026-02-01) Updated ExecPlan to match `docs/specs.MD` UI changes (top bar + undo/redo, separate control panel w/ prompt textarea, canvas iteration model, left list thumbnails/createdAt, Delete button).
- [x] (2026-02-07) Reviewed `docs/specs.MD` changes and realigned this plan to the current stack and UI behavior (Vite SPA + Fastify server, before/after compare, selection/composite tool).
- [x] (2026-02-07) Updated ExecPlan to reflect the new project layout in `docs/specs.MD` (`/src/server`, `/src/client`, `/src/shared`).
- [x] (2026-02-08) Synced plan details with current `docs/specs.MD` + `.agent/AGENTS.md` (React Hook Form requirements, testing workflow expectations, and implementation verification notes).
- [x] (2026-02-08) Synced ExecPlan linting details with `docs/specs.MD` (TypeScript-ESLint flat config with strict/stylistic presets plus React Hooks/React plugins).
- [x] (2026-02-22) Synced ExecPlan to current `docs/specs.MD` API contract and client data layer (REST endpoints + SSE events + SWR, replacing outdated tRPC references).
- [x] (2026-02-22) Synced project-structure guidance to a single root `package.json` (no workspaces) and explicit import boundaries (`client`/`server` only share via `src/shared`).
- [x] (2026-02-22) Scaffolded root-package app: Vite React client in `src/client`, Fastify server in `src/server`, shared status contract in `src/shared`, Vitest smoke test, ESLint flat config + Prettier, Dockerfile + `docker-compose.yml`, and `README.md` runbook.
- [x] (2026-02-22) Captured target ComfyUI environment details and locked output persistence policy: ComfyUI `0.8.2`, frontend `v1.36.13`, Manager `V3.39.2`, LAN mode without auth/CSRF, and backend-owned output downloads to `/data/outputs/{generationId}/`.
- [x] (2026-02-22) Locked prompt-template integration details from exported examples: submit as `{ "prompt": workflow }`, treat `examples/prompts/img2img.json` SaveImage node `3` as canonical v1 output, use API upload for img2img input (no manual copy into Comfy input folder), and scope validation to `img2img.json` + `txt2img.json`.
- [x] (2026-02-28) Implemented Comfy client integration test harness in `src/server/comfy/client.integration.test.ts` with dual modes (`COMFY_TEST_MODE=mock|local`), mock fixture replay (`src/server/comfy/__fixtures__/captured/comfy-v0.8.2-contract.json`), and live contract coverage for health/upload/submit/history polling.
- [x] (2026-02-28) Synced ExecPlan with `.agent/AGENTS.md` architecture-doc requirement: maintain `docs/architecture.MD` as a concise, overview-focused current-state document (implemented code only) with embedded Mermaid diagrams.
- [x] (2026-03-01) Synced ExecPlan to latest `docs/specs.MD` preset contract: `1 template : N presets`, `preset.template.json` + `*.preset.json`, required preset `template` reference, `presetId={templateId}/{presetName}`, and generation `templateId`.
- [x] (2026-03-01) Synced ExecPlan to latest `docs/specs.MD` API documentation requirement: all app API endpoints must be documented in the OpenAPI Specification.
- [x] (2026-03-01) Synced ExecPlan to `.agent/AGENTS.md` TDD requirements: strict red-green-refactor flow, explicit fail-first verification, and minimum coverage thresholds.
- [x] (2026-03-01) Synced ExecPlan to updated `.agent/AGENTS.md` post-feature quality gate: focused feature-level tests, required E2E coverage for changed behavior, exploratory testing, and real server/client startup verification.
- [x] (2026-03-01) Implemented first preset slice: validated config loader (`/data/config.json`), preset catalog loader (`/data/presets/{templateId}/preset.template.json` + `*.preset.json`), and Fastify preset routes (`GET /api/presets`, `GET /api/presets/{presetId}` via wildcard path).
- [x] (2026-04-06) Reviewed and updated ExecPlan for the new preset field model: `model.json` now defines localized control-panel fields/categories, workflow placeholders reference `{{fieldId}}`, and runtime-only values like uploaded input-image references remain outside `model.json.fields`.
- [x] (2026-04-06) Synced this ExecPlan to the latest UI docs: recent generations/history now lives in a bottom dock, while `+ New generation` stays in the top-left of the main image area.
- [ ] (YYYY-MM-DD) Implement config + preset loading + REST endpoints (`GET /api/status`, `GET /api/presets`, `GET /api/presets/{presetId}`).
- [ ] (YYYY-MM-DD) Implement Postgres data model, generation endpoints, and filesystem conventions for inputs/outputs.
- [ ] (YYYY-MM-DD) Implement worker loop + ComfyUI client adapter + cancel semantics + persistence of results.
- [ ] (YYYY-MM-DD) Implement UI (top bar + main canvas + right control panel + bottom recent-generations history) + generation creation/queue/upload/cancel + status loader gate.
- [ ] (YYYY-MM-DD) Implement `GET /api/events/generations` SSE stream + UI live updates + integration tests against local ComfyUI (with mock fallback for deterministic CI).
- [ ] (YYYY-MM-DD) Harden edge cases (timeouts, retries, idempotence), polish UX, and document local/dev runbook.

## Surprises & Discoveries

- Observation: `npm install`, `npm run test`, and `npm run build` failed in sandboxed mode because the environment blocked package fetches and esbuild subprocess spawning.
  Evidence: `npm install ...` returned `ENOTCACHED`; `vitest` and `vite build` returned `spawn EPERM`; rerunning with escalated permissions succeeded.
- Observation: Repo-wide lint/format attempted to process `.agent/` and `.agents/` skill assets, which contain template files that are intentionally not valid for this app's linting/parsing rules.
  Evidence: ESLint/Prettier initially failed on `.agents/skills/react-hook-form-zod/templates/*`; adding ignore rules for agent folders made checks deterministic for project source.
- Observation: Target ComfyUI deployment for v1 is confirmed as ComfyUI `0.8.2` + `ComfyUI_frontend v1.36.13` + `ComfyUI-Manager V3.39.2`, running on LAN with no authentication/CSRF.
  Evidence: User-provided environment details captured during planning (2026-02-22).
- Observation: Final output files are backend-owned artifacts and must always be downloaded/saved under `/data/outputs/{generationId}/...`, regardless of ComfyUI internal storage layout.
  Evidence: Product decision confirmed during planning (2026-02-22).
- Observation: Exported prompt templates under `examples/prompts/` are raw workflow graphs and must be wrapped server-side as `{ "prompt": workflow }` before submit.
  Evidence: User confirmation during prompt-template review (2026-02-22).
- Observation: The first img2img template currently includes multiple `SaveImage` nodes; v1 canonical output for `examples/prompts/img2img.json` is node `3` (standard output), while upscaled node `21` is out-of-scope for initial output selection.
  Evidence: User confirmation during prompt-template review (2026-02-22).
- Observation: On the target local ComfyUI instance (`0.8.2`), both `/api/*` and legacy non-`/api` routes respond for key endpoints (`system_stats`, `prompt`, `history`, `interrupt`), so the adapter should keep fallback path support.
  Evidence: Manual probes against `http://127.0.0.1:8188` on 2026-02-28 returned `200` for both route families.

## Decision Log

- Decision: Implement using the root-level `src/` project structure from the spec: `/src/server`, `/src/client`, and `/src/shared`.
  Rationale: Keeps the execution plan aligned with `docs/specs.MD` section 18 and avoids path drift between planning and implementation.
  Date/Author: 2026-02-07 / Codex (GPT-5)
- Decision: Follow the spec's project layout: `/src/server` (backend), `/src/client` (frontend), and `/src/shared` (shared types/utils).
  Rationale: Keeps backend, frontend, and cross-cutting contracts isolated while matching the documented structure for tooling and imports.
  Date/Author: 2026-02-07 / Codex (GPT-5)
- Decision: Use one root `package.json` (no npm workspaces) and enforce import boundaries: `src/client` and `src/server` never import each other directly; any shared contracts must live in `src/shared`.
  Rationale: Matches current spec intent, removes conflicting setup guidance, and keeps coupling explicit and reviewable.
  Date/Author: 2026-02-22 / Codex (GPT-5)
- Decision: Implement the ComfyUI integration behind a typed interface with dual integration-test modes: local ComfyUI as the primary acceptance path and mock ComfyUI as a CI fallback.
  Rationale: v1 acceptance must prove compatibility with the actual installed ComfyUI build, while CI still needs deterministic tests that do not depend on LAN hardware availability.
  Date/Author: 2026-02-28 / Codex (GPT-5)
- Decision: Use Postgres + Drizzle ORM, with migrations generated by drizzle-kit and checked into the repo as `.sql`.
  Rationale: Aligns with `.agent/AGENTS.md` while keeping schema changes explicit and reproducible for novices.
  Date/Author: 2026-01-25 / Codex (GPT-5.2)
- Decision: Use Radix UI (Radix Themes + primitives) for UI components, and use a dark theme by default.
  Rationale: The product spec requires Radix UI and a `<Theme appearance="dark">` wrapper; using Radix consistently keeps accessibility and styling coherent.
  Date/Author: 2026-01-25 / Codex (GPT-5.2)
- Decision: Include img2img before/after compare and region-selection editing in the v1 UI milestone, including blurred-edge compositing for edited regions.
  Rationale: These are now explicitly called out in `docs/specs.MD` and must be reflected in implementation scope and acceptance criteria.
  Date/Author: 2026-02-07 / Codex (GPT-5)
- Decision: Align the app integration contract to REST endpoints plus an SSE events stream, and use SWR on the client for fetching/caching.
  Rationale: `docs/specs.MD` now defines concrete REST routes (`/api/status`, `/api/presets`, `/api/generations`, `/api/events/generations`), so the plan must remove stale tRPC assumptions to avoid implementation drift.
  Date/Author: 2026-02-22 / Codex (GPT-5)
- Decision: Keep the Milestone 1 status flow minimal by exposing a typed `GET /api/status` stub from Fastify and consuming it via SWR in the React shell.
  Rationale: This satisfies Milestone 1 acceptance criteria while establishing the shared client/server contract to evolve in Milestone 2.
  Date/Author: 2026-02-22 / Codex (GPT-5)
- Decision: Exclude `.agent/`, `.agents/`, and docs from lint/format checks for app development commands.
  Rationale: Those folders include instructional/template assets outside runtime code ownership and they create non-actionable failures during normal CI-style checks.
  Date/Author: 2026-02-22 / Codex (GPT-5)
- Decision: Treat backend-persisted files under `/data/outputs/{generationId}/...` as the only canonical generation outputs, even when ComfyUI stores files elsewhere internally.
  Rationale: Keeps product behavior deterministic across Comfy builds and decouples UI/history from Comfy filesystem conventions.
  Date/Author: 2026-02-22 / User + Codex (GPT-5)
- Decision (superseded): Use Postgres with a minimal SQL migration runner checked into the repo.
  Rationale: Avoided heavy ORM lock-in while keeping schema changes explicit and reproducible for novices.
  Date/Author: 2026-01-24 / Codex (GPT-5.2)

## Outcomes & Retrospective

- (2026-02-22) Milestone 1 shipped: project scaffolding, stub status API, client shell, test/lint/format/build scripts, Docker assets, and local runbook. Not shipped yet: runtime config/presets, database schema, worker/comfy integration, SSE updates, and full UI workflow.

## Context and Orientation

Repository state today:

- Repo root now includes a working Milestone 1 scaffold:
  - Root `package.json` with scripts for dev/build/typecheck/test/lint/format.
  - `src/client` Vite React SPA scaffold (status card polling `/api/status` via SWR).
  - `src/server` Fastify server scaffold with `GET /api/status` stub and `GET /healthz`.
  - `src/shared/status.ts` Zod schema + shared status types.
  - Tooling/config files (`vitest.config.ts`, `eslint.config.mjs`, Prettier config, TypeScript configs).
  - Docker assets (`Dockerfile`, `docker-compose.yml`) and root `README.md` runbook.
  - Existing docs in `docs/` and process docs in `.agent/`.

Core domain definitions (use these terms consistently in code and docs):

- Template: A workflow template stored as `/data/presets/<templateId>/preset.template.json`, containing `id`, `type`, and `workflow`.
- Model: A control-panel field model stored as `/data/presets/<templateId>/model.json`, containing `templateId`, localized `categories`, and localized `fields` with validation/control metadata.
- Preset: A variant config stored as `/data/presets/<templateId>/*.preset.json`, containing metadata/default values and required `template` + `model` references.
- Placeholder token: A string like `{{prompt}}` embedded in `preset.template.json` workflow values. For control-panel values, tokens reference `model.json.fields[].id` directly and are replaced with resolved runtime values at queue time.
- Generation: A persisted record representing a configured thing to run. It can be queued and re-run multiple times. In v1, we do not model runs/attempts as a separate table.
- Run: One execution of a generation that produces exactly one output image.
- Statuses: `draft`, `queued`, `submitted`, `completed`, `failed`, `canceled` (as defined in the spec).
- App status state: `Starting`, `Online`, `Offline` (as returned by `GET /api/status`).
- Worker loop: A single background loop that picks the oldest queued generation (by `queuedAt`) and executes it end-to-end, one at a time.
- Wake-on-LAN (WOL): Sending a "magic packet" to wake the remote ComfyUI machine, then polling until ComfyUI is healthy.
- SSE events stream: Live-only updates over `GET /api/events/generations` using `text/event-stream` and browser `EventSource`.

Constraints:

- LAN-only and no auth in v1.
- Exactly one output image per run (no batching).
- Global history only in v1 (no per-user session isolation).
- Persistent runtime data lives under container path `/data`:
  - `/data/config.json` (required)
  - `/data/presets/`
  - `/data/inputs/`
  - `/data/outputs/`

Engineering and workflow expectations (keep this section aligned with `.agent/AGENTS.md`):

- Stack: Node.js 24, Vite + React + TypeScript (classic SPA; no SSR), Fastify REST + SSE + Zod for API contracts, SWR for client data fetching, CSS modules, Radix UI (Radix Themes + primitives), `react-hook-form` + `@hookform/resolvers` for forms, Postgres + Drizzle ORM, Docker.
- Config: file-based only (`/data/config.json`) for Comfy URL, WOL target, SSH connection + remote start command, paths, and timeouts.
- Tooling: Vitest + Testing Library + jsdom; ESLint new flat config format aligned to TypeScript-ESLint (`strict` + `stylistic`) plus `eslint-plugin-react-hooks` flat recommended config and `eslint-plugin-react`; Prettier for formatting.
- Testing: follow TDD strictly for behavior changes (red-green-refactor): write tests first, run them to verify expected failure before implementation, then implement minimal code to pass.
- Testing: implement tests as a separate step, prefer small/deterministic tests, use `@testing-library/react` with user-visible queries + `user-event`, assert outcomes/side effects over implementation details, and name tests `given_when_then` where it fits.
- Testing: add/extend regression tests for every behavior change (bugfixes require a reproducing regression test), keep setup minimal/reset shared state between tests, and run relevant targeted test files for the changed feature locally before marking work done (not only broad full-suite runs).
- Testing: for each new/changed feature, add and run E2E coverage for the same behavior/user flow.
- API docs: maintain an OpenAPI Specification for the app API, and update it whenever any endpoint (REST or SSE) is added/changed so all endpoints are documented.
- During implementation: run relevant tests (preferably fail-first for new behavior), lint, and formatting; then run exploratory tests against the implemented behavior, start the real server and real client locally (`npm run dev:server` and `npm run dev:client`), and verify UI behavior in Chrome Devtools MCP (Console + Network), fixing warnings when they are actionable.
- MCPs: use Context7 for docs when adopting libraries/frameworks; use Chrome Devtools MCP to verify UI; optionally use Wallaby MCP for test status/debugging.
- Skills (when applicable): use `doc-coauthoring` for doc updates, `frontend-design` for frontend design work, and `wallaby-testing` when using Wallaby.
- Architecture docs: whenever code is added/changed, create and maintain `docs/architecture.MD` with clear, concise system-overview content and Mermaid diagrams embedded directly in the Markdown.
- `docs/architecture.MD` is not a planning artifact: it must reflect only the current implemented system, and any future-state/planning content belongs in planning docs (for example this `ExecPlan.md`).

Important ComfyUI API assumptions (must be verified early in implementation and recorded in `Surprises & Discoveries`):

- Target environment confirmed (2026-02-22):
  - ComfyUI `0.8.2`
  - `ComfyUI_frontend v1.36.13`
  - `ComfyUI-Manager V3.39.2`
  - LAN-only deployment without authentication/CSRF
- Required (per spec): readiness/health is determined by `GET /api/system_stats` returning HTTP 200 and including `system` and `devices`.
- Required (per spec): submit prompt via `POST /prompt` and poll via `GET /api/history_v2/{prompt_id}` (fallback: `GET /history/{prompt_id}`).
- Required request payload shape: submit workflows as `{ "prompt": <workflow-json> }` (workflow templates are stored as raw node-graph JSON).
- Required (per spec): treat a run as ready when history contains the `prompt_id` entry and its `outputs` object is non-empty (tolerate `404` / missing `prompt_id` while executing).
- Optional (debugging/timeouts): use `GET /api/queue` to cross-check; if a `prompt_id` leaves the queue but never appears in history before the history timeout, fail with `History timeout`.
- Required output policy: always download exactly one chosen final output image from ComfyUI and persist it to `/data/outputs/{generationId}/...`, regardless of ComfyUI's internal file naming/storage.
- Required for img2img input transfer: upload the source image through Comfy's upload API (`POST /api/upload/image` or OSS-compatible `POST /upload/image` depending on target build), then patch the `LoadImage.inputs.image` value in the workflow with the returned file reference before submit.
- Current preset-specific output rule: for `examples/prompts/img2img.json`, select output from SaveImage node `3` for v1 single-output persistence.

## Plan of Work

This work is large; implement it in milestones so each milestone produces a demonstrably working behavior and can be validated independently. Keep the system usable at every milestone (even if ComfyUI is mocked early).

### Milestone 1: Project scaffold + Dockerized dev environment

Goal: A developer can run the app and database locally, run tests, and hit a placeholder `GET /api/status` endpoint.

Work:

- Create a Vite React TypeScript frontend under `src/client/` using npm:
  - Scaffold client source under `src/client/` while keeping dependency management at the repo root (`package.json` at root only).
  - Run client dev through root scripts (for example, a root `dev:client` script).
- Add a Fastify REST server entrypoint under `src/server/` and run frontend+backend together in dev from root scripts:
  - Frontend source under `src/client/` (SPA).
  - Backend source under `src/server/` (Fastify app, REST routes, SSE endpoint).
  - Shared types/utilities under `src/shared/` consumed by both client and server.
  - Enforce boundaries: no direct `src/client` <-> `src/server` imports; shared contracts live in `src/shared`.
- Add tooling:
  - Vitest + jsdom + Testing Library (`@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`).
  - ESLint + Prettier:
    - ESLint flat config based on TypeScript-ESLint getting-started guidance (`strict` + `stylistic`) with React Hooks flat recommended config and React plugin registration.
    - Prettier formatting (format before marking work complete).
- Add Docker assets at repo root:
  - `docker-compose.yml` with services:
    - `db` (Postgres) with a named volume.
    - `app` (Node 24 image) that runs both frontend and backend dev scripts (or a combined proxy) and mounts `./data` to `/data`.
  - A `Dockerfile` for production build:
    - Build: install dependencies and build client/server from the root package scripts.
    - Run: start the compiled Fastify entrypoint (for example `node src/server/dist/index.js`).
- Add a dev runbook at repo root `README.md` explaining required files and commands.

Acceptance:

- Dev scripts for both client and server run from the root package and you can open the home page in a browser.
- `GET /api/status` returns JSON with one of `Starting|Online|Offline` (stub initially).
- `npm test` runs and reports at least one passing test (a smoke test).

### Milestone 2: Runtime config + presets on disk + status endpoint

Goal: The server loads `/data/config.json`, validates it, and can list presets from `/data/presets`. `GET /api/status` becomes meaningful (Online/Offline/Starting) based on Comfy reachability.

Work:

- Define a config schema and loader in `src/server/config.ts`:
  - Reads JSON from `/data/config.json` (path is configurable via env var for local dev, defaulting to `/data/config.json`).
  - Validates required fields:
    - `comfyBaseUrl` (string URL)
    - `ssh` (object; required to support remote start):
      - `host` (string)
      - `port` (number)
      - `username` (string)
      - `privateKeyPath` (string; typically `/data/ssh/id_ed25519`)
    - `remoteStart` (object; required to support remote start):
      - `startComfyCommand` (string; the exact remote command to start ComfyUI detached)
    - `wol` (mac, broadcast, port)
    - `paths` (presets, inputs, outputs)
    - `timeouts`:
      - `pcBootMs`, `sshPollMs`
      - `comfyBootMs`, `healthPollMs`
      - `historyPollMs`
  - On startup, load once and fail fast with a clear error if invalid/missing.
- Implement preset loading in `src/server/presets.ts`:
  - List directories under `paths.presets`.
  - For each directory (`templateId`), read `preset.template.json`, `model.json`, and `*.preset.json` variants.
  - Validate template shape: `id`, `type` in `{img2img, txt2img}`, `workflow`.
  - Validate model shape: `templateId`, optional localized `categories[]`, and localized `fields[]` with `id`, `fieldType`, `label`, `validation`, `control`, and optional `categoryId`, `description`, `default`, `order`, `visibility`.
  - Validate preset shape: `id`, `name`, `type`, `template`, `model`, `defaults`.
  - Enforce `preset.template` file exists and `preset.type === template.type`.
  - Enforce `preset.model` file exists and resolves to `model.json` in the same folder.
  - Enforce `model.templateId === template.id === templateId`.
  - Enforce every control-panel placeholder token used in `template.workflow` resolves to exactly one `model.json.fields[].id`.
  - Allow runtime-only params such as uploaded input image references to exist outside `model.json.fields`.
  - Enforce `preset.id` format `{templateId}/{presetName}`.
- Implement Fastify REST routes under `src/server/routes/`:
  - `src/server/routes/status.ts`:
    - `GET /api/status` returns at minimum `{ state: "Starting"|"Online"|"Offline", since: string }`.
    - Recommended response shape (per `docs/specs.MD`):
      - `state`: `Starting | Online | Offline`
      - `since`: timestamp for current state
      - `lastError`: optional string
      - `comfy`: optional object populated when `Online` (and optionally best-effort while `Starting`):
        - `comfyuiVersion` (from `/api/system_stats.system.comfyui_version`)
        - `pytorchVersion` (from `/api/system_stats.system.pytorch_version`)
        - `devices[]`: `name`, `type`, `vram_total`, `vram_free` (when provided)
  - `src/server/routes/presets.ts`:
    - `GET /api/presets` returns a list of presets (metadata only, exclude full workflow by default).
    - `GET /api/presets/{presetId}` returns preset metadata + the stored workflow template + resolved `model.json` so the client can render the control panel dynamically.
- Add/update OpenAPI docs for implemented routes:
  - Define `GET /api/status`, `GET /api/presets`, and `GET /api/presets/{presetId}` in the OpenAPI document with response schemas and status codes.
- Implement Comfy health probing (no generation submission yet) in `src/server/comfy/client.ts`:
  - A method `healthCheck(): Promise<{ ok: boolean; systemStats?: unknown }>` that calls `GET {comfyBaseUrl}/api/system_stats` and returns `ok=true` only when HTTP 200 and the payload contains (at minimum) `system` and `devices`.
  - A helper to extract `comfyuiVersion`, `pytorchVersion`, and `devices[]` (best-effort) for `GET /api/status`.
  - Record any differences between the spec and the target ComfyUI build (and the evidence) in `Surprises & Discoveries`.

Acceptance:

- With a valid local `./data/config.json` mounted to `/data/config.json`, the server boots.
- `GET /api/presets` returns presets from `./data/presets`.
- If ComfyUI is unreachable, `GET /api/status` returns `Offline`; if reachable, returns `Online`.

### Milestone 3: Postgres schema + generation CRUD + filesystem layout

Goal: Generations are persisted and visible via API; input files can be uploaded and stored under `/data/inputs/{generationId}/...`.

Work:

- Add Postgres + Drizzle ORM database module:
  - `src/server/db/pool.ts`: create a `pg` `Pool` using `DATABASE_URL`.
  - `src/server/db/index.ts`: create and export a typed `db` using `drizzle-orm/node-postgres`.
- Define a Drizzle schema in `src/server/db/schema.ts` with a `generations` table matching the spec.
- Add migrations using drizzle-kit:
  - Add `drizzle.config.ts` pointing at `src/server/db/schema.ts` and outputting SQL migrations to `src/server/db/migrations/`.
  - Generate and commit an initial migration (expected name like `0000_*.sql`) that creates the `generations` table.
  - Add `src/server/db/migrate.ts` that runs the Drizzle migrator over `src/server/db/migrations/` at server boot in dev, and as a separate command in prod (document the exact command in Concrete Steps once implemented).
- The `generations` table must contain (as per `docs/specs.MD`):
  - `id uuid primary key`
  - `status text not null`
  - `queued_at timestamptz null`
  - `prompt_request jsonb null`
  - `prompt_response jsonb null`
  - `preset_id text not null`
  - `template_id text not null`
  - `preset_params jsonb not null`
  - `error text null`
  - `created_at timestamptz not null default now()`
  - `updated_at timestamptz not null default now()`
- Implement generation store `src/server/generations/store.ts`:
  - CRUD functions using Drizzle.
  - Update `updated_at` on changes.
- Implement generation REST endpoints:
  - `src/server/routes/generations.ts`:
    - `POST /api/generations` creates a generation with `status=draft`, `presetId`, `templateId`, `presetParams` (seed mode, prompt, etc.).
    - `GET /api/generations` lists generations newest-first.
    - `GET /api/generations/{generationId}` returns a single generation detail.
    - `POST /api/generations/{generationId}/input` accepts `multipart/form-data` upload for img2img input.
    - `POST /api/generations/{generationId}/input` stores files at `/data/inputs/{generationId}/original/{filename}` (create dirs).
    - `POST /api/generations/{generationId}/input` persists the stored path (or a stable internal reference) into `presetParams.inputImagePath` (exact semantics will be finalized when Comfy upload semantics are confirmed).
    - `POST /api/generations/{generationId}/queue` transitions `draft|canceled|completed|failed -> queued` and sets `queuedAt=now()`.
    - `POST /api/generations/{generationId}/queue` validates placeholder tokens: after placeholder expansion (see next milestone), no unreplaced tokens remain.
    - `POST /api/generations/{generationId}/cancel` and `DELETE /api/generations/{generationId}` are implemented in later milestones when the worker exists (but can return meaningful 409/400 errors now).
- Add/update OpenAPI docs for generation routes:
  - Define all generation REST endpoints in the OpenAPI document, including request bodies (`multipart/form-data` for input upload), response schemas, and transition/error status codes.

Acceptance:

- You can create a generation via `POST /api/generations` and see it in `GET /api/generations`.
- Uploading an input image stores a file under `/data/inputs/<id>/original/`.
- Queueing transitions status to `queued` and sets `queuedAt`.

### Milestone 4: Placeholder expansion + worker loop + ComfyUI submission/polling

Goal: The worker processes queued generations one at a time and produces a saved output image under `/data/outputs/{generationId}/...`. Cancellation works for queued and submitted states.

Work:

- Implement placeholder expansion in `src/server/workflows/expandPlaceholders.ts` exactly as specified in `docs/specs.MD`:
  - Load selected `*.preset.json`, resolve `preset.template` and `preset.model`, then load `preset.template.json` and `model.json` as JSON.
  - Resolve control-panel values using field ids from `model.json` plus preset defaults and user-entered params.
  - Recursively walk `template.workflow` values.
  - For strings:
    - If the entire string equals a token, replace with the raw value (so numbers/booleans can remain typed).
    - If token appears within a larger string, replace with the stringified value.
  - Use direct `{{fieldId}}` references for control-panel placeholders instead of a template-level placeholder map.
  - Support runtime-only params such as uploaded input image references outside `model.json.fields`.
  - Validation: fail queueing if any control-panel placeholder token in template workflow has no matching field definition or no resolved value, if preset/template/model types mismatch, or if preset template/model files are missing.
- Implement a worker in `src/server/worker/worker.ts`:
  - A single loop that wakes periodically (or is event-driven) to find the oldest queued generation.
  - Transition `queued -> submitted` at the moment it is handed to ComfyUI.
  - Transition `submitted -> completed|failed|canceled` based on outcomes.
  - Check cancellation before each step (upload, submit, poll, fetch output).
- Implement WOL + SSH + ensure-online in `src/server/comfy/ensureOnline.ts`:
  - Must be idempotent: if ComfyUI is already healthy (per `GET /api/system_stats`), do not start a new instance.
  - Must be concurrency-safe: multiple callers share the same in-flight bring-up attempt (single-flight).
  - Bring-up flow (v1, per `docs/specs.MD`):
    1. Send WOL packet.
    2. Poll until the remote machine is reachable via SSH (successful auth + can run a trivial command), up to `timeouts.pcBootMs`, polling every `timeouts.sshPollMs`.
    3. Start ComfyUI on the remote machine via SSH by running `remoteStart.startComfyCommand` detached from the SSH session.
    4. Poll ComfyUI readiness via `GET /api/system_stats` until success or timeout `timeouts.comfyBootMs`, polling every `timeouts.healthPollMs`.
  - Surface failure as a generation error (and surface a human-readable cause in `lastError` for `GET /api/status`).
- Implement ComfyUI adapter `src/server/comfy/client.ts` with methods:
  - `submitPrompt(workflow: unknown): Promise<{ promptId: string; request: unknown; response: unknown }>`
    - Uses `POST /prompt` per spec, with request payload shape `{ "prompt": workflow }`.
  - `pollHistory(promptId: string): Promise<HistoryPayload>`
    - Uses `GET /api/history_v2/{promptId}` (fallback: `GET /history/{promptId}`) per spec; treat `404`/missing `promptId` as not-ready; ready when the `outputs` object is non-empty.
  - `interrupt(): Promise<void>`
    - Attempts to stop current execution for cancellation (verify endpoint and record evidence).
  - `uploadInputImage(filePath: string): Promise<{ comfyImageRef: string }>` (required for img2img)
    - Use Comfy upload API (`POST /api/upload/image` or OSS-compatible `POST /upload/image`), then patch `LoadImage.inputs.image` in the workflow to the returned reference; do not rely on manual file copies to Comfy's `input/` folder.
- Add a dedicated Comfy adapter integration-test harness in `src/server/comfy/client.integration.test.ts`:
  - Support `COMFY_TEST_MODE=local|mock` (default `mock`).
  - For `local` mode, require `COMFY_BASE_URL` and run only when `COMFY_RUN_LOCAL_TESTS=1` is set.
  - Use a capture-and-replay fixture flow for mocks:
    - First run the adapter suite against local ComfyUI and capture sanitized request/response fixtures.
    - Store fixtures under `src/server/comfy/__fixtures__/captured/` (JSON only; no binary image blobs).
    - In `mock` mode, replay those captured fixtures so CI behavior mirrors the real instance contract.
    - Refresh fixtures only when ComfyUI contract changes, and record the refresh date/version in `Surprises & Discoveries`.
  - Keep tests serial (`--pool=threads --poolOptions.threads.maxThreads=1` or equivalent) because v1 worker/queue is single-flight and local Comfy resources are shared.
  - Validate the actual adapter contract end-to-end:
    - `healthCheck` succeeds from `GET /api/system_stats`.
    - `uploadInputImage` returns a usable Comfy image reference for `LoadImage.inputs.image`.
    - `submitPrompt` returns `promptId` from `POST /prompt`.
    - `pollHistory` reaches ready state with non-empty `outputs`.
    - Output metadata/references can be derived from history deterministically (for `img2img.json`, SaveImage node `3`).
  - Keep the adapter filesystem-agnostic: it does not write local output files; persistence is handled by worker/app orchestration.
- Define how outputs are found and saved:
  - Parse the history payload and choose exactly one output image (first deterministic rule).
  - For the initial `examples/prompts/img2img.json` preset, select the output associated with SaveImage node `3` as the deterministic rule.
  - Download it from ComfyUI (verify endpoint) and write to `/data/outputs/{generationId}/<timestamp>_<filename>`.
- Implement retries per spec:
  - One retry for transient network/timeouts during upload/submit/poll.
  - No retry for validation errors or explicit Comfy execution errors.
- Implement cancellation:
  - `POST /api/generations/{generationId}/cancel` behavior:
    - `queued -> canceled` immediately.
    - `submitted -> attempt interrupt -> canceled` on success; `failed` if cancellation cannot be confirmed.
  - Ensure the worker honors cancellations by checking generation status between steps.

Acceptance:

- With local ComfyUI configured (`COMFY_RUN_LOCAL_TESTS=1`), integration tests prove queueing a generation results in:
  - DB status progression `queued -> submitted -> completed`.
  - Output file created under `/data/outputs/{generationId}/...`.
- With mock ComfyUI configured, the same lifecycle suite passes deterministically in CI without LAN dependencies.
- Canceling a queued generation results in status `canceled` and the worker never submits it.
- Canceling a running generation causes the worker to stop and mark it `canceled` (or `failed` with a clear error if interrupt is not supported).

### Milestone 5: UI MVP + SSE live updates + full-page loader gate

Goal: The UI matches the v1 layout and can drive the full lifecycle: create generation, upload (img2img), queue, see output, cancel, re-run.

Work:

- UI layout in `src/client/App.tsx` (or equivalent root layout):
  - Top bar: logo + Undo/Redo buttons.
    - Include before/after behavior for img2img: hover temporarily shows original input, and click toggles an interactive split-view divider for direct comparison.
    - Include a selection tool for img2img region edits: selected region is edited and composited back into the base image with blurred edges to avoid hard seams.
    - Undo/Redo should apply to the user's local "draft editing" history: prompt text plus the currently staged image in the canvas (input/output) so undo restores both together.
  - Control panel:
    - Preset dropdown.
    - Dynamically rendered categories and fields from `model.json`.
    - Localized labels/descriptions/placeholders/options resolved from the active locale.
    - Conditional field visibility driven by field metadata (for example seed only when `seedMode=fixed`).
    - Actions: Generate (also used for re-runs), Cancel, Delete.
    - Logs panel at the bottom.
    - Build forms with `react-hook-form` and `@hookform/resolvers` using Zod schemas for validation.
  - Canvas (fills remaining space):
    - A `+ New generation` button anchored at the top-left of the main image area (client-only draft; does not hit the backend).
    - img2img: single input drop zone; after generation shows output image; in edit mode allow iterating output -> new input (input -> output -> input...).
    - txt2img: shows output image after generation.
  - Bottom history dock:
    - Recent generations list (latest first), each with a 128x128 thumbnail (output or placeholder) and a created-at timestamp (relative for recent items; after ~1 week show an absolute date).
    - Selecting an item loads that generation into the main workspace; rerun/delete affordances remain available from the active generation context.
  - Use Radix Themes for base UI components and wrap the app in `<Theme appearance="dark">...</Theme>` so the default appearance is dark.
- Implement client data fetching:
- Use SWR fetchers for API calls.
- Load `GET /api/status` and show a full-page loader until state is `Online`.
- Load `GET /api/presets` and `GET /api/generations`.
- Implement user flows:
  - "+ New generation" creates a client-only draft state.
  - Generate:
    - `POST /api/generations`
    - If img2img: `POST /api/generations/{generationId}/input`, then `POST /api/generations/{generationId}/queue`
    - If txt2img: `POST /api/generations/{generationId}/queue`
  - Selected generation:
    - Output preview is shown in the center canvas.
    - Logs are shown at the bottom of the control panel.
    - Cancel is available only when queued/submitted; re-run uses the same Generate button (it re-queues the same generation id).
  - Delete:
    - If the selected generation is client-only, delete clears it from client state.
    - If the selected generation is server-backed, delete calls `DELETE /api/generations/{generationId}` and returns the UI to a fresh client-only draft.
- Implement SSE events:
  - `src/server/routes/events.ts`:
    - `GET /api/events/generations` emits generation status updates (wired from backend events) over SSE transport.
    - Use an in-memory pub/sub (e.g. EventEmitter) fed by the worker and by route transitions.
  - UI subscribes using `EventSource` and updates list/detail without manual refresh.
- Add/update OpenAPI docs for SSE:
  - Document `GET /api/events/generations` in OpenAPI with `text/event-stream` response semantics and event payload shape used by the UI.

Acceptance:

- You can use the app entirely in the browser to:
  - Wait for Online gate, select a preset, set prompt in the control panel, upload input (img2img), click Generate, and see an output.
  - Use Undo/Redo to step through prompt+canvas history while iterating on a generation draft.
  - Use img2img before/after compare (hover preview and click-to-split mode) and region selection editing with blended-edge compositing.
  - Cancel while queued/submitted and observe status update live.
  - Re-run a completed generation and get a new output file.

## Concrete Steps

All commands below are run from the repo root unless specified.

1) Scaffold the root-package app layout (single `package.json`):
    mkdir -p src/shared src/server
    npm init -y
    # keep package.json at repo root only (no workspaces, no nested package.json files)
    # scaffold Vite React TS source into src/client while preserving root dependency management
    # add root scripts (e.g., dev:client, dev:server, dev) to run both app parts

Expected: the dev server starts and prints a local URL (record the port used in this plan once known).

IMPORTANT: follow the spec layout under `src/` with `client/`, `server/`, and `shared/` using one root package. Enforce boundaries so `client` and `server` only share through `src/shared` via relative imports.

2) Add test tooling (frontend):

    npm add -D vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
    npm add react-hook-form @hookform/resolvers zod

Expected: `npm test` (after adding a config and at least one test) reports passing.

2b) Add Postgres + ORM tooling (backend):

    npm add pg drizzle-orm
    npm add -D drizzle-kit

3) Create a local runtime data directory (host) and mount to `/data` in Docker:

    mkdir data
    mkdir data/ssh
    mkdir data/presets
    mkdir data/inputs
    mkdir data/outputs

Place your SSH private key at `data/ssh/id_ed25519` so it is mounted into the container at `/data/ssh/id_ed25519` (or update `ssh.privateKeyPath` accordingly).

Create `data/config.json` with the shape from `docs/specs.MD` (example, adjust IP/MAC):

    {
      "comfyBaseUrl": "http://192.168.0.X:8188",
      "ssh": {
        "host": "192.168.0.X",
        "port": 22,
        "username": "windows-user",
        "privateKeyPath": "/data/ssh/id_ed25519"
      },
      "remoteStart": {
        "startComfyCommand": "cmd /c start \"\" /b \"E:\\\\comfyui\\\\ComfyUI-Easy-Install\\\\run_nvidia_gpu_SageAttention.bat\""
      },
      "wol": { "mac": "AA:BB:CC:DD:EE:FF", "broadcast": "192.168.0.255", "port": 9 },
      "paths": { "presets": "/data/presets", "inputs": "/data/inputs", "outputs": "/data/outputs" },
      "timeouts": {
        "pcBootMs": 180000,
        "sshPollMs": 2000,
        "comfyBootMs": 180000,
        "healthPollMs": 2000,
        "historyPollMs": 1000
      }
    }

4) Run with Docker Compose (once authored):

    docker compose up --build

Expected: Postgres is reachable, app starts, and `GET /api/status` responds.

## Validation and Acceptance

Acceptance is behavioral and must be provable without reading code:

- Status:
  - `GET /api/status` returns JSON with `state` in `{ "Online", "Offline", "Starting" }` and a `since` timestamp.
  - When `Online`, it also returns best-effort `comfy` fields derived from `GET {comfyBaseUrl}/api/system_stats` (`comfyuiVersion`, `pytorchVersion`, `devices[]`).
- Presets:
  - Place one template folder at `/data/presets/img2img-basic/` with `preset.template.json`, `model.json`, and at least one preset variant (for example `basic.preset.json`).
  - `GET /api/presets` returns an entry with `id=img2img-basic/basic`.
  - `GET /api/presets/{presetId}` returns the resolved template plus the resolved `model.json`.
- Generations:
  - `POST /api/generations` returns a new `id` and status `draft`.
  - `POST /api/generations/{generationId}/queue` transitions it to `queued`.
  - Worker transitions it through `submitted` to `completed` and writes exactly one output file under `/data/outputs/:id/`.
- Cancel:
  - If status is `queued`, cancel immediately sets `canceled` and the worker never submits.
  - If status is `submitted`, cancel interrupts remote execution (or clearly fails with an error) and results in `canceled` (or `failed` with explicit reason).
- UI:
  - Home page shows a blocking loader until `GET /api/status` is Online.
  - Generations list updates via `GET /api/events/generations` (SSE transport) when statuses change.
  - Completed generations show output preview and allow re-run.
  - For img2img, before/after compare and region selection edit/composite behavior are functional and visually consistent.
- OpenAPI documentation:
  - Every app API endpoint listed in `docs/specs.MD` section 13 is present in the OpenAPI document.
  - OpenAPI includes request/response schemas and expected status/error codes for each endpoint, including `text/event-stream` details for SSE.

Tests (minimum bar):

- Unit tests for placeholder expansion (token replacement and validation).
- Integration tests for generation lifecycle and Comfy adapter contract in two modes:
  - Local acceptance mode (`COMFY_RUN_LOCAL_TESTS=1 COMFY_TEST_MODE=local`) communicates with the installed ComfyUI instance and must pass before milestone sign-off.
  - Mock mode (`COMFY_TEST_MODE=mock`) replays fixtures captured from local mode and remains required for deterministic CI coverage.
  - Example local run command (PowerShell): ``$env:COMFY_RUN_LOCAL_TESTS='1'; $env:COMFY_TEST_MODE='local'; npm run test -- src/server/comfy/client.integration.test.ts``.
  - Example CI/mock command: ``$env:COMFY_TEST_MODE='mock'; npm run test -- src/server/comfy/client.integration.test.ts``.
  - Fail before implementation, pass after.
- UI tests for key interactions (create draft, select preset, generate disabled/enabled states, cancel button visibility).
- For each new behavior change, add/extend tests in a separate step, run focused tests for the changed feature (not only broad full-suite runs), and, when practical, make the new test fail before implementation.
- For each new/changed feature, add and run E2E tests that capture the same user flow end-to-end.
- After tests/lint/format pass for a feature, run exploratory testing and verify both real app processes start cleanly (`npm run dev:server` and `npm run dev:client`) with no blocking runtime errors in logs, browser console, or network traffic.
- Coverage thresholds for `npm run test:coverage` must meet minimums:
  - lines: 75%
  - functions: 75%
  - branches: 65%
  - statements: 75%
- Any intentional coverage gaps must be documented with a short rationale in implementation notes/PR notes.

## Idempotence and Recovery

- All API operations should be safe to retry:
  - Uploading input should either overwrite a known path or create a deterministic per-generation file; document which and why.
  - Queueing a non-queued generation should be rejected with a clear error, unless it is an allowed transition (re-run).
- Worker crash/restart:
  - On startup, the worker should detect `submitted` generations and mark them `failed` (v1 crash recovery is out of scope) or attempt a best-effort reconciliation; choose one approach, document it here, and implement consistently.
- Cancellation race conditions:
  - If cancel arrives while transitioning `queued -> submitted`, define the winner deterministically (e.g. cancel wins if observed before submit call; otherwise interrupt path).

## Artifacts and Notes

During implementation, capture short evidence snippets here (indented) such as:

- Example request/response transcript for `GET /api/status`.
- Example of a completed generation JSON.
- A short log line sequence showing worker progression.
- The exact ComfyUI endpoints confirmed in the target environment.

Current evidence:

- Target ComfyUI environment for this plan (2026-02-22):
    ComfyUI 0.8.2
    ComfyUI_frontend v1.36.13
    ComfyUI-Manager V3.39.2
    Authentication/CSRF: disabled (LAN-only)
- Output persistence policy confirmed (2026-02-22):
    Backend always downloads and saves final outputs to `/data/outputs/{generationId}/...` regardless of Comfy-side storage layout.
- Prompt-template mapping decisions confirmed (2026-02-22):
    Workflow templates from `examples/prompts/*.json` are submitted as `{ "prompt": workflow }`.
    For `examples/prompts/img2img.json`, v1 canonical output is SaveImage node `3` (ignore node `21` for initial release).
    Img2img input is uploaded through Comfy upload API and injected into `LoadImage.inputs.image` (no manual copy to Comfy input dir).
- Preset/template packaging decision confirmed (2026-03-01):
    Presets are variants under a template folder: `/data/presets/{templateId}/preset.template.json` + `*.preset.json`.
    Presets must include `template` and use `id={templateId}/{presetName}`.
    `model.json` defines shared localized control-panel fields/categories for all presets in that folder.
    Workflow placeholders for control-panel values reference `{{fieldId}}` directly.
    Runtime-only values such as uploaded input image references remain outside `model.json.fields`.
- Current prompt-validation scope (2026-02-22):
    `examples/prompts/img2img.json` and `examples/prompts/txt2img.json`.
- Validation commands (2026-02-22):
    npm run typecheck  -> pass
    npm run lint       -> pass
    npm run format     -> pass
    npm run test       -> 1 passed
    npm run build      -> client+server build pass
- `GET /api/status` verified against running built server:
    {
      "state": "Starting",
      "since": "2026-02-22T10:11:22.857Z"
    }
- Local Comfy endpoint probes on 2026-02-28:
    GET `http://127.0.0.1:8188/api/system_stats` -> 200
    GET `http://127.0.0.1:8188/system_stats` -> 200
    GET `http://127.0.0.1:8188/api/prompt` -> 200
    GET `http://127.0.0.1:8188/prompt` -> 200

## Interfaces and Dependencies

Required libraries/tech:

- Node.js 24, TypeScript.
- Vite React SPA (`src/client`) plus Fastify REST/SSE server (`src/server`) with Zod validation and SWR on the client.
- Radix UI for UI components, using Radix Themes for theming and wrapping the app in `<Theme appearance="dark">...</Theme>`.
- `react-hook-form` + `@hookform/resolvers` for client form handling and schema-based validation.
- Postgres + Drizzle ORM (with `pg` driver), with migrations stored in-repo as `.sql`.
- Vitest + Testing Library for regression coverage.

Key internal interfaces to define:

- `ComfyClient` (in `src/server/comfy/client.ts`):
  - `healthCheck()`
  - `submitPrompt(workflow)`
  - `pollHistory(promptId)`
  - `uploadInputImage(filePath)` (if required)
  - `interrupt()`
- `GenerationStore` (in `src/server/generations/store.ts`):
  - `create`, `get`, `list`, `updateStatus`, `setError`, `setPromptRequest/Response`, etc.
- `Worker` (in `src/server/worker/worker.ts`):
  - `start()` called on server boot; single concurrency; cancellation-aware.

Plan change note:

- (2026-01-24) Initial plan authored; ComfyUI upload/interrupt/view endpoints are called out as assumptions to verify early and then lock down in `Surprises & Discoveries` and the Comfy adapter.
- (2026-01-24) Synced this ExecPlan with `.agent/AGENTS.md` so engineering expectations (tooling, lint/format, test conventions, MCP usage) and npm commands are consistent across repo docs.
- (2026-01-25) Updated this ExecPlan to reflect `.agent/AGENTS.md` changes: Postgres uses Drizzle ORM, config is explicitly file-based (`/data/config.json`), and the documented skills to use are captured in Engineering and workflow expectations.
- (2026-01-25) Updated this ExecPlan to reflect `docs/specs.MD` changes: txt2img is in-scope for v1, `config.json` includes SSH + remote start, and readiness/`/api/status` are based on `GET /api/system_stats` with a WOL+SSH bring-up flow.
- (2026-01-25) Updated this ExecPlan to reflect `docs/specs.MD` changes: ComfyUI polling uses `GET /api/history_v2/{prompt_id}` with `/history/{prompt_id}` fallback and explicit readiness rules.
- (2026-01-25) Updated this ExecPlan to reflect `docs/specs.MD` UI at the time: Radix UI requirement, prompt editor placement in the center panel, and the right-side control/log layout (Generate/Cancel + logs at bottom).
- (2026-02-01) Updated this ExecPlan to reflect `docs/specs.MD` UI changes: top bar (logo + undo/redo), separate control panel (includes prompt textarea + Delete), canvas iteration model (img2img input->output->input), and richer generation list items (thumbnail + createdAt formatting).
- (2026-04-06) Updated this ExecPlan to reflect the latest UI docs: recent generations/history moved from the left panel to a bottom dock, while `+ New generation` remains in the top-left of the main image area.
- (2026-02-07) Updated this ExecPlan to reflect the `docs/specs.MD` stack at that time: Vite React SPA + Fastify/tRPC/Zod backend (not TanStack Start), plus v1 UI scope for img2img before/after comparison and region selection with blurred-edge compositing.
- (2026-02-07) Updated this ExecPlan to reflect `docs/specs.MD` section 18 project structure: root `src/` layout with `src/server`, `src/client`, and `src/shared`.
- (2026-02-08) Updated this ExecPlan to reflect latest `docs/specs.MD` + `.agent/AGENTS.md`: explicit `react-hook-form` + resolver usage for forms, test-first/separate-step expectations, and Chrome Devtools validation requirements after implementation.
- (2026-02-08) Updated this ExecPlan to reflect `docs/specs.MD` linting changes: ESLint new flat config should follow TypeScript-ESLint (`strict` + `stylistic`) with `eslint-plugin-react-hooks` flat config and `eslint-plugin-react` integration.
- (2026-02-08) Updated this ExecPlan to reflect `docs/specs.MD` API changes at the time: app-facing API was documented as tRPC procedures/subscriptions.
- (2026-02-22) Updated this ExecPlan to reflect current `docs/specs.MD`: app-facing API is REST (`/api/status`, `/api/presets`, `/api/generations`, `/api/generations/{id}/...`) plus live-only SSE at `GET /api/events/generations`, and the client data layer uses SWR.
- (2026-02-22) Updated this ExecPlan to remove workspace-based setup guidance and align to the spec's single-root `package.json` rule with strict `client`/`server` import boundaries via `src/shared`.
- (2026-02-22) Started implementation and recorded Milestone 1 completion evidence, including scaffolded project files, verification commands, and execution-environment discoveries (sandbox/esbuild constraints and lint/format scope decisions).
- (2026-02-22) Recorded confirmed target ComfyUI versions (`0.8.2`, frontend `v1.36.13`, Manager `V3.39.2`), LAN no-auth/no-CSRF mode, and locked the output-storage rule to always persist downloaded outputs under `/data/outputs/{generationId}/`.
- (2026-02-22) Locked prompt-template integration details from `examples/prompts/`: submit as `{ "prompt": workflow }`, upload img2img inputs through Comfy API (no manual input-dir copy), use SaveImage node `3` as canonical v1 img2img output, and keep initial validation scope to `img2img.json` + `txt2img.json`.
- (2026-02-28) Updated this ExecPlan to reflect `.agent/AGENTS.md` documentation changes: code changes must keep `docs/architecture.MD` up to date as a concise overview-level architecture record of implemented code only, with Mermaid diagrams embedded directly in the file.
- (2026-03-01) Updated this ExecPlan to reflect latest `docs/specs.MD` preset model: `1:N` template-to-preset relationship, `preset.template.json` + `*.preset.json` on disk, required preset `template` reference, `presetId={templateId}/{presetName}`, and `templateId` persisted on generations.
- (2026-03-01) Updated this ExecPlan to reflect latest `docs/specs.MD` API requirement: all REST and SSE app endpoints must be documented in the OpenAPI Specification.
- (2026-03-01) Updated this ExecPlan to reflect `.agent/AGENTS.md` testing requirements: strict fail-first TDD flow, outcome-focused tests, required regression tests for bugfixes, and explicit coverage thresholds.
- (2026-03-01) Updated this ExecPlan to reflect `.agent/AGENTS.md` post-feature quality-gate requirements: focused feature-level test execution, mandatory E2E coverage for changed behavior, exploratory testing, and clean startup verification for real server/client processes.
- (2026-04-06) Updated this ExecPlan to reflect the latest `docs/specs.MD` preset field contract: `model.json` now owns localized control-panel categories/fields, control-panel workflow placeholders use direct `{{fieldId}}` references, preset details must expose the resolved model, and runtime-only values such as uploaded input-image references stay outside `model.json.fields`.
