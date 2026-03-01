# ExecPlans

When writing complex features or significant refactors, use an ExecPlan (as described in `.agent/PLANS.md`) from design to implementation.

# Comfy Frontend Orchestrator

This repo currently contains the product specification and agent workflow docs for a LAN-hosted "single-image img2img" UI that orchestrates a remote ComfyUI instance.

## Documentation

- Specs live in `docs/`. Start with `docs/specs.MD`.
- When writing code, create and maintain architecture docs in `docs/architecture.MD`.
- Architecture policy ID: `ARCH-CURRENT-HL-001`.
- Keep `docs/architecture.MD` high-level and concise. Prefer Mermaid diagrams plus short text.
- `docs/architecture.MD` is current-state only: include only behavior currently backed by code, remove outdated content, and exclude proposals, future plans, risks, recommendations, and detailed folder breakdowns.
- Update `docs/architecture.MD` only when code changes alter the implemented architecture.
- Agent process docs live in `.agent/`.
- ComfyUI OpenAPI docs in `docs/ComfyApi.md` use when needed.
- Code examples should be in `examples/` and referenced from specs when relevant.

## Development Best Practices

- follow good software engineering practices
- write clean, maintainable code
- document important decisions and trade-offs
- write tests to ensure code quality and prevent regressions
- after implementing a feature ensure a good test coverage, check linting and formatting and fix any issues. Then run the app locally to verify the feature works as expected by using chrome devtools mcp. Verify no errors are shown in the console and network tab. In case of warnings evaluate if they should be fixed.
- for naming tests use gherkin syntax given_when_then format where applicable.
- format code using prettier
- mandatory quality gate for every code change: all edited files must be Prettier-formatted and pass ESLint with zero lint errors before the task is considered complete.
- mandatory post-feature quality gate (after tests pass): run focused automated tests that cover the new/changed feature (not only broad full-suite runs), add and run E2E tests that capture the new/changed behavior, run exploratory tests against the implemented behavior, and start the real server and real client locally (`npm run dev:server` and client dev command) to verify startup succeeds and no blocking runtime errors appear in logs, browser console, or network traffic.

## Testing Best Practices

- Implement tests as a separate step, and validate that new tests fail before moving to feature implementation.
- Prefer small, deterministic tests; avoid timing-sensitive flakiness.
- Follow Test-Driven Development principles
- Add/extend tests with every behavior change; bugfixes require a regression test.
- For UI: use `@testing-library/react` with user-visible queries (`getByRole`, `getByLabelText`), and drive interactions with `user-event`.
- Assert outcomes/side effects (rendered text, disabled states, network calls) rather than implementation details.
- Keep test setup minimal (helpers/factories are fine); reset shared state between tests.
- Run the relevant test file(s) locally before marking work done.
- For each new/changed feature, run targeted automated tests for that feature, and add/run E2E coverage that exercises the same user flow end-to-end.
- Increase practical text coverage over time and prioritize tests for critical paths (API handlers, Comfy client integration, and core UI flows).
- Coverage targets for `npm run test:coverage` should meet these minimum thresholds:
  - lines: 75%
  - functions: 75%
  - branches: 65%
  - statements: 75%
- Any intentional coverage gaps should be documented in PR notes with a short rationale.
- E2E tests run against a real server and client instance

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
Wallaby MCP server should be used by the agent to check test status, inspect covered lines, and debug failing tests.

## Skills

Use skills from `.agents/skills/` when implementing features.
