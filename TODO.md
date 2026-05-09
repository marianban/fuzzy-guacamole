# Server Review TODO

Review scope: `src/server`, shared server contracts in `src/shared`, and the current architecture/spec docs. The items below are missing server capabilities, not polish tasks. Each item is scoped to be implementable as one meaningful PR.

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
