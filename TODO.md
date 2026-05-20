# Server Review TODO

Review scope: `src/server`, shared server contracts in `src/shared`, and the current architecture/spec docs. The items below are missing server capabilities, not polish tasks. Each item is scoped to be implementable as one meaningful PR.

## P1. Replace React Hook Form with TanStack Form

Why this is high priority:
- The current form layer should be standardized on TanStack Form before more UI workflows and validation logic accumulate on top of React Hook Form.
- Delaying the migration increases the cost of future form work by spreading hook-form-specific patterns across more components, helpers, and tests.
- A single form approach will simplify future maintenance, validation reuse, and form-state behavior across the client.

Current evidence:
- `src/client`
- `package.json`
- Any current React Hook Form usage in client components, hooks, and tests

Work expected in the migration:
- Inventory all existing React Hook Form usage in the client and define the migration scope.
- Replace React Hook Form dependencies, adapters, and helper patterns with TanStack Form equivalents.
- Preserve current user-visible behavior for validation, default values, submission, disabled states, and error rendering.
- Update tests so they exercise the TanStack Form implementation rather than hook-form-specific behavior.
- Remove React Hook Form packages and any obsolete helper code once the migration is complete.
- Update architecture or implementation docs if the form architecture changes materially.

Definition of done:
- No production client code depends on React Hook Form.
- TanStack Form is the single supported form library in the codebase.
- Existing form behavior is preserved or intentionally updated with corresponding tests.
- Obsolete hook-form dependencies and helpers are removed.

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
- Proposed direction: make persisted undo survive reloads and be observable across clients by modeling history as immutable generation-scoped revision items under one stable generation id.
- Use a URL shape that can address both the stable generation and the selected revision item, so reload can restore the exact preserved state and undo/redo can move the client pointer between persisted items.
- Treat the second URL id as a revision pointer, not as globally mutable shared state; if omitted, load the current head revision for the generation by selecting the most recent persisted revision.
- Model linear undo/redo navigation with `prevRevisionId` and `nextRevisionId` on each revision item so the client can move by changing the URL revision id instead of calling dedicated undo/redo endpoints.
- Persisted history is linear-only. Starting a new generation from an older revision updates that older revision's `nextRevisionId` to the newly appended revision and thereby replaces the previously newer redo chain.
- The head revision is the most recent persisted revision in that linear chain.
- Store uploaded inputs as generation-scoped assets referenced by revision items, so restoring a prior revision updates the canonical `inputImagePath` by selecting an older stored asset instead of mutating file history in place.
- Name stored output images by `revisionId` so each persisted revision has a stable canonical output artifact that can be reloaded directly from the selected revision URL.
- Keep runs conceptually separate from revision items: a revision is an editable snapshot and uploaded-input selection, while queue/requeue remains an execution attempt against that snapshot.
- Decide whether prior uploaded inputs should be exposed as part of generation detail or through dedicated history/restore endpoints.
- Prefer dedicated history/restore endpoints or a dedicated history subresource over inflating the base generation payload with the full revision timeline.
- Define how restoring a prior input updates the canonical `inputImagePath` and any related generation telemetry or edit history.
- Update the spec and architecture docs to reflect the chosen undo/history contract.
- This change would probably only need adding two nullable columns into the generations table: prevGenerationId and nextGenerationId

Definition of done:
- The product has an explicit decision on whether uploaded-input undo is session-local or persisted.
- Uploaded-input history is explicitly generation-scoped.
- If persisted, the required model and API changes are documented clearly enough for implementation work.
- The documented proposal distinguishes stable generation identity from immutable revision-item identity and defines how the URL selects a specific persisted revision.
- The documented proposal defines persisted revision history as linear-only with `prevRevisionId`/`nextRevisionId` links and defines head selection as the most recent persisted revision.
- The documented proposal states that uploaded-input history is represented by persisted generation-scoped asset references owned by revision items, not only by retained files on disk.
- The documented proposal states that canonical stored output images are named by `revisionId` so persisted revisions and their output artifacts remain directly addressable together.
- The upload-route contract and the undo/history contract are separated cleanly in the spec.
