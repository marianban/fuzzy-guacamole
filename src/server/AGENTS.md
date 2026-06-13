# Server Instructions

Applies to `src/server`.

## Structure

- Keep route handlers and bootstrap code thin.
- Group related server code into responsibility-focused folders that behave like internal modules without becoming separate Node packages.
- Extract distinct concerns such as file loading, structural validation, value resolution, HTTP translation, workflow building, and persistence.
- Use descriptive filenames that reveal responsibility.

## Development

- Provide required constructor/service parameters explicitly; avoid hidden defaults for clocks, timeouts, and operational dependencies.
- At composition boundaries, inject explicit service contracts. Prefer whole-service references over passing only the one method currently used.
- Compute or inject operational values at composition/call sites; avoid conditional fallback initialization inside application code.

## Runtime Design

- Fail fast. Validate invalid/error cases first with explicit guards.
- After guards, branch only on valid states; do not use error responses as default fallthroughs.
- Pass every required worker, client, and service dependency explicitly.
- Avoid hidden defaults for operational dependencies such as clocks, timeouts, paths, clients, and stores.
- Prefer injecting whole services at composition boundaries instead of single methods.
- Keep operational value initialization at composition/call sites.

## Database

- During current development, do not preserve backward compatibility or data by default.
- Prefer resetting/recreating the database and updating the current schema directly.
- Add compatibility layers or old migrations only when explicitly requested.

## Test Support

- Keep server test builders, fixtures, fakes, and composition helpers in `src/server/test-support` or test files.
- Critical paths for coverage include API handlers, Comfy client integration, generation processing, persistence, and core workflow construction.

## Integration Tests

- External-infrastructure tests use `*.int.test.ts`.
- Do not add mode switches inside tests. Selection/mode belongs in runner or global setup scripts under `scripts/`.
- Integration tests run against real infrastructure when required: server, client, database, ComfyUI.
- Infrastructure startup is user-owned. The agent only runs integration commands and reports preflight failures.
- Run integration tests outside the Codex sandbox with escalation. Unit tests run in sandbox unless blocked.
