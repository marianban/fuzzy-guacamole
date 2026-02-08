# ExecPlans

When writing complex features or significant refactors, use an ExecPlan (as described in `.agent/PLANS.md`) from design to implementation.

# Comfy Frontend Orchestrator

This repo currently contains the product specification and agent workflow docs for a LAN-hosted "single-image img2img" UI that orchestrates a remote ComfyUI instance.

## Documentation

- Specs live in `docs/`. Start with `docs/specs.MD`.
- Agent process docs live in `.agent/`.
- ComfyUI OpenAPI docs in `docs/ComfyApi.md` use when needed.
- Code examples should be in `examples/` and referenced from specs when relevant.

## Development Best Practices

- follow good software engineering practices
- write clean, maintainable code
- document important decisions and trade-offs
- write tests to ensure code quality and prevent regressions
- after implementing a feature ensure a good test coverage, check linting and formatting and fix any issues. Then run the app locally to verify the feature works as expected by using chrome devtools mcp. Verify no errors are shown in the console and network tab. In case of warnings evaluate if they should be fixed.
- for naming tests use given_when_then format where applicable.
- format code using prettier

## Testing Best Practices

- Implement tests as a separate step, and validate that new tests fail before moving to feature implementation.
- Prefer small, deterministic tests; avoid timing-sensitive flakiness.
- Add/extend tests with every behavior change; bugfixes require a regression test.
- For UI: use `@testing-library/react` with user-visible queries (`getByRole`, `getByLabelText`), and drive interactions with `user-event`.
- Assert outcomes/side effects (rendered text, disabled states, network calls) rather than implementation details.
- Keep test setup minimal (helpers/factories are fine); reset shared state between tests.
- Run the relevant test file(s) locally before marking work done.

## Frontend Best Practices (React + TypeScript)

- Prefer simple, typed props/state; avoid `any` and keep types close to usage.
- Keep components small and focused; extract reusable logic into hooks.
- Use semantic HTML + accessibility by default (labels, roles, keyboard, focus states).
- Minimize global state; lift state only when needed; keep server/client boundaries clear.
- Handle loading/error/empty states explicitly; never leave UI in ambiguous states.
- Use CSS modules for styling; keep class names consistent and avoid ad-hoc inline styles.


## MCPs to use for Implementation

When working with libraries always use context7 mcp server to get relevant docs.
When implementing ui features you can verify result or debug issues using Chrome Devtools MCP.
Wallaby MCP server can be used to check test status and debug failing tests.

## Skills

For documentation update use doc-coauthoring skill.
For designing frontend ise case use frontend-design skill.
When evaluating tests or coverage use wallaby-testing skill.
