# Client Instructions

Applies to `src/client`.

## React And TypeScript

- Prefer simple typed props/state; avoid `any`.
- Keep components focused; extract reusable logic into hooks.
- Use semantic HTML, accessible labels/roles, keyboard support, and focus states.
- Minimize global state. Keep server/client boundaries clear.
- Handle loading, error, and empty states explicitly.
- Variant props use unions, for example `variant: 'primary' | 'secondary'`.
- Extract magic values to named constants; share constants when reused.
- No relative imports beyond the parent directory.
- Map shared components as `#root/components`.

## Styling

- Use CSS modules for custom styles.
- When creating or extracting a component, colocate styles as `ComponentName.module.css`.
- Keep class names consistent and avoid ad-hoc inline styles.
- Never hardcode hex colors; use `var(--color-*)` tokens.
- Use `src/client/src/styles/theme.css` as the design-token source of truth.
- Use `src/client/src/styles/comfy-deck-theme.tsx` as the shared Mantine provider for app and Storybook.
- When implementing Figma designs, treat Figma font sizes as visual references rather than specifications. Follow accessible typography best practices: default to readable theme sizes, never use less than `12px`, and use the `12px` minimum only when the user explicitly requests it.
- Do not write CSS media queries unless explicitly requested.

## Localization

- Do not manually inspect or edit `src/client/public/locales`; translations come from `i18n:extract`.
- Define translation calls with component-prefixed keys and defaults, for example `t('Navigation.Generations', 'Generations')`.
- Extracted translations use the default namespace.

## Testing

- Do not write tests for code under `src/client/src/api` unless explicitly requested; these modules are primarily boilerplate API wrappers and query definitions.
- Use `@testing-library/react` with user-visible queries such as `getByRole` and `getByLabelText`.
- Drive interactions with `user-event`.
- Assert rendered text, disabled states, network calls, and other user-visible outcomes.

## TanStack Router

- In `src/client/src/routes`, prefix pathless layout folders with `_`; prefix colocated non-route files with `-` so TanStack Router excludes them from the route tree.

## Folder Guide

- `src/client/src/components`: shared non-feature components.
- `src/client/src/features`: feature-specific components, hooks, and styles.
- `src/client/src/layout`: shared page structure.
- `src/client/src/routes`: top-level route/page composition.
- `src/client/src/api`: backend API clients.
- `src/client/src/utils`: shared utilities.
- `src/client/src/styles`: global styles, tokens, assets.
- `src/client/public/locales`: generated localization files.
