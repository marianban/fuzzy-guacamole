# ExecPlans

When writing complex features or significant refactors, use an ExecPlan (as described in `.agent/PLANS.md`) from design to implementation.

# Comfy Frontend Orchestrator

This repo currently contains the product specification and agent workflow docs for a LAN-hosted "single-image img2img" UI that orchestrates a remote ComfyUI instance.

## Documentation

- Specs live in `docs/`. Start with `docs/specs.MD`.
- Agent process docs live in `.agent/`.


## Product Snapshot (v1)

- LAN-only web app, no auth.
- One generation = one input image -> one output image (no batching).
- "Presets" are exported ComfyUI workflows stored on disk as bundles:
  - `/data/presets/<preset-id>/workflow.json`
  - `/data/presets/<preset-id>/preset.json`
- Backend transparently ensures the remote ComfyUI machine is online (Wake-on-LAN + polling).
- UI shows a full-page loader until the system is ready.
- Cancel is per-generation and must stop ComfyUI execution.

## Expected Tech Stack

- Node.js 24
- TanStack Start, React, TypeScript
- CSS modules
- Postgres
- Containerized (Docker); NAS-agnostic

## Runtime Data & Configuration

Persistent runtime data lives under `/data` (container path):

- `/data/config.json` (required)
- `/data/presets/`
- `/data/inputs/`
- `/data/outputs/`

See `docs/specs.MD` for the canonical `config.json` shape and timeouts.

## Domain Concepts

- **Generation statuses**: `draft`, `queued`, `submitted`, `completed`, `failed`, `canceled`.
- **Worker model**: single worker loop; processes oldest queued; one execution at a time; checks cancellation between steps.
- **ComfyUI API expectations**: submit via `POST /prompt` (gets `prompt_id`), poll via `GET /history/{prompt_id}`, one output image expected.

## API Surface (v1)

The spec describes these endpoints (names/behavior are defined in `docs/specs.MD`):

- Status: `GET /api/status`
- Presets: `GET /api/presets`, `GET /api/presets/:id`
- Generations: `POST /api/generations`, `GET /api/generations`, `GET /api/generations/:id`
- Generation actions: `POST /api/generations/:id/input`, `POST /api/generations/:id/queue`, `POST /api/generations/:id/cancel`, `DELETE /api/generations/:id`
- Events: `GET /api/events` (SSE)
