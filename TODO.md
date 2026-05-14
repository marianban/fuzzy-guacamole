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

## P2. Enforce image-only canonical output and finalize SaveImage selection semantics

Why this is missing:
- The spec positions each run as producing exactly one canonical output image, but the current Comfy history extraction code still accepts non-image payloads such as `gifs`, `video`, and `audio` when selecting the persisted artifact.
- The current server prefers the lowest-numbered `SaveImage` node in the materialized workflow, then falls back to the first image-like output from Comfy history sorted by node id.
- The preferred-node behavior matches the current img2img workflow where SaveImage node `3` is canonical and upscaled SaveImage node `21` is ignored for v1.
- The fallback behavior may be surprising when a workflow has multiple image-producing nodes or when the preferred SaveImage node is absent from history.

Current evidence:
- `docs/specs.MD`
- `src/server/generations/execution/builder.ts`
- `src/server/comfy/client.ts`
- `data/presets/img2img-basic/preset.template.json`

Work expected in the PR:
- Restrict canonical output extraction to actual image outputs only.
- Fail the run if the preferred canonical `SaveImage` node does not yield an image instead of silently accepting non-image artifacts.
- Decide whether future preset metadata should name an explicit output node instead of relying on lowest-numbered `SaveImage` detection.
- Update the spec and server behavior/tests to match the chosen rule.

Definition of done:
- Canonical output selection is image-only.
- Runs fail deterministically when the canonical output node does not produce an image.
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

## P2. Clarify optional workflow token materialization semantics

Why this needs evaluation:
- The execution builder currently treats missing optional model fields as a valid materialization case instead of a queue-time validation failure.
- When a workflow value is exactly an optional token such as `{{negativePrompt}}`, the builder materializes the missing value as `null`.
- When an optional token is embedded inside a larger string, the builder materializes the missing value as an empty string.
- The spec describes the required-field failure path and normal token replacement, but it does not define this missing-optional branch.

Current evidence:
- `docs/specs.MD`
- `src/server/generations/execution/builder.ts`
- `src/server/generations/execution/builder.test.ts`

Work expected in the evaluation:
- Decide and document the v1 contract for missing optional field tokens during workflow materialization.
- Make blank-string handling explicit, because the current builder treats blank optional strings as missing values.
- State whether full-token omissions should continue to become `null`, whether embedded omissions should continue to become `""`, and whether that rule applies uniformly across optional string, integer, number, and enum fields.
- Update implementation/tests if the chosen contract differs from the current builder behavior.

Definition of done:
- Preset authors have an explicit spec for how missing optional fields materialize into workflow JSON.
- The spec and tests agree on blank and omitted optional-field behavior.

## P2. Enforce contract-gated generation input endpoint and finalize multipart shape

Why this needs evaluation:
- The intended contract is now that `POST /api/generations/{generationId}/input` is allowed only when the selected preset template declares `inputImagePath`, but the current upload route accepts any non-active generation regardless of preset contract.
- The route requires a multipart field named `file`, stores the uploaded path in `presetParams.inputImagePath`, and returns `400` when that field is missing.
- Queue-time validation later requires `inputImagePath` to still reference an existing readable file when the selected preset template declares that runtime parameter.
- The spec and architecture doc do not yet state that `txt2img` uploads must be rejected at the route boundary.

Current evidence:
- `docs/specs.MD`
- `docs/architecture.MD`
- `src/server/http/routes/generations/upload-generation-input-route.ts`
- `src/server/presets/preset-params-validator.ts`
- `src/server/generations/generations.test.ts`

Work expected in the evaluation:
- Update the spec to make `POST /api/generations/{generationId}/input` explicitly contract-gated by the selected preset template declaring `inputImagePath`.
- Reject uploads for generations whose preset template does not declare `inputImagePath`.
- Return `409 Conflict` when a generation cannot accept uploaded input because its preset contract does not allow it.
- Use an explicit contract-based error message, for example: `Generation "{generationId}" cannot accept uploaded input because its preset does not declare inputImagePath.`
- Document the multipart request contract, including the required `file` field.
- Keep replacement semantics simple: a new successful upload silently replaces the stored `inputImagePath` runtime parameter for the generation, while retaining previously uploaded input files so undo can restore an earlier input.
- Store each successful upload at a unique path even when the user uploads the same filename again, so older inputs remain restorable.
- Keep v1 file handling as-is: no additional content-type, format, or image decoding validation at upload time.
- Document the queue-time readable-file requirement for `inputImagePath` when a preset consumes that runtime parameter.
- Add focused tests proving `txt2img` generations cannot accept uploaded input.

Definition of done:
- The spec states that only generations whose selected preset template declares `inputImagePath` may call the input-upload endpoint.
- Generations whose preset contract does not declare `inputImagePath` receive `409 Conflict` from the upload route.
- Contract-based upload rejections use an explicit message that names the missing `inputImagePath` declaration.
- Multipart and queue-time runtime-file validation rules are explicit.
- Successful re-uploads silently replace the stored `inputImagePath` reference while preserving older uploaded inputs for undo/history behavior.
- Successful uploads are written to unique stored paths so same-name uploads do not overwrite earlier undoable inputs.
- The spec keeps v1 upload validation limited to the current multipart/file-presence and readable-file rules.
- Tests cover the chosen behavior for both `img2img` and `txt2img` generations.

## P2. Evaluate persisted uploaded-input history and undo model

Why this needs evaluation:
- Uploaded input replacement now needs to preserve older files for undo behavior, but the current server contract exposes only one canonical `presetParams.inputImagePath`.
- Preserving files on disk alone is not enough to support reliable undo across page reloads or across clients, because older uploaded inputs are not represented in the current generation model or public API.
- A real undoable input history likely needs both a persisted server-side model for prior uploaded inputs and an API for listing or restoring them.

Current evidence:
- `docs/specs.MD`
- `src/shared/generations.ts`
- `src/server/http/routes/generations/upload-generation-input-route.ts`
- `src/server/http/routes/generations/get-generation-route.ts`
- `src/server/generations/store.ts`

Work expected in the evaluation:
- Decide whether uploaded-input undo must survive page reloads and be observable across clients, or remain client-session-local.
- Keep uploaded-input history generation-scoped instead of turning it into a cross-generation asset library.
- If persisted, define the server-side model for uploaded input history instead of relying only on one `inputImagePath` pointer.
- Decide whether prior uploaded inputs should be exposed as part of generation detail or through dedicated history/restore endpoints.
- Define how restoring a prior input updates the canonical `inputImagePath` and any related generation telemetry or edit history.
- Update the spec and architecture docs to reflect the chosen undo/history contract.

Definition of done:
- The product has an explicit decision on whether uploaded-input undo is session-local or persisted.
- Uploaded-input history is explicitly generation-scoped.
- If persisted, the required model and API changes are documented clearly enough for implementation work.
- The upload-route contract and the undo/history contract are separated cleanly in the spec.
