# Components Plan

This plan introduces an isolated component-development workflow for the React client before the full frontend is implemented. The approach is to use the Figma design as direction for visual taste and product needs, lean on Radix Themes for consistent spacing, typography, layout rhythm, and component behavior, then build a small Radix-backed internal component layer under `src/client/src/components` that can later compose the img2img/txt2img generation UI described in `docs/specs.MD`. The component layer remains generic and portable, but intentionally limited to the needs of this application rather than a broad public design system.

## Scope

- Inputs: the Figma design as the visual reference, Radix UI and Radix Themes packages as the behavior/accessibility and design-system layer, and Storybook packages as the isolated development workbench.
- Outputs: generic primitive components in `src/client/src/components`, component-level CSS modules that extend Radix native tokens where needed, Storybook stories for isolated review, focused component tests, and the package/configuration changes needed to run Storybook and tests.
- Excluded deliverables: domain-specific application compositions, Control Model-to-component mapping logic, generation pages, preset workflows, backend/API behavior, persisted settings, preset editor UI, and ComfyUI end-to-end flows.

## Assumptions

- The Figma file will be available to the implementation agent through the Figma Desktop MCP or exported design assets.
- Radix Themes is the baseline design system for spacing, typography, layout primitives, radii, and common component styling; project tokens should customize Radix rather than replace it wholesale.
- Public component APIs are project-owned and stable; Radix primitives and Radix-specific prop shapes remain internal implementation details behind thin wrappers.
- Public component APIs are narrowly curated from real application needs; wrappers should not expose broad pass-through access to underlying Radix capabilities beyond small styling and composition escape hatches.
- The component layer is form-library agnostic; public APIs must support plain controlled or uncontrolled usage and must not depend on React Hook Form, TanStack Form, or any other form-library-specific types.
- Complex controls should default to single-entry wrappers with a small number of explicit props and limited composition points; expose compound subcomponents only when repeated product use proves they are necessary.
- Styling should come from predefined variants, sizes, project tokens, and Radix theme configuration first; per-instance overrides stay minimal, with support for `className` and predictable cooperation with Radix-based theme tweaks.
- Layout should live mostly in feature code rather than in a broad library-level set of layout primitives; if a layout helper is needed repeatedly, prefer a thin re-export or wrapper around an existing Radix layout primitive over inventing a custom abstraction too early.
- Consumers may import components directly from component folders; do not introduce library-wide barrel exports such as `index.ts` files for the component layer.
- Thin styled wrappers and visual-only re-exports are reviewed in Storybook rather than through snapshot or screenshot-style automated tests.
- Storybook is the canonical acceptance surface for this component phase: component APIs, states, visual behavior, and basic accessibility support should be reviewed there before feature-level integration.
- The theme layer should be mostly stable before broad component implementation begins; lock core tokens such as color roles, typography scale, spacing steps, radii, shadows, and focus treatment early, and keep only a small explicit provisional zone for Figma-to-Radix tuning.
- Client import aliases should include `#root/components` for `src/client/src/components`, while existing `@shared` imports remain available.
- Design tokens are committed as non-secret source files and exposed through CSS custom properties; component CSS must use Radix theme variables or project `var(--color-*)` tokens rather than hardcoded hex colors.
- Storybook is a development-only workbench and will not be published as project documentation.
- Figma tokens will be copied manually only where they are needed to tune or extend Radix Themes; no repeatable token export/generation script is required for the initial component pass.
- The initial component set includes generic primitives only, with no domain-specific compositions such as `PresetControlPanel`, and no direct dependency on the Control Model contract.
- The component layer may include disciplined, app-shaped composites such as field shells or section containers, provided they remain contract-agnostic and reusable across features.

## Action items

[ ] Inspect the Figma design and document the visual direction: color intent, typography scale, spacing density, radii, shadows, focus rings, icon sizing, and interaction states, mapping each decision to Radix native defaults where practical.

[ ] Add the client theme layer in `src/client/src/styles`, including Radix Themes setup, global CSS variables for project-specific additions, reset/base styles, dark theme defaults, and copied Figma values only where Radix defaults need deliberate tuning; stabilize core tokens early and keep only a small explicit provisional zone for values still being tuned.

[ ] Configure Storybook for the Vite React client, including TypeScript support, CSS module handling, Radix Theme decorators, viewport backgrounds, basic accessibility checks, and scripts in the root `package.json`, so it can serve as the canonical acceptance surface for the component library.

[ ] Update client path aliases so shared component imports can use `#root/components`, and mirror the alias in Vite, Storybook, TypeScript, and test configuration.

[ ] Keep the component file structure stable enough for direct folder imports, without adding barrel-export entry points for the library.

[ ] Define the component architecture for `src/client/src/components`: each component folder owns a typed public React wrapper, a CSS module, and a story file for that folder-level public surface; add test files selectively based on behavior and risk; allow nested private helper components without separate story files; organize the library into low-level primitives and disciplined, app-shaped composites that stay contract-agnostic; default to single-entry wrapper APIs with limited composition points, adding compound subcomponents only where recurring use justifies them; Radix primitives remain implementation details behind thin, project-owned wrapper APIs with narrowly curated props, variants, and states.

[ ] Build the first foundation components around Radix primitives: `Button`, `IconButton`, `TextField`, `TextArea`, `Select`, `Slider`, `Switch` or `Checkbox`, `Tabs`, `Dialog`, `Tooltip`, and collapsible section primitives for preset categories.

[ ] Keep layout concerns primarily in feature code; only add or re-export minimal layout primitives when repeated usage proves a shared abstraction is warranted.

[ ] Build generic form primitives and contract-agnostic composites aligned with the current application needs: labels, help text, validation text, field shells, string inputs, numeric inputs, sliders/ranges, enum-style selects, and collapsible groups, without coupling component APIs to `src/shared/presets.ts`, TanStack Form, or domain-specific preset compositions.

[ ] Add Storybook stories for every component folder under `src/client/src/components`, covering the folder's public surface through states such as default, disabled, invalid, loading, keyboard-focus, long-label, compact, dark-theme, and themed-override compatibility; use Storybook as the primary review surface for thin styled wrappers and do not create separate stories for nested private helper components.

[ ] Add React Testing Library coverage selectively for component folders whose public surface carries meaningful behavior or regression risk, including cases such as keyboard interaction, disabled states, validation messages, and controlled/uncontrolled value updates in form-library-agnostic usage, without introducing special accessibility-focused test requirements for this phase.

[ ] Validate the implementation with targeted tests and quality gates: run component test files, Storybook build, `npm run typecheck`, `npm run lint`, `npm run format`, and any focused stylelint checks for edited CSS modules.

[ ] Run the client and Storybook locally for exploratory review, checking console output, keyboard navigation, focus visibility, responsive behavior, text overflow, and visual consistency against the Figma design, with Storybook serving as the primary acceptance surface before feature integration.

## Risks and mitigations

- Manually copied Figma tokens can drift from the source design; keep the copied token surface small, traceable, and limited to values that genuinely improve the Radix baseline.
- Figma values may not map cleanly to Radix defaults; prioritize consistency and maintainability over pixel-perfect matching.
- Radix wrappers can become too generic or too domain-shaped; keep APIs driven by plain component concerns and current product needs, while leaving Control Model interpretation to a separate adapter layer outside `src/client/src/components`.
- App-shaped composites can accidentally turn into hidden feature code; keep them limited to reusable presentation and interaction patterns, and move any metadata interpretation, preset logic, or workflow-specific behavior into feature layers.
- Project-owned wrapper APIs can drift if they mirror Radix too loosely or diverge without purpose; keep wrappers thin, name props by product-facing UI semantics, and only expose variants and behaviors the application actually needs.
- Curated wrapper APIs can still accrete unnecessary escape hatches over time; default to explicit props and limited variants, allow `className` where useful, and require a concrete product need before exposing lower-level behavior.
- Form-library-specific assumptions can leak into the component layer through naming, event shapes, or helper props; keep integration adapters outside `src/client/src/components` and treat libraries such as TanStack Form as consumers of the component API, not part of it.
- Compound component APIs can sprawl and reintroduce low-level library concepts; prefer simple wrapper entry points first and add named slots or subcomponents only when there is repeated, stable composition pressure from the product.
- Per-instance styling knobs can erode visual consistency; keep most visual control in tokens, variants, CSS modules, and Radix theme configuration, and limit consumer overrides to targeted hooks such as `className`.
- A premature layout layer can bloat the component library with abstractions that do not survive contact with real screens; keep layout local to features until repeated patterns justify a shared primitive or Radix re-export.
- Direct deep imports make folder structure part of the de facto public API; keep component directories predictable and accept that moving files later may require broad import updates.
- Requiring stories for every component folder keeps the public surface reviewable, while selective tests keep maintenance proportional to behavioral risk instead of forcing low-value coverage for thin styled re-exports.
- Snapshot-style tests for thin visual wrappers would add noise without adding much confidence; keep visual review in Storybook and reserve automated tests for meaningful behavior and interaction risk.
- If Storybook is not treated as the canonical acceptance surface, the isolated component phase loses its main decision point and review standard; use it deliberately to approve API shape, states, look, and basic accessibility support before feature composition starts.
- Accessibility scope can expand endlessly if left undefined; for this phase, require solid baseline support through Radix-backed semantics, keyboard reachability, labeling where applicable, and visible focus treatment, but do not add special accessibility-specific automated testing requirements beyond the existing selective test strategy.
- If theme tokens remain too fluid during component development, Storybook acceptance becomes unstable and component APIs risk churning alongside visual decisions; keep core theme contracts steady and confine iteration to a clearly identified provisional subset.
- Storybook can drift from app runtime styling; load the same global styles and providers in both `src/client/src/main.tsx` and Storybook preview configuration.
- Component snapshots can become brittle; prefer user-visible interaction tests and visual/manual Storybook review unless a stable visual regression setup is later added.
