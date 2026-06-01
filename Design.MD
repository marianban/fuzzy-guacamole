# ComfyDeck Design Tokens

Status: reviewed proposal
Source: [Figma frame `1:763` - ComfyDeck Blank State (Guided)](https://www.figma.com/design/FA1kzx61L8S1uFSast8I49/FigmaMage?node-id=1-763&m=dev)

## Purpose

This document defines the initial ComfyDeck design-token contract before theme
code is added. The referenced AI-generated Figma frame contains 223 nodes but no
named Figma variables, paint styles, text styles, or effect styles. Its raw
values are visual references, not implementation requirements.

The reviewed contract deliberately reduces the token surface. Primitive tokens
hold reusable raw values, semantic tokens give those values meaning, and CSS
custom properties implement the contract in the browser. Component-only values
stay local unless repeated use proves that a shared token is useful.

Version one is a dark-only studio theme. It should feel restrained, compact, and
tool-like: the image workspace is primary, interface chrome is quiet, and the
lime accent is reserved for interactive emphasis and online state.

## Primitive Tokens

### Color

| Token                    | Value     | Use                                          |
| ------------------------ | --------- | -------------------------------------------- |
| `--color-surface-inset`  | `#0d0f08` | Recessed fields and diagnostics surfaces     |
| `--color-surface-base`   | `#12140d` | Page and canvas background                   |
| `--color-surface-panel`  | `#1a1c15` | Header, rail, and standard panel surfaces    |
| `--color-surface-raised` | `#292b23` | Raised controls and icon backgrounds         |
| `--color-olive-emphasis` | `#3d522a` | Form-control outlines and slider tracks      |
| `--color-olive-muted`    | `#434938` | Muted navigation and separators              |
| `--color-accent`         | `#bdee63` | Primary interaction, focus, and online state |
| `--color-fg-strong`      | `#f4ffda` | Highest-emphasis headings and labels         |
| `--color-fg-primary`     | `#e3e3d7` | Standard readable interface text             |
| `--color-fg-secondary`   | `#c4c9b2` | Supporting copy and labels                   |

### Alpha Colors

Only shared alpha roles belong in the global token layer. Other opacity
treatments remain local to the component stylesheet.

| Token                      | Value                    | Use                                       |
| -------------------------- | ------------------------ | ----------------------------------------- |
| `--color-accent-a10`       | `rgb(189 238 99 / 10%)`  | Accent-tinted surfaces and quiet outlines |
| `--color-olive-a10`        | `rgb(67 73 56 / 10%)`    | Overlay and low-emphasis borders          |
| `--color-olive-a30`        | `rgb(67 73 56 / 30%)`    | Standard separators and inactive borders  |
| `--color-fg-secondary-a50` | `rgb(196 201 178 / 50%)` | Disabled and low-priority text            |

### Typography

Self-host both font families so the application and Storybook render
consistently without runtime font requests.

| Token                     | Value                          | Role                                       |
| ------------------------- | ------------------------------ | ------------------------------------------ |
| `--font-family-interface` | `Manrope, sans-serif`          | Interface text, headings, and controls     |
| `--font-family-mono`      | `"Liberation Mono", monospace` | Diagnostics, telemetry, and numeric values |

| Token           | Value  |
| --------------- | ------ |
| `--font-size-1` | `10px` |
| `--font-size-2` | `12px` |
| `--font-size-3` | `14px` |
| `--font-size-4` | `16px` |
| `--font-size-5` | `20px` |

Use these reviewed text styles when implementing the Figma frame:

| Role             | Family                         | Size / line height | Weight       | Tracking |
| ---------------- | ------------------------------ | ------------------ | ------------ | -------- |
| Micro label      | `var(--font-family-interface)` | `10px / 15px`      | regular      | `1px`    |
| Navigation label | `var(--font-family-interface)` | `12px / 18px`      | regular      | `1px`    |
| Small body       | `var(--font-family-interface)` | `12px / 18px`      | regular      | `0`      |
| Body             | `var(--font-family-interface)` | `14px / 22px`      | regular      | `0`      |
| Heading          | `var(--font-family-interface)` | `16px / 24px`      | semi bold    | `0`      |
| Brand            | `var(--font-family-interface)` | `20px / 28px`      | semi bold    | `-1px`   |
| Telemetry        | `var(--font-family-mono)`      | `10px / 15px`      | regular/bold | `0`      |

Diagnostics may use a local `9px / 14px` mono style if the log panel density
requires it. Do not add `9px` to the shared scale unless another component needs
it.

### Spacing

The spacing scale maps cleanly to
[Radix Themes spacing](https://www.radix-ui.com/themes/docs/theme/spacing). Use
these tokens for layout rhythm. Generated centering offsets and text-flow
measurements are not spacing tokens.

| Token       | Value  | Radix equivalent |
| ----------- | ------ | ---------------- |
| `--space-1` | `4px`  | `--space-1`      |
| `--space-2` | `8px`  | `--space-2`      |
| `--space-3` | `12px` | `--space-3`      |
| `--space-4` | `16px` | `--space-4`      |
| `--space-5` | `24px` | `--space-5`      |
| `--space-6` | `32px` | `--space-6`      |

### Radius

| Token                | Value   | Use                                         |
| -------------------- | ------- | ------------------------------------------- |
| `--radius-control`   | `2px`   | Fields, buttons, compact panels             |
| `--radius-container` | `8px`   | Guided-workspace containers                 |
| `--radius-full`      | `999px` | Pills, status dots, clusters, slider thumbs |

### Shared Dimensions

Shared dimensions describe stable shell proportions and repeated controls. They
are not substitutes for component-specific layout CSS.

| Token                           | Value   | Use                          |
| ------------------------------- | ------- | ---------------------------- |
| `--size-top-bar-height`         | `56px`  | Top application bar          |
| `--size-control-rail-width`     | `320px` | Right control rail           |
| `--size-history-dock-height`    | `240px` | Bottom history dock          |
| `--size-control-height`         | `36px`  | Standard fields and buttons  |
| `--size-control-compact-height` | `32px`  | Compact segmented controls   |
| `--size-action-height`          | `44px`  | Primary and adjacent actions |
| `--size-slider-track-height`    | `4px`   | Slider track                 |
| `--size-slider-thumb`           | `12px`  | Slider thumb                 |

### Shadows

| Token                    | Value                                | Use                     |
| ------------------------ | ------------------------------------ | ----------------------- |
| `--shadow-overlay`       | `0 25px 50px -12px rgb(0 0 0 / 25%)` | Floating canvas overlay |
| `--shadow-status-online` | `0 0 8px var(--color-accent)`        | Online status glow      |

Backdrop blur for floating canvas controls remains component-local.

## Semantic Tokens

Semantic tokens are the application-facing contract. Theme CSS and component
CSS should use these tokens instead of primitive values or hardcoded colors.

| Token                              | Primitive alias                 | Meaning                                      |
| ---------------------------------- | ------------------------------- | -------------------------------------------- |
| `--color-background-page`          | `var(--color-surface-base)`     | Application and canvas background            |
| `--color-background-panel`         | `var(--color-surface-panel)`    | Header, rail, and standard panel background  |
| `--color-background-input`         | `var(--color-surface-inset)`    | Recessed form and diagnostic surfaces        |
| `--color-background-elevated`      | `var(--color-surface-raised)`   | Raised controls and icon surfaces            |
| `--color-background-accent-subtle` | `var(--color-accent-a10)`       | Accent-tinted surfaces                       |
| `--color-border-subtle`            | `var(--color-olive-a10)`        | Overlay and low-emphasis borders             |
| `--color-border-default`           | `var(--color-olive-a30)`        | Default separators and quiet borders         |
| `--color-border-emphasis`          | `var(--color-olive-emphasis)`   | Form-control outline and stronger separators |
| `--color-icon-muted`               | `var(--color-olive-muted)`      | Muted icons and inactive navigation          |
| `--color-text-primary`             | `var(--color-fg-primary)`       | Standard readable interface text             |
| `--color-text-strong`              | `var(--color-fg-strong)`        | Highest-emphasis labels and headings         |
| `--color-text-secondary`           | `var(--color-fg-secondary)`     | Labels and supporting copy                   |
| `--color-text-muted`               | `var(--color-fg-secondary-a50)` | Disabled and low-priority text               |
| `--color-interactive-accent`       | `var(--color-accent)`           | Primary interactive emphasis                 |
| `--color-interactive-track`        | `var(--color-olive-emphasis)`   | Slider and progress tracks                   |
| `--color-focus-ring`               | `var(--color-accent)`           | Keyboard focus treatment                     |
| `--color-status-online`            | `var(--color-accent)`           | Online status indicator                      |

Error, warning, starting, and offline status colors are intentionally
provisional. Add them when matching product states have been reviewed.

## Figma Transition Rules

Use this section when translating current or future AI-generated Figma screens
into application code. Prefer the replacement token even when a Figma frame
contains the old raw value. A local component value is acceptable only when the
table explicitly says so.

### Color Replacements

| Figma raw value                    | Replace with                             | Notes                                      |
| ---------------------------------- | ---------------------------------------- | ------------------------------------------ |
| `#0d0f08`                          | `var(--color-background-input)`          | Recessed surfaces                          |
| `#12140d`                          | `var(--color-background-page)`           | Page and canvas                            |
| `#1a1c15`                          | `var(--color-background-panel)`          | Header, rail, standard panels              |
| `#292b23`                          | `var(--color-background-elevated)`       | Raised controls                            |
| `#34362d` or `rgb(52 54 45 / 80%)` | component-local translucent raised fill  | Floating canvas controls only              |
| `#3d522a`                          | `var(--color-border-emphasis)`           | Strong outline or interactive track        |
| `#434938`                          | `var(--color-icon-muted)`                | Muted icon or inactive navigation          |
| `#bdee63`                          | `var(--color-interactive-accent)`        | Accent, focus, online state                |
| `#f4ffda`                          | `var(--color-text-strong)`               | Strong text                                |
| `#e3e3d7`                          | `var(--color-text-primary)`              | Primary text                               |
| `#c4c9b2`                          | `var(--color-text-secondary)`            | Secondary text                             |
| `rgb(189 238 99 / 10%)`            | `var(--color-background-accent-subtle)`  | Accent-tinted surface or border            |
| `rgb(67 73 56 / 10%)`              | `var(--color-border-subtle)`             | Quiet border                               |
| `rgb(67 73 56 / 30%)`              | `var(--color-border-default)`            | Default border or divider                  |
| `rgb(43 43 43 / 50%)`              | `var(--color-border-default)`            | Replace off-palette AI-generated divider   |
| `rgb(196 201 178 / 50%)`           | `var(--color-text-muted)`                | Disabled or low-priority text              |
| Other alpha variants               | component-local value                    | Promote only after repeated use            |
| SVG-only `#6b7280`, black strokes  | normalize inside the icon implementation | Do not create palette tokens for SVG noise |

### Typography Replacements

| Figma raw style                                | Replace with reviewed style                    |
| ---------------------------------------------- | ---------------------------------------------- |
| Space Grotesk headings                         | Manrope semi bold heading                      |
| `9px / 13.5px`, tracking `0.9px` labels        | `10px / 15px`, tracking `1px` micro label      |
| `10px / 15px`, tracking `1px` labels           | Keep as micro label                            |
| `11.2px / 16.8px`, tracking `1.12px` labels    | `12px / 18px`, tracking `1px` navigation label |
| `11px / 16.5px`, tracking `1.1px` button label | `12px / 18px`, tracking `1px` navigation label |
| `11px / 17.88px` body text                     | `12px / 18px` small body                       |
| `12px / 16px` body text                        | `12px / 18px` small body                       |
| `14px / 22.75px` body text                     | `14px / 22px` body                             |
| `18px / 28px`, tracking `-0.45px` heading      | `16px / 24px` Manrope semi bold heading        |
| `20px / 28px`, tracking `-1px` brand           | Keep size and tracking; use semi bold          |
| Liberation Mono numeric values                 | Keep as telemetry                              |
| Liberation Mono `9px` diagnostics              | Keep local to diagnostics if required          |

### Spacing And Radius Replacements

| Figma raw value                              | Replace with                                    |
| -------------------------------------------- | ----------------------------------------------- |
| `4px`, `8px`, `12px`, `16px`, `24px`, `32px` | Matching `--space-*` token                      |
| `20px` gap                                   | `var(--space-5)` when separating groups         |
| `23px`, `23.99px` gap                        | `var(--space-5)`                                |
| Fractional padding such as `14.75px`         | Nearest spacing token, usually `--space-4`      |
| Fractional generated centering offsets       | Recreate with layout alignment; do not tokenize |
| `2px` radius                                 | `var(--radius-control)`                         |
| `8px` radius                                 | `var(--radius-container)`                       |
| `12px` radius on pills and clusters          | `var(--radius-full)`                            |
| `6px` radius on `12px` slider thumb          | `var(--radius-full)` or `50%`                   |

### Dimension And Shadow Replacements

| Figma raw value                                       | Replace with                         |
| ----------------------------------------------------- | ------------------------------------ |
| `56px` top bar                                        | `var(--size-top-bar-height)`         |
| `320px` right rail                                    | `var(--size-control-rail-width)`     |
| `240px` history dock                                  | `var(--size-history-dock-height)`    |
| `34px`, `35px` standard controls                      | `var(--size-control-height)`         |
| `29px` segmented control                              | `var(--size-control-compact-height)` |
| `44px`, `46px` action controls                        | `var(--size-action-height)`          |
| `4px` slider track                                    | `var(--size-slider-track-height)`    |
| `12px` slider thumb                                   | `var(--size-slider-thumb)`           |
| `0 25px 50px -12px rgb(0 0 0 / 25%)`                  | `var(--shadow-overlay)`              |
| `0 0 8px #bdee63`                                     | `var(--shadow-status-online)`        |
| Action and selected segmented-control drop shadows    | remove; use fill, border, and accent |
| Textarea, diagnostics, and composed-layout dimensions | component-local value                |

## Audit Notes

- The reviewed primitive surface contains 40 shared tokens: 10 opaque colors, 4
  alpha colors, 2 font families, 5 font sizes, 6 spacing values, 3 radii, 8
  shared dimensions, and 2 shadows.
- The Figma frame uses 18 typography combinations. The reviewed styles reduce
  them to seven shared roles plus one optional diagnostics exception.
- `docs/ui-spec.md` contains an earlier exploratory palette. This reviewed
  contract supersedes those raw color suggestions for implementation.
- Figma gradients used by the VRAM indicator and primary actions are
  component-level treatments. Their stops should reference semantic color
  tokens rather than introduce gradient tokens during bootstrap.

## Styled Control Bootstrap Plan

The token contract is library-agnostic. Future themed controls should use
Mantine as the default styled layer, while React Aria or Radix Primitives stay
available as headless escape hatches for bespoke behavior-heavy widgets. The
next implementation pass should establish the shared Mantine theme adapter only.
It must not add unrelated application components, Storybook stories, or feature
layouts.

1. Install Mantine packages and keep the self-hosted font packages for Manrope
   and Liberation Mono.
2. Add shared global theme styles under `src/client/src/styles`. Use CSS custom
   properties as the source of truth with separate primitive and semantic
   sections. Do not add JSON token-generation tooling initially.
3. Import Mantine's base stylesheet before project overrides so local CSS wins
   in the cascade.
4. Wrap both the application root and Storybook preview with the same
   `MantineProvider` configuration:

   ```tsx
   <MantineProvider theme={comfyDeckMantineTheme}>{children}</MantineProvider>
   ```

5. Map project semantic variables onto Mantine theme values and component
   extensions. Prefer `theme.components`, `defaultProps`, `classNames`, and
   component CSS variable resolvers before per-instance CSS overrides so control
   styling stays explicit and reviewable.
6. Load the same project theme stylesheet in the application and Storybook.
   Keep the shared provider wrapper as the single place that configures the
   styled component layer for both environments.

## Validation Plan

After the later theme bootstrap implementation:

1. Run Prettier, ESLint, Stylelint, TypeScript checks, and the Storybook build.
2. Start the client and Storybook locally and confirm they render the same dark
   theme, self-hosted fonts, surfaces, accent color, and focus treatment.
3. Check browser console output and network traffic for blocking errors.
4. Do not add application behavior tests for the theme-only bootstrap. Add tests
   when components or runtime behavior are introduced.

## Review Decisions

- Version one is dark-only.
- CSS custom properties are the initial source of truth.
- Primitive and semantic tokens remain separate even without generation
  tooling.
- The bootstrap self-hosts Manrope and Liberation Mono.
- Space Grotesk is removed to keep the product within the two-family limit.
- Semantic tokens are the application-facing contract.
- Mantine is the default styled component layer for future controls; React Aria
  or Radix Primitives remain optional headless escape hatches.
- Exact Figma values are implementation inputs, not implementation
  requirements. Apply the transition tables when translating screens.
- Component-specific tokens stay deferred until repeated usage justifies them.

## References

- [Penpot: The developer's guide to design tokens and CSS variables](https://penpot.app/blog/the-developers-guide-to-design-tokens-and-css-variables/)
- [Mantine: Theme object](https://mantine.dev/theming/theme-object/)
- [Mantine: Styles API](https://mantine.dev/styles/styles-api/)
- [Mantine: Default props](https://mantine.dev/theming/default-props/)
