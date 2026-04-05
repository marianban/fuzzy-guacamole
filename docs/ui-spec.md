# UI Interface Specification

Product: Comfy Frontend Orchestrator - ComfyDeck
Audience: Product/UX designers preparing final visual UI
Date: April 4, 2026

## 1. Purpose and scope

Define a production-grade, full-screen web application UI for LAN-based `img2img` and `txt2img` generation with generation history, queue/cancel lifecycle, and live status visibility.


## 2. Product definition

The product is a sovereign workspace, not a marketing page. Users spend focused time iterating images and prompts.

Core jobs to support:
1. Start a new generation quickly.
2. Configure preset + prompt with minimal friction.
3. Upload source image for `img2img`.
4. Queue, observe, cancel, rerun, and delete generations.
5. Compare/iterate output history with confidence.

## 3. Visual + interaction thesis

Visual thesis: A restrained, tool-like dark studio surface with strong typography, clear hierarchy, and calm contrast; image canvas is the hero, chrome is secondary.

Content plan:
1. Orientation layer (system status, context, active generation identity)
2. Work layer (canvas + controls)
3. Persistence layer (generation list and logs)
4. Commit layer (generate/cancel/rerun/delete)

Interaction thesis:
1. Direct manipulation first: canvas-centric interactions and immediate visual feedback.
2. Modeless operation: avoid interruptive dialogs for normal flow.
3. Progressive reveal: only surface advanced controls when needed.

## 4. UX principles applied (mandatory)

1. Match user mental model: “generation” as reusable item, “run” as each execution.
2. Do not make users ask for permission: autosave drafts and control values.
3. Put primary interactions in main window: no wizard-like modal flow for core tasks.
4. Make actions reversible where feasible: confirm destructive deletes only when needed.
5. Rich visual feedback: clear status color, queue/progress/cancel feedback, visible selection state.
6. Remove excise: no unnecessary dialogs/toasts for normal success states.
7. Optimize for intermediates: keyboard shortcuts and fast repeat workflows.

## 5. Information architecture

Three-column desktop layout (full-screen):
1. Left rail: Generations list + New Generation
2. Center: Canvas workspace (primary)
3. Right rail: Control panel + action area + logs

Top bar spans all columns:
- Logo/product - ComfyDeck
- Undo/Redo
- Before/After controls (`img2img`)
- Selection tool toggle
- Global system status badge

Mobile/tablet behavior:
- Single-column stacked views with sticky top bar.
- Left and right rails collapse into bottom sheet/drawer patterns.
- Canvas remains the first visible working surface.

## 6. Global system states

The app has app-wide readiness states:
- `Starting`: full-page loader, no editing interaction.
- `Online`: workspace fully interactive.
- `Offline`: blocking offline state with retry/status diagnostics and preserved draft context.

State behavior:
1. `Starting` uses full-page loader (required by product spec).
2. `Offline` preserves current draft content locally and explains next recovery action.
3. Transitions are animated subtly (fade/slide 150-250ms).

## 6.1 Screen states

Design the primary workspace for these user-visible screen states:

1. Loading state (`Starting`)
  - User point of view: "I just opened the app and need immediate confirmation that the workspace is loading and connecting. I should understand that the system is not ready yet, not that it is broken."
2. Blank state (no generation yet)
  - User point of view: "I have not generated anything yet, so I need a clear first step. The screen should guide me toward choosing a preset, entering a prompt, and optionally uploading an image without feeling empty or intimidating."
3. In-progress state (`queued` or `submitted`)
  - User point of view: "My request is in motion and I need to know whether it is waiting or actively running. I should be able to track progress, keep my context, and cancel if needed."
4. Ideal state (`completed` with image generated)
  - User point of view: "My image is ready and should become the center of attention immediately. I need to review it, compare it, inspect details, and iterate again without losing momentum."
5. Error state (`failed` or operational error)
  - User point of view: "Something went wrong, such as a network issue or backend failure, but I should not lose my work. The screen should explain what happened in plain language and show the next safe action, such as retrying, reconnecting, or checking logs."
6. Offline recovery state (`Offline`)
  - User point of view: "The app lost connection, but my draft and current setup should still feel preserved. I need to understand what is unavailable right now and what will happen when the connection returns."

## 7. Screen and panel specifications

## 7.1 Left rail: Generations

Required elements:
- Primary button: `+ New generation` (client-side draft creation)
- Scrollable list, newest first
- Item content:
  - 128x128 thumbnail (output if present, otherwise preset-based placeholder)
  - Preset name
  - Status chip (`draft`, `queued`, `submitted`, `completed`, `failed`, `canceled`)
  - Timestamp rule: relative within 7 days, absolute after 7 days

Row interactions:
1. Single click selects active generation.
2. Keyboard up/down moves selection.
3. Context actions available on active row: rerun, delete.

Selection styling must be unambiguous.

## 7.2 Top bar

Required controls:
- Brand/logo at left
- Undo and Redo (scope: prompt/control/canvas-edit history for active generation)
- Before/After:
  - Hover press-and-hold quick preview
  - Click toggles split compare mode with draggable divider
- Selection tool:
  - Toggle on/off
  - Visible active state

Status area:
- Global status indicator showing `Starting`/`Online`/`Offline`
- Compact hardware summary when online (GPU name/free VRAM if available)

All actions should be represented with clear crisp icons with accessible tooltips and ARIA labels.

## 7.3 Center workspace: Canvas

Behavior by mode:
1. `img2img`:
  - Empty state shows single-file drop zone.
  - After run, show output image.
  - Iteration loop supports input -> output -> input chaining.
2. `txt2img`:
  - Empty state shows informative placeholder.
  - After run, show output image.

Common controls:
- Zoom in/out/reset
- Pan
- Fit-to-screen
- Optional pixel inspector readout on hover (design-ready, implementation optional)
- Controls placed at bottom of canvas to avoid obscuring image content.

Selection editing mode (`img2img`):
- Region selection overlay with resize handles.
- Clear visual affordance for selected bounds.
- Output composited back with softened edge blending (specified behavior).

im2img and txt2img are all done in the same canvas, no need to special mode switch or indicators. The user can seamlessly transition between modes. For example starting with txt2img and then iterating on output with edit prompts.
 
## 7.4 Right rail: Control panel

Form hierarchy:
1. Preset selector (required)
2. Prompt (required, multiline)
3. Advanced section (collapsible, default collapsed):
  - Negative prompt
  - Seed mode (`random`/`fixed`)
  - Seed value input (enabled only when fixed)
  - Advanced parameters shown in badges in format Label:value (e.g. `Steps:50`, `CFG:7.5`). User can click badge to edit value in place.

Action area:
- Primary: `Generate` (or `Rerun` if not draft)
- Secondary: `Cancel` (enabled only in `queued`/`submitted`)
- Destructive: `Delete` (disabled for `submitted`)

Bottom: log panel
- Modeless, non-blocking diagnostics stream
- Timestamped lines with severity coloring
- Copy log action
- Showing only most recent logs

## 8. Generation lifecycle UX mapping

`draft`:
- Editable controls and canvas input.
- Generate enabled when required fields are valid.

`queued`:
- Controls read-only except cancel.
- Show queue badge and waiting indicator.

`submitted`:
- Show running state with spinner/progress placeholder.
- Cancel remains available.

`completed`:
- Show result image and metadata summary.
- Rerun available.

`failed`:
- Preserve last inputs.
- Show actionable error banner with details drawer.
- Rerun available.

`canceled`:
- Preserve current setup.
- Rerun available.

## 9. Error, empty, and edge states

Must-design states:
1. No presets available.
2. Preset missing during generation setup.
3. Input upload failures.
4. Queue/cancel/delete state conflicts.
5. Generation not found after stale selection.
6. Network disconnect/reconnect during live updates.
7. Timeout/failure states from backend and Comfy operations.

Error UX rules:
- No modal interruptions for expected operational errors.
- Keep user in context; provide inline, local error messages near affected action.
- Every error must include next step: retry, change state, or inspect logs.

## 10. Motion and feedback

Use restrained, meaningful motion only:
1. Initial readiness transition: loader -> workspace reveal.
2. Generation row status transition (chip + subtle pulse on updates).
3. Canvas compare/selection transitions.

Performance constraints:
- Keep transitions short (150-250ms; up to 300ms for panel reveals).
- No decorative looping animations outside active progress indicators.

## 11. Accessibility and input support

Required:
1. Full keyboard navigation across list, form, and actions.
2. Visible focus indicators with sufficient contrast.
3. ARIA labels for icon-only controls (undo/redo/compare/selection).
4. Status and error announcements via polite/assertive live regions.
5. Minimum text contrast meeting WCAG AA.
6. Touch targets >= 44x44 on mobile.

## 12. Content and microcopy standards

Use utility-first product language:
- Good: “Queued”, “Running”, “Upload input image”, “Last updated”.
- Avoid marketing language in workspace UI.

Microcopy tone:
- Clear, concise, respectful.
- Never blame user.
- Explain what happened and what to do next.

## 13. Design system guidance

Style direction:
- Dark theme is mandatory for the primary product UI.
- Conservative, high-legibility workspace UI.
- Minimal color palette; one accent color for primary actions.
- Dense but breathable spacing.
- Avoid dashboard-card mosaic patterns.

Dark theme requirements:
1. Use layered dark surfaces (app background, panel surface, elevated controls) with clear separation.
2. Keep neutral base tones low-saturation to avoid color cast.
3. Reserve bright/high-chroma colors for status and primary actions only.
4. Ensure text contrast and icon contrast meet WCAG AA on all dark surfaces.
5. Canvas background must visually distinguish image bounds from empty workspace.

Recommended token structure for designers:
- `bg/base`: deepest application background
- `bg/panel`: side panels and top bar
- `bg/elevated`: menus, popovers, focused controls
- `fg/primary`, `fg/secondary`, `fg/muted`
- `accent/primary`
- status tokens: `status/success`, `status/warning`, `status/error`, `status/info`

Typography:
- Max two type families.
- Strong hierarchy for: generation title, panel headings, control labels, status chips.

Component consistency:
- Same status chip visual grammar across list, panel, and logs.
- Same icon set and symbol meaning across contexts.

## 14. Functional constraints for design

Design should follow product lifecycle and behavior constraints:
1. Cancel is available only when a generation is waiting or running.
2. Delete is unavailable while generation execution is in progress.
3. Upload/input operations can fail and must always return users to a recoverable state.
4. Live updates can be delayed or interrupted; UI must degrade gracefully.
5. Preserve draft and iteration context whenever possible across transient failures.

## 15. Designer delivery checklist

Final design handoff should include:
1. Desktop and mobile layouts for all major states in sections 6-9.
2. Component specs with spacing, typography, and state variants.
3. Interaction specs for compare mode, selection mode, queue/cancel lifecycle.
4. Error-state designs for all listed functional failure modes.
5. Accessibility annotations (focus order, keyboard map, ARIA notes).
6. Motion specs with durations/easing and reduced-motion behavior.

## 16. Non-goals for v1 visuals

Do not design for:
- Multi-user identity/auth views
- Batch generation
- Preset editor authoring UI
- Internet-facing security flows
- Multi-output galleries per run

## 17. Colors

Background 1 (Backgrounds): #11130C
Background 2 (Backgrounds): #151A10
Interactive components 1 (Pairs with Text 1, 2 labels): #1F2917
Interactive components 2 (Pairs with Text 1, 2 labels): #29371D
Interactive components 3 (Pairs with Text 1, 2 labels): #334423
Borders and separator 1 (Pairs with Background 1, 2, Interactive components 1, 2, 3): #3D522A
Borders and separator 2 (Pairs with Background 1, 2, Interactive components 1, 2, 3): #496231
Borders and separator 3 (Pairs with Background 1, 2, Interactive components 1, 2, 3): #577538

Solid colors: Solid backgrounds, buttons
Solid colors 1 (Solid backgrounds, buttons
,Pairs with Dark text): #BDEE63
Solid colors 2 (Solid backgrounds, buttons
,Pairs with Dark text): #D4FF70

Accessible text 1 (Secondary text, links, Pairs with
Background colors): #BDE56C
Accessible text 2 (High-contrast text, Pairs with
Background colors): #D4FF70

### Color usage rules

- Lighter variations on background color for raised controls
- Darker variations on the background color for inset controls

Disabled: lighter variation
Hover: darker variation
Normal: base variation

When designing controls for dark mode try to make things subtlety lighter than the background but don' make them too bright.

## 18. Typography + Sizing

Choose a clean and simple geometric sans typeface. Examples: Jost, Proxima Nova, Metropolis, Clear Sans, Protipo, Supreme

5 Main text sizes:
- Heading 1: 24px, 600 weight
- Main: 16px
- Secondary: 14px
- Label: Similar to Main/Secondary but uppercase and weighter

## 19. Alignment, Spacing and consistency

- virtually every element is aligned or centered with at least one other element
- icons are aligned by center of pixel mass
- padded elements are aligned by their most visually prominent edge
- different sized texts are aligned by their baseline
- spacing between elements in group is less than spacing around groups
- whitespace is used to highlight focal points on the screen
- The squint test: when squinting your eyes or blurring the design, consistent "sister elements" are easily identifiable
- When performing a squint test, all elements attract as much attention as their importance warrants - no more, no less.
- Repeated elements are appropriately lightened
- Color is used judiciously and consistently
- Infrequently used or unimportant elements are lightened or hidden
- Conditionally used elements are hidden until it is clear that the user needs them - progressive disclosure

## 20. Things to not do

- No unaligned elements
- No system fonts
- No overused fonts Open Sans, Inter, SF Pro, Roboto, etc.
- No thin or light weights - bold weights are easier to look good
- No extra colors - if one hue is enough, don't use two. If two if enough, don't use three...
- No ultra wide form controls
- No form control inconsistency - Consistent heights, widths, colors, borders, radii etc as much as possible
- No unlabeled icons unless it's universally recognized (e.g. magnifying glass for zoom, trash can for delete, etc.)
- No mismatched icon & labels. Icons should match other elements (including text) in weight, color and general feel.
- No dark borders. Borders, outlines and dividing rules should almost always be lighter than you first expect.
