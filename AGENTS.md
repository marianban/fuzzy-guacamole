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
- group related server code into responsibility-focused folders that behave like internal modules (without creating actual Node package modules)
- use descriptive filenames that communicate purpose, and avoid generic entrypoint names like `index.ts`
- document important decisions and trade-offs
- for database schema changes during the current development phase, do not preserve backward compatibility or existing data by default; prefer resetting/recreating the database and updating the current schema directly instead of adding backward-compatibility layers or maintaining old migrations, unless explicitly asked otherwise
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
- when constructing workers, clients, or other services, provide every required parameter explicitly; do not rely on hidden defaults for clocks, timeouts, or operational dependencies
- avoid conditional initialization of operational values inside application code; compute or inject required values at the composition or call site so contracts stay explicit and behavior does not silently depend on fallback branches
- keep test-only builders, fixtures, fakes, static service constructors, and composition helpers out of application source code; place them in `test-support` or test files instead
- when writing route handlers or other state-driven functions, handle invalid/error cases first with explicit guard conditions; after those guards, branch only on valid states and do not leave error responses as the default fallthrough path

## Testing Best Practices

- Implement tests as a separate step, and validate that new tests fail before moving to feature implementation.
- Do not add or update tests for repository configuration or tooling-only file changes such as `.fallowrc.json`, `eslint` config, `prettier` config, `package.json` script wiring, `wallaby.cjs`, `tsconfig`, or similar non-application files; keep tests focused on application behavior.
- Prefer small, deterministic tests; avoid timing-sensitive flakiness.
- Follow Test-Driven Development principles
- TDD applies to application code changes. For repository configuration or tooling-only edits, do not create or maintain tests that only assert config file contents.
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

## Preferred CLI tools

The following tools are installed and should be preferred over older or slower alternatives.

### Source code search

Use `rg` (ripgrep) for recursive text search in source code.

Examples:

```sh
rg "UserService"
rg "TODO|FIXME" src
rg --files | rg "\.ts$"
```

Prefer `rg` over:

- grep -R
- recursive shell loops
- PowerShell Select-String for large code searches

---

### File and directory discovery

Use `fd` for locating files and directories.

Examples:

```sh
fd package.json
fd "\.csproj$"
fd UserController
```

Prefer `fd` over:

- find
- manual recursive directory traversal
- PowerShell Get-ChildItem -Recurse for large searches

---

### Structural code search

Use `sg` (ast-grep) when searching by syntax or code structure rather than plain text.

Examples:

```sh
sg 'console.log($X)'
sg 'await $X'
sg 'class $NAME { $$$ }'
```

Prefer `sg` over `rg` when matching code patterns or performing syntax-aware refactors.

---

### File viewing

Use `bat` for viewing source files when reading code.

Examples:

```sh
bat src/index.ts
bat package.json
```

Prefer `bat` over:

- cat
- type
- raw Get-Content

---

### JSON parsing

Use `jq` for parsing or querying JSON.

Examples:

```sh
jq '.scripts' package.json
jq -r '.name' package.json
```

Do not parse JSON with regex unless there is no alternative.

---

## Tool preference order

Use these defaults:

- Text search → `rg`
- File discovery → `fd`
- Structural code search → `sg`
- File viewing → `bat`
- JSON parsing → `jq`

Assume these tools are present. Do not check whether they exist before using them.
Use these tools first instead of probing for alternatives.
Minimize trial-and-error command discovery.
