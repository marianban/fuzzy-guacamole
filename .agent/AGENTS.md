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
- prefer thin orchestration/composition modules; when a change introduces distinct concerns such as file loading, structural validation, value resolution, or HTTP translation, extract them into dedicated modules organized by responsibility instead of growing route handlers, bootstrap files, or catalog builders into mixed-purpose code
- document important decisions and trade-offs
- use environment-driven configuration with committed non-secret config files:
  - commit `data/config.json` with the full config shape visible in git
  - represent secret/runtime-specific values as `ENV:VARIABLE_NAME` tokens inside `data/config.json`
  - define token values in `.env` / deployment environment variables (never commit secrets)
  - keep `.env.example` committed as the required variable contract for local and container environments
- write tests to ensure code quality and prevent regressions
- after implementing a feature ensure a good test coverage, check linting and formatting and fix any issues. Then run the app locally to verify the feature works as expected by using chrome devtools mcp. Verify no errors are shown in the console and network tab. In case of warnings evaluate if they should be fixed.
- for naming tests use gherkin syntax given_when_then format where applicable.
- format code using prettier
- mandatory quality gate for every code change: all edited files must be Prettier-formatted and pass ESLint with zero lint errors before the task is considered complete.
- mandatory post-feature quality gate (after tests pass): run focused automated tests that cover the new/changed feature (not only broad full-suite runs), add and run integration tests that capture the new/changed behavior through real infrastructure, run exploratory tests against the implemented behavior, and start the real server and real client locally (`npm run dev:server` and client dev command) to verify startup succeeds and no blocking runtime errors appear in logs, browser console, or network traffic.
- use fail-fast principles, do not write defensive code that silently ignores errors or edge cases; instead, let errors surface and fix the underlying issues to ensure robustness and reliability.

## Testing Best Practices

- Implement tests as a separate step, and validate that new tests fail before moving to feature implementation.
- Prefer small, deterministic tests; avoid timing-sensitive flakiness.
- Follow Test-Driven Development principles
- Add/extend tests with every behavior change; bugfixes require a regression test.
- Do not keep or add tests for removed fields, APIs, or behaviors. When a feature is deleted from the contract, delete stale tests and stale fixture data instead of adding tests like "without removedField succeeds". If you notice such a test during development, remove it.
- For UI: use `@testing-library/react` with user-visible queries (`getByRole`, `getByLabelText`), and drive interactions with `user-event`.
- Assert outcomes/side effects (rendered text, disabled states, network calls) rather than implementation details.
- Keep test setup minimal (helpers/factories are fine); reset shared state between tests.
- Run the relevant test file(s) locally before marking work done.
- For each new/changed feature, run targeted automated tests for that feature, and add/run integration coverage that exercises the same user flow through real infrastructure.
- Increase practical text coverage over time and prioritize tests for critical paths (API handlers, Comfy client integration, and core UI flows).
- Coverage targets for `npm run test:coverage` should meet these minimum thresholds:
  - lines: 75%
  - functions: 75%
  - branches: 65%
  - statements: 75%
- Any intentional coverage gaps should be documented in PR notes with a short rationale.
- Any test that depends on external infrastructure such as a real database, local API server, client, or ComfyUI must use the `*.int.test.ts` naming convention.
- Do not add environment/mode switches inside test files (for example `runIf(...)`, `API_TEST_MODE`, `COMFY_TEST_MODE`, `API_RUN_LOCAL_TESTS`, `COMFY_RUN_LOCAL_TESTS`).
- Test selection and environment mode must be controlled by runner/global setup scripts in `scripts/` (for example unit runner excludes infrastructure-dependent suffixes and the explicit integration runner targets `.int.test.ts`).
- Integration tests run against real infrastructure where required, including the real server, client, database, and ComfyUI.
- For integration runs, infrastructure startup is user-owned: client, API server, database, and ComfyUI must be started by the user before the agent runs tests.
- The agent must not start or stop client/server/database/ComfyUI as part of integration execution; the agent only runs the integration test command and reports preflight failures/instructions.
- Sandbox policy for Codex test execution:
  - Integration tests must always be executed outside the Codex sandbox (request escalated permissions for `npm run test:int` and targeted `.int.test.ts` runs).
  - Unit tests may be executed inside the sandbox by default, and escalated only when sandbox limitations block execution.

## Frontend Best Practices (React + TypeScript)

- Prefer simple, typed props/state; avoid `any` and keep types close to usage.
- Keep components small and focused; extract reusable logic into hooks.
- Use semantic HTML + accessibility by default (labels, roles, keyboard, focus states).
- Minimize global state; lift state only when needed; keep server/client boundaries clear.
- Handle loading/error/empty states explicitly; never leave UI in ambiguous states.
- Use CSS modules for styling; keep class names consistent and avoid ad-hoc inline styles.
- Variant props should use union types: `variant: 'primary' | 'secondary'`
- `src\client\src\components` - should be mapped to `#root/components` in the project structure when using
- Never hardcode hex colors - use `var(--color-*)` tokens
- Custom styles go in component-level CSS modules
- No relative imports beyond parent directory
- Extract magic numbers/values to named constants. If same constant is used in multiple places, extract to a shared constants.ts module.


## MCPs to use for Implementation

When working with libraries always use context7 mcp server to get relevant docs.
When implementing ui features you can verify result or debug issues using Chrome Devtools MCP.
Wallaby MCP server should be used by the agent to check test status, inspect covered lines, and debug failing tests.

## Skills

Use skills from `.agents/skills/` when implementing features.

## Frontend

### Folder Structure Guidelines

- `src\client\src\components` - shared components that are not specific to a single page or feature
- `src\client\src\features` - feature-specific components, hooks, and styles organized by feature domain
- `src\client\src\layouts` - shared layout components that define page structure (headers, footers, sidebars)
- `src\client\src\utils` - shared utility functions and helpers
- `src\client\src\pages` - top-level page components that compose features and layouts into complete pages
- `src\client\src\api` - API client code for communicating with the backend server
- `src\client\src\i18n` - localization files and setup for react-i18next
- `src\client\src\styles` - global styles, CSS variables, and design tokens

# FE Development Guidelines
