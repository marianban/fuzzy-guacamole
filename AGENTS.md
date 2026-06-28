# Comfy Frontend Orchestrator

LAN-hosted single-image img2img UI that orchestrates a remote ComfyUI instance.

## Scope

- Repo-wide rules live here.
- Frontend rules live in `src/client/AGENTS.md`.
- Backend/server rules live in `src/server/AGENTS.md`.

## Documentation

- Start with `docs/specs.MD`.
- Maintain `docs/architecture.MD` when code changes alter implemented architecture.
- Keep `docs/architecture.MD` concise and current-state only: no proposals, risks, future work, recommendations, or detailed folder maps. Prefer Mermaid plus short text.
- Use `docs/ComfyApi.md` for ComfyUI OpenAPI details.
- Code examples in `examples/` and referenced from specs.

## Development

- This repo has one root `package.json` for both frontend and backend; do not look for nested client/server package manifests.
- Write clean, maintainable TypeScript with descriptive filenames; avoid generic entrypoints like `index.ts`.
- Prefer thin orchestration/composition modules. Extract distinct concerns into responsibility-focused modules.
- Document important decisions and trade-offs.
- Use fail-fast behavior. Surface errors explicitly instead of silently ignoring invalid states.
- Keep test-only builders, fixtures, fakes, static constructors, and composition helpers in `test-support` or test files.

## Configuration

- Use environment-driven config with committed non-secret shape.
- Commit `data/config.json`; represent secrets or runtime-specific values as `ENV:VARIABLE_NAME` tokens.
- Define token values in `.env` or deployment env vars. Never commit secrets.
- Keep `.env.example` as the committed variable contract.

## Testing

- Use TDD for application behavior: write/adjust tests first and see new tests fail before implementation.
- TDD applies to meaningful application behavior and business logic. Do not add tests for highly boilerplate code with no business logic unless explicitly requested.
- Do not add tests for tooling-only config changes.
- Add/extend tests for every behavior change; bugfixes need regression tests.
- Delete stale tests/fixtures when fields, APIs, or behavior are removed.
- Prefer small deterministic tests; avoid timing-sensitive assertions.
- Name tests with `given_when_then` where practical.
- Assert outcomes and side effects, not implementation details.
- Keep setup minimal and reset shared state.
- Run relevant test files before marking work done.
- Coverage targets for `npm run test:coverage`: lines 75%, functions 75%, branches 65%, statements 75%.

## Quality Gate

- Format edited files with Prettier.
- ESLint must pass with zero errors for edited code.
- After feature tests pass, run focused automated tests, relevant integration coverage, and exploratory checks.

## MCPs And Skills

- Use Context7 MCP for library docs.
- Use Chrome DevTools MCP for UI verification/debugging.
- Use Wallaby MCP for test status, coverage, and failing-test debugging.
- Use skills from `.agents/skills/` when implementing features.

## CLI Defaults

- Text search: `rg`
- File discovery: `fd`
- JSON parsing: `jq`
- Assume these tools exist; use them before slower alternatives.
- Prefix shell commands with `rtk` (only on macos, don't use rtk on windows).
