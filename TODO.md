# Server Review TODO

Review scope: `src/server`, shared server contracts in `src/shared`, and the current architecture/spec docs. The items below are missing server capabilities, not polish tasks. Each item is scoped to be implementable as one meaningful PR.

## P0. Build the actual generation worker and queue processor

Why this is missing:
- `POST /api/generations/:generationId/queue` only changes the row status to `queued` and emits an event.
- No startup path creates or starts a worker loop.
- No code transitions a generation to `submitted`, `completed`, or `failed` even though those states are in the shared contract.

Current evidence:
- `src/server/routes/generations.ts:193-237`
- `src/server/index.ts:18-41`
- `src/shared/generations.ts:3-22`
- `docs/specs.MD:289-290`
- `docs/specs.MD:436-438`

Work expected in the PR:
- Add a single-worker background processor that claims the oldest queued generation by `queuedAt`.
- Make the claim/update path concurrency-safe for the Postgres-backed store.
- Drive state transitions `queued -> submitted -> completed|failed`.
- Publish state changes through the existing event bus.
- Cover ordering, retry boundaries, and terminal-state behavior with tests.

Definition of done:
- Queuing a generation results in actual server-side work without a second manual step.
- At least one integration-style test proves a queued generation reaches a terminal state.

## P0. Add Comfy availability orchestration and make `/api/status` truthful

Why this is missing:
- `/api/status` always returns `Starting`, regardless of whether ComfyUI is reachable.
- The server loads config and presets, but no runtime service uses WOL, SSH, health polling, or the configured timeout values.
- The repo already has a Comfy client, but the architecture doc explicitly notes it is not wired into the Fastify runtime.

Current evidence:
- `src/server/routes/status.ts:6-24`
- `src/server/app.ts:58-88`
- `src/server/index.ts:18-41`
- `src/server/comfy/client.ts:104-220`
- `docs/architecture.MD:81-101`
- `docs/specs.MD:220-245`
- `docs/specs.MD:303-312`

Work expected in the PR:
- Introduce a status/orchestration service that owns `Starting | Online | Offline`, `since`, `lastError`, and `comfy` details.
- Implement single-flight "ensure online" behavior so concurrent callers share one bring-up attempt.
- Use the configured WOL, SSH, remote start, and readiness polling settings.
- Back `/api/status` with live state instead of a constant response.
- Add tests for already-online, successful bring-up, timeout, and error cases.

Definition of done:
- `/api/status` reflects real runtime state.
- Server-side execution paths can depend on one readiness entrypoint instead of hand-rolled checks.

## P1. Implement workflow materialization, queue-time validation, and prompt persistence

Why this is missing:
- Preset templates are loaded, but no server path applies template tokens to build a final Comfy workflow.
- Queueing does not validate required template-token values or resolve preset defaults.
- The database schema already has `prompt_request` and `prompt_response`, but the store always writes `null` to both columns.

Current evidence:
- `src/server/presets.ts:51-119`
- `src/server/routes/generations.ts:94-106`
- `src/server/routes/generations.ts:207-236`
- `src/server/generations/store.ts:210-223`
- `src/server/db/schema.ts:8-10`
- `docs/specs.MD:191-208`

Work expected in the PR:
- Merge preset defaults with generation params in a dedicated server-side execution builder.
- Validate template-token completeness and type-preserving replacement before submission.
- Handle img2img-specific input requirements and seed/seed-mode normalization.
- Persist the rendered prompt payload and the Comfy submission response for later inspection/debugging.
- Add focused tests around template-token replacement, missing params, and prompt persistence.

Definition of done:
- The server can deterministically turn a stored generation into a valid Comfy submission payload.
- Failed queue attempts produce actionable validation errors before any remote execution starts.

## P1. Finish lifecycle semantics for cancel, delete, and artifact cleanup

Why this is missing:
- Cancel only works for `queued`; `submitted` always returns `409`.
- Delete only blocks `submitted`, but it does not remove queued work or clean up files already written under `data/inputs`.
- There is no defined server behavior yet for output artifacts on rerun or delete.

Current evidence:
- `src/server/routes/generations.ts:117-190`
- `src/server/routes/generations.ts:240-318`
- `docs/specs.MD:352-364`
- `docs/specs.MD:466-469`

Work expected in the PR:
- Allow cancel during `submitted` by interrupting Comfy and resolving to `canceled` or `failed`.
- Define correct delete behavior for `queued`, `completed`, `failed`, and `canceled`.
- Remove persisted input/output folders when a generation is deleted.
- Lock down rerun/output folder naming so repeated runs do not collide.
- Add tests for submitted cancel, queued delete, and filesystem cleanup.

Definition of done:
- Lifecycle endpoints match the documented contract instead of only the draft/queued happy path.
- Deleting a generation leaves neither orphaned DB rows nor orphaned artifacts on disk.

## P2. Expand SSE/events into an execution telemetry stream the UI can actually use

Why this is missing:
- The SSE endpoint is just a thin transport around coarse `upsert` and `deleted` events.
- The shared event contract does not carry progress, run logs, or execution-specific metadata.
- The spec expects live generation updates and the UI spec expects logs, but the server has no model for either.

Current evidence:
- `src/server/routes/events.ts:11-49`
- `src/shared/generations.ts:31-43`
- `docs/specs.MD:408-409`

Work expected in the PR:
- Define an event model for progress, execution milestones, and operator-visible log entries.
- Publish those events from the worker/execution path without breaking existing upsert consumers.
- Decide which telemetry is transient SSE-only versus persisted on the generation record.
- Add tests for SSE formatting and event ordering across a full execution.

Definition of done:
- The client can observe more than final state flips.
- Execution failures and long-running submissions are diagnosable without reading server stdout.
