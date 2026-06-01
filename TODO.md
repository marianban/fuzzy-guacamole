# Server Review TODO

Review scope: `src/server`, shared server contracts in `src/shared`, and the current architecture/spec docs. The items below are missing server capabilities, not polish tasks. Each item is scoped to be implementable as one meaningful PR.

## P1. Setup design tokens

https://penpot.app/blog/the-developers-guide-to-design-tokens-and-css-variables/
https://github.com/awesome-design-tokens/dtg-examples/blob/main/common-tokens/styles/core.css
https://thedesignsystem.guide/design-tokens
https://spectrum.adobe.com/page/design-tokens/
https://www.contentful.com/blog/design-token-system/

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

## P3. Evaluate Radix Themes to Mantine migration

Why this needs evaluation:
- The current Radix Themes setup is proving difficult to customize at the theme level for common control concerns such as border colors, disabled-state affordance, input spacing, and typography.
- Styling intent is becoming less readable because some component-level designs are expressed through indirect Radix token remapping rather than explicit component theme overrides.
- Before more UI components are built on top of the current stack, the product needs an explicit decision on whether Radix Themes remains the right abstraction for the desired level of customization.

Current evidence:
- `package.json`
- `src/client/src/styles/comfy-deck-theme.tsx`
- `src/client/src/styles/theme.css`
- `src/client/src/components/text-area/text-area.tsx`
- `src/client/src/components/text-area/text-area.module.css`

Work expected in the evaluation:
- Compare Radix Themes and Mantine specifically on theme-level customization of controls, including borders, disabled states, font sizes, spacing, radius, and per-component defaults.
- Distinguish clearly between Radix Primitives, which are headless, and Radix Themes, which is the currently adopted styled layer.
- Identify which existing design-system needs are awkward in the current Radix Themes setup and whether Mantine addresses them through documented theme APIs rather than CSS overrides.
- Evaluate whether the current token model in `src/client/src/styles/theme.css` can be preserved as the source of truth if the UI library changes.
- Assess migration cost for the currently implemented client surface, including theme provider setup, form controls, layout primitives, storybook stories, and tests.
- Identify the highest-risk migration areas, including accessibility regressions, visual churn, and component API differences.
- Decide whether the recommended direction is: stay on Radix Themes, switch to Mantine, or use a mixed strategy such as Mantine for themed controls and lower-level primitives where necessary.
- If the recommendation is to switch, document the migration shape, sequencing, and acceptance criteria for a first incremental PR.
- Update relevant specs or architecture docs if the evaluation changes the chosen frontend component strategy.

Definition of done:
- The product has an explicit decision on whether to stay on Radix Themes or migrate to Mantine.
- The evaluation compares both options against the project's concrete customization requirements instead of generic library pros and cons.
- The evaluation states whether the existing design-token model can remain the shared styling source of truth under the chosen approach.
- The evaluation identifies the main migration risks and the expected implementation cost.
- If migration is recommended, the next implementation slice is defined clearly enough to execute as one focused PR.
