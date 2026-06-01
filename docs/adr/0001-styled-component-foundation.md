---
status: accepted
---

# Prefer Mantine over Radix Themes for the styled control layer

ComfyDeck will migrate its styled React component layer from Radix Themes to Mantine while keeping `src/client/src/styles/theme.css` as the canonical design-token contract. We made this decision after the first themed control landed: Radix Themes is not the same thing as headless Radix Primitives, and the current problem is specifically with Radix Themes' coarse provider API plus per-instance variants, which already pushed basic control concerns such as border color, disabled affordance, padding, and typography into Radix-owned CSS variable remapping inside the `TextArea` wrapper. Mantine is the better default because it documents provider-level `theme.components`, `defaultProps`, `classNames`, and component CSS variable resolvers for those same concerns, while React Aria remains a strong headless option for future bespoke widgets but would move common control theming back into authored CSS rather than solving the current theme-layer problem.

## Considered Options

- Stay on Radix Themes: rejected because the first wrapped control already needs vendor-specific CSS variable remapping for routine design-system requirements and that cost will compound as more controls are added.
- Switch the primary control layer to React Aria: rejected because React Aria is intentionally unstyled and would require ComfyDeck to author and maintain the full styled control surface itself.
- Switch the primary control layer to Mantine and keep headless escape hatches available: accepted because it matches the current need for explicit, provider-level control theming while preserving the option to use React Aria or Radix Primitives where behavior matters more than shared styling.

## Consequences

- `src/client/src/styles/theme.css` stays the styling source of truth; Mantine theme objects act as adapters onto that token contract rather than replacing it.
- The migration cost is currently low because the active client surface is limited to one shared provider, one wrapped `TextArea`, one Storybook story file, and one component test file.
- The highest migration risks are visual churn from Mantine defaults, accidental accessibility regressions during wrapper replacement, and tests that currently assert Radix implementation classes instead of ComfyDeck behavior.
- The first incremental PR should replace the shared provider with `MantineProvider`, add one shared ComfyDeck Mantine theme adapter, migrate the existing `TextArea` wrapper and its Storybook/test coverage, and remove `@radix-ui/themes` from the active client surface.
