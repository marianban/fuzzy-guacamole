# Server Review TODO

Review scope: `src/server`, shared server contracts in `src/shared`, and the current architecture/spec docs. The items below are missing server capabilities, not polish tasks. Each item is scoped to be implementable as one meaningful PR.

## P0. Persist draft defaults and support draft editing via PATCH

Why this is missing:
- Users cannot edit a draft generation after creation; the draft becomes immutable once persisted.
- `GET /api/generations/{generationId}` returns raw `presetParams` without defaults, so reopening a draft shows empty values instead of the defaults the user saw when the draft was created.
- Defaults are validated at create time but only exist transiently in memory; they are not written back to the database, making it impossible for the client to reconstruct the user's original view across app/browser restarts.

Current evidence:
- `src/server/presets/preset-params-resolver.ts:9-27` resolves defaults on create but does not persist them
- `src/server/http/routes/generations.ts:126-150` validates against resolved defaults then stores only raw `presetParams`
- `src/server/generations/postgres-store.ts:30-37` persists raw params from request, not resolved values
- `docs/specs.MD:710-712` specifies "On Generate, the UI creates the server-side generation", implying the full draft workflow is server-persisted

Work expected in the PR:
- Modify `POST /api/generations` to persist resolved `presetParams` (including defaults) for draft state, while preserving the validation semantics of accepting partial params.
- Introduce `PATCH /api/generations/{generationId}` to update generation state:
  - Allowed when `status in ('draft', 'completed', 'failed', 'canceled')` — i.e., when the generation is not currently queued or submitted. Enables editing before first queue and also before requeue after a run completes or fails.
  - Return `409` if called on `queued` or `submitted` (generation is active or waiting).
  - Body should contain editable fields: `presetId` and `presetParams`.
  - Server resolves `templateId` from the updated preset.
  - Server re-validates create-time model params on the updated resolved state.
  - Server returns the updated generation with resolved defaults applied.
- Ensure `GET /api/generations/{generationId}` returns the full resolved `presetParams` including defaults, not just the raw user-provided values. This works for draft state before first queue and also for completed/failed/canceled states before requeue.
- Handle preset switching in PATCH: when `presetId` changes, preserve only compatible `presetParams` fields or clear to `{}` if schemas are incompatible.
- Add tests for:
  - Creating a draft with empty `presetParams: {}` and verifying defaults are persisted.
  - Patching a draft to switch presets and validate the new preset's constraints.
  - Patching a completed/failed generation to modify params before requeue.
  - Attempting to patch a queued or submitted generation returns `409`.
  - Reopening a draft or completed generation (GET) and seeing the same defaults that were visible after creation/completion.

Definition of done:
- A user can create a draft with `presetParams: {}` and later view it with defaults applied from the preset and model definitions.
- A user can modify `presetId` and `presetParams` on a generation via PATCH in `draft` state and also in `completed`/`failed`/`canceled` states before requeue.
- PATCH returns `409` if called on `queued` or `submitted` generations.
- All edited drafts and edited terminal-state generations are persisted and survive app/browser restarts.
- The UI can immediately render default values after draft creation and also after reopening a completed generation, without a separate API call to fetch preset metadata.

## check if issue

There is a narrow race in cancel: the route branches on the status it read first at generations.ts:401 and generations.ts:427, but markCanceled itself allows both queued and submitted in postgres-store.ts:322. So a request that initially saw queued can still cancel a generation that has just become submitted without issuing a Comfy interrupt. Locally, the processor notices cancellation on its next active-state check via processor.ts:338. If the remote prompt was already submitted upstream, local state can become canceled even though remote work may already be in flight. That is the main subtle edge case in the current implementation.

## P1. Expand SSE/events into an execution telemetry stream the UI can actually use

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

## P2. Add a real `txt2img` preset bundle to the runtime catalog

Why this is missing:
- The runtime presets on disk currently only include `data/presets/img2img-basic/*`.
- `txt2img` behavior exists in tests, but there is no real shipped preset bundle under `data/presets`.
- That leaves part of the documented preset model exercised only by test fixtures instead of the actual runtime catalog.

Current evidence:
- `data/presets/img2img-basic/basic.preset.json`
- `data/presets/img2img-basic/model.json`
- `data/presets/img2img-basic/preset.template.json`
- `review.md`

Work expected in the PR:
- Add a new `data/presets/txt2img-basic/` bundle with `preset.template.json`, `model.json`, and at least one `*.preset.json`.
- Keep the bundle aligned with the existing preset contract used by the loader and shared schemas.
- Include a workflow template that is valid for txt2img execution and uses the same runtime materialization path as the server builder.
- Add or update preset-loading tests to prove the runtime catalog exposes the new preset.

Definition of done:
- The runtime preset catalog includes at least one real `txt2img` preset bundle from disk.
- `GET /api/presets` and `GET /api/presets/{presetId}` can serve a shipped `txt2img` preset, not just test-only fixtures.
