# Server Review TODO

Review scope: `src/server`, shared server contracts in `src/shared`, and the current architecture/spec docs. The items below are missing server capabilities, not polish tasks. Each item is scoped to be implementable as one meaningful PR.

## P1. Reject generation queue requests unless ComfyUI is Online or Starting

Why this is missing:
- The spec now requires `POST /api/generations/{generationId}/queue` to reject immediately unless app status is `Online` or `Starting`.
- The current queue route validates generation state and preset execution data, but it does not check app runtime status before transitioning to `queued`.
- Today an `Offline` or `StartupFailed` system can still accept a queue request and fail later in the worker/processor, which is a confusing user-facing lifecycle.

Current evidence:
- `docs/specs.MD`
- `src/server/http/routes/generations/queue-generation-route.ts`
- `src/server/generations/processor.ts`
- `src/server/status/runtime-status.ts`

Work expected in the PR:
- Inject runtime status visibility into the queue route or a narrow queue-readiness service.
- Reject queue requests before `markQueued` when status is `Offline` or `StartupFailed`.
- Allow queue requests when status is `Online`.
- Allow queue requests when status is `Starting`; the worker should continue to wait on the in-flight startup attempt before execution.
- Add focused route tests proving rejected queue requests do not transition the generation to `queued`.

Definition of done:
- Queue requests in `Offline` and `StartupFailed` return an error and leave the generation unchanged.
- Queue requests in `Online` and `Starting` preserve existing queue behavior.
- The implementation matches the queue-readiness rules in `docs/specs.MD`.

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

## P2. Evaluate SaveImage output selection semantics

Why this needs evaluation:
- The current server prefers the lowest-numbered `SaveImage` node in the materialized workflow, then falls back to the first image-like output from Comfy history sorted by node id.
- The preferred-node behavior matches the current img2img workflow where SaveImage node `3` is canonical and upscaled SaveImage node `21` is ignored for v1.
- The fallback behavior may be surprising when a workflow has multiple image-producing nodes or when the preferred SaveImage node is absent from history.

Current evidence:
- `docs/specs.MD`
- `src/server/generations/execution/builder.ts`
- `src/server/comfy/client.ts`
- `data/presets/img2img-basic/preset.template.json`

Work expected in the evaluation:
- Decide whether fallback output selection should remain automatic or fail fast when the preferred SaveImage node has no image output.
- Decide whether future preset metadata should name an explicit output node instead of relying on lowest-numbered SaveImage detection.
- Update the spec and server behavior/tests to match the chosen rule.

Definition of done:
- Output selection behavior is explicitly documented.
- Workflows with multiple possible outputs have deterministic and unsurprising v1 behavior.

## P2. Evaluate duplicating generationId inside telemetry payloads

Why this needs evaluation:
- Current SSE telemetry events carry `generationId` on the event envelope alongside `runId`, `sequence`, `occurredAt`, and nested `telemetry`.
- The nested telemetry payload intentionally omits transport fields such as `generationId`.
- Client consumers or log bridges may be simpler if each telemetry payload also contains `generationId`, even when detached from the SSE envelope.

Current evidence:
- `src/shared/generations.ts`
- `src/server/generations/telemetry.ts`
- `src/server/generations/telemetry.test.ts`
- `docs/specs.MD`

Work expected in the evaluation:
- Decide whether `generationId` should remain envelope-only or also be duplicated inside nested telemetry payloads.
- If duplicated, update shared schemas, telemetry publishing, tests, and SSE consumer expectations.
- Keep a single documented convention so clients do not have to guess where identifiers live.

Definition of done:
- Telemetry identifier placement is explicitly documented.
- Tests cover the chosen event shape.

## P2. Review history timeout retry behavior

Why this needs evaluation:
- The spec describes retry behavior for transient failures during history polling.
- The current processor treats transport-like failures during history polling as retryable, but treats a Comfy history timeout as terminal and non-retryable.
- This distinction is reasonable, but the product expectation around long-running or slow-to-finalize Comfy jobs needs to be explicit.

Current evidence:
- `docs/specs.MD`
- `src/server/generations/processor.ts`
- `src/server/comfy/client.ts`
- `src/server/generations/processor.test.ts`

Work expected in the evaluation:
- Decide whether history timeout should remain a terminal generation failure or get one retry/re-poll cycle.
- Decide whether timeout configuration should distinguish per-request transport timeout from overall history wait timeout.
- Update retry/error handling docs and tests to match the chosen behavior.

Definition of done:
- History timeout retry semantics are explicit in the spec.
- Processor tests cover the chosen timeout behavior.
