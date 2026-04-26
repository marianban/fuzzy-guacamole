# Persist Draft Defaults and Add Generation PATCH

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `.agent/PLANS.md` from the repository root. A future contributor should be able to resume from this file alone, using the current working tree and the commands listed here.

## Purpose / Big Picture

Users create image generation drafts from presets. A preset is a saved configuration that includes a template identifier and model fields with defaults such as prompt or step count. Today the server accepts partial draft parameters, validates them against defaults in memory, but stores only the raw user-provided object. If the user creates a draft with `presetParams: {}`, the persisted draft can later reopen as empty even though the UI originally showed defaults. This change makes the server store the resolved parameter snapshot, meaning model and preset defaults are written into the generation record.

After this change, `POST /api/generations` returns and persists defaults, `GET /api/generations/{generationId}` returns the same persisted resolved snapshot, and `PATCH /api/generations/{generationId}` lets the client replace the editable generation snapshot while the generation is not active. An active generation means status `queued` or `submitted`; those states must return HTTP 409 for PATCH. Draft and terminal states, meaning `draft`, `completed`, `failed`, and `canceled`, can be edited before queueing or requeueing.

## Progress

- [x] (2026-04-26T16:01:20Z) Read `.agent/PLANS.md`, the relevant skills, current route/store files, resolver, validator, and existing generation tests.
- [x] (2026-04-26T16:01:20Z) Created this ExecPlan before production code changes.
- [x] (2026-04-26T16:09:51Z) Added failing unit tests for shared schema, route create defaults, PATCH behavior, store guards, OpenAPI, and Postgres integration persistence.
- [x] (2026-04-26T16:09:51Z) Ran the focused unit tests and captured the expected red failures: missing `updateGenerationRequestSchema`, missing `updateEditableGeneration`, PATCH returning 404, OpenAPI missing PATCH, and POST returning raw `{}` params.
- [ ] Implement schema, POST persistence, PATCH route, and store updates.
- [ ] Update specs and architecture docs to match implemented behavior.
- [ ] Run focused unit tests, integration tests, typecheck, lint, format, and local startup/browser checks as far as the environment allows.

## Surprises & Discoveries

- Observation: The shell does not have `bat` or `fd` available even though the repo preference list says to use them.
  Evidence: PowerShell reported `The term 'bat' is not recognized` and `The term 'fd' is not recognized`; `rg --files` and `Get-Content` were used instead.

- Observation: Unit tests cannot start Vitest inside the Codex sandbox in this environment.
  Evidence: `npm run test -- ...` failed while loading `vitest.config.ts` with `Error: spawn EPERM`. The same command ran outside the sandbox and produced the expected red test failures.

## Decision Log

- Decision: PATCH uses full editable snapshot semantics for model parameters. Same-preset PATCH preserves runtime-only keys already stored on the generation, such as `inputImagePath`, then resolves defaults over the submitted model snapshot. Preset-switch PATCH ignores all previous parameters and resolves from the target preset plus the submitted body.
  Rationale: The user-provided implementation plan explicitly chooses full snapshot behavior and says preset switching clears existing params. Preserving runtime-only keys only for same-preset edits prevents uploaded input references from being lost when changing sliders or prompts.
  Date/Author: 2026-04-26 / Codex

- Decision: No database migration is planned.
  Rationale: `preset_params` is already JSON data and can store resolved snapshots without schema changes.
  Date/Author: 2026-04-26 / Codex

## Outcomes & Retrospective

No implementation outcome yet. This section will be updated after tests and code changes are complete.

## Context and Orientation

The shared generation contract lives in `src/shared/generations.ts`. It defines Zod schemas, which are runtime validators and TypeScript type sources. `createGenerationRequestSchema` currently requires `presetId` and `presetParams` for `POST /api/generations`. This plan adds an `updateGenerationRequestSchema` with the same body shape for PATCH.

Generation HTTP routes live in `src/server/http/routes/generations.ts`. The create route currently calls `resolvePresetParams` and `validateCreatePresetParams`, but passes `request.body.presetParams` to the store. That is the source of the missing persisted defaults. The same file should add `PATCH /api/generations/:generationId`.

Preset parameter resolution lives in `src/server/presets/preset-params-resolver.ts`. It creates a new object by applying model field defaults, then preset defaults, then optional system parameters, then user parameters. Validation lives in `src/server/presets/preset-params-validator.ts`. `validateCreatePresetParams` checks that submitted raw keys are model fields and that the resolved model values satisfy required fields, bounds, types, and enum choices. Runtime-only keys such as `inputImagePath` are intentionally not part of create-time model validation.

The generation store interface is in `src/server/generations/store.ts`. It is implemented by `src/server/generations/in-memory-store.ts` for unit tests and by `src/server/generations/postgres-store.ts` for database-backed operation. Both stores currently support create, input image updates, queueing, cancellation, deletion, and lifecycle transitions. This plan adds `updateEditableGeneration(generationId, input)`, where editable means status `draft`, `completed`, `failed`, or `canceled`.

The public generation type does not include internal execution metadata. Stored generations in `src/server/generations/stored-generation.ts` include `executionSnapshot`, `promptRequest`, and `promptResponse`. PATCH should update the public editable fields and leave status, queued time, error, and prompt metadata unchanged unless the current store patterns require copying metadata through. The queue path already clears run metadata when a generation is queued again.

Documentation lives in `docs/specs.MD` and `docs/architecture.MD`. Architecture document policy `ARCH-CURRENT-HL-001` says the architecture doc must remain high-level, concise, current-state only, and should not include future proposals.

## Plan of Work

First, add tests before implementation. Extend `src/shared/generations.test.ts` to assert that the new update schema requires both `presetId` and `presetParams`. Extend `src/server/generations/generations.test.ts` with focused route tests: create with empty params persists defaults and GET returns them; PATCH can switch presets and update `templateId`; PATCH rejects invalid model params; terminal statuses can be patched; queued and submitted statuses return 409; same-preset patch preserves `inputImagePath` while replacing editable model params.

Next, add store tests. In `src/server/generations/in-memory-store.test.ts`, assert `updateEditableGeneration` returns an updated public generation for draft and terminal statuses, and returns `undefined` for queued or submitted statuses. In `src/server/generations/store.test.ts`, assert the Postgres implementation performs a single status-guarded SQL update and returns `undefined` when no row is returned.

After the red tests fail for the expected reasons, implement the smallest production changes. Add `updateGenerationRequestSchema` and its exported TypeScript type. Extend `GenerationStore` with `UpdateEditableGenerationInput` and `updateEditableGeneration`. Implement it in memory by checking the existing generation status and replacing `presetId`, `templateId`, and `presetParams` with a fresh timestamp. Implement it in Postgres with one SQL `update generations ... where id = ... and status in ('draft', 'completed', 'failed', 'canceled') returning ...`.

Change `POST /api/generations` so it stores the already-resolved parameters after validation instead of the raw submitted object. Add the PATCH route before the input upload route in `src/server/http/routes/generations.ts`. The route should load the existing generation first, return 404 when missing, return 409 when active, load the target preset and return 404 if missing, compute submitted editable params, resolve defaults, validate with `validateCreatePresetParams`, call `store.updateEditableGeneration`, publish the updated generation event, and return the updated generation. For same-preset PATCH, merge preserved runtime-only params from the existing generation into the raw params before resolving and validating; runtime-only means keys not present in the target preset model fields. For preset switch, do not preserve old keys.

Finally, update `docs/specs.MD`, `docs/architecture.MD`, and the OpenAPI assertion test. Add integration tests to `src/server/db/db.int.test.ts` proving resolved defaults and patched terminal params survive server rebuild against Postgres.

## Concrete Steps

Work from repository root `e:\src\fuzzy-guacamole`.

Run the focused unit tests after adding tests and before production code:

    npm run test -- src/shared/generations.test.ts src/server/generations/generations.test.ts src/server/generations/in-memory-store.test.ts src/server/generations/store.test.ts src/server/http/openapi.test.ts

Expected red phase: tests referencing `updateGenerationRequestSchema`, `PATCH /api/generations/{generationId}`, or `updateEditableGeneration` fail because those interfaces do not exist yet or return 404.

After implementation, run:

    npm run test -- src/shared/generations.test.ts src/server/generations/generations.test.ts src/server/generations/in-memory-store.test.ts src/server/generations/store.test.ts src/server/http/openapi.test.ts
    npm run test:int -- src/server/db/db.int.test.ts
    npm run typecheck
    npm run lint
    npm run format

Per repository policy, integration tests must run outside the Codex sandbox. If the integration command requires escalation, request it and report any infrastructure preflight failure clearly.

For manual startup verification, start the real server and client with:

    npm run dev:server
    npm run dev:client

Then use Chrome DevTools MCP against the local client URL to confirm there are no blocking console errors or failed network calls during startup.

## Validation and Acceptance

Acceptance is behavior-based. Creating a generation through `POST /api/generations` with body `{ "presetId": "img2img-basic/basic", "presetParams": {} }` should return status 201 and a generation whose `presetParams` includes defaults from the preset model and preset defaults. A subsequent `GET /api/generations/{generationId}` should return the same defaulted values without fetching preset metadata.

PATCH acceptance has four parts. A draft generation can be patched with a new `presetId` and `presetParams`, and the response should show the new `templateId` and resolved defaults for the new preset. A completed, failed, or canceled generation can be patched before requeue. A queued or submitted generation returns HTTP 409. Invalid create-time model parameters return HTTP 400 and mention the invalid field.

Persistence acceptance is covered by Postgres integration tests. After closing the first server and database connection and constructing a second server over the same test database, GET should still show defaulted create params. A patched terminal generation should also reopen with the patched params after rebuild.

## Idempotence and Recovery

The planned code changes are additive except for storing resolved params instead of raw params on create. No destructive database operation is required. The tests create temporary directories and test databases through existing helpers and clean them up in `afterEach` or `finally` blocks. If a test run is interrupted, rerun the same focused command; the test helpers should create new temporary resources.

If an edit causes a broad failure, use `git diff` to inspect only the files touched for this plan and correct forward. Do not reset or revert unrelated user changes. The current worktree already has user changes in `TODO.md` and an untracked `PLAN.md`; this plan does not modify either file.

## Artifacts and Notes

Initial discovery showed:

    git status --short
     M TODO.md
    ?? PLAN.md

Those are existing user changes and should remain untouched.

Relevant current behavior in `src/server/http/routes/generations.ts`:

    const resolvedParams = resolvePresetParams({ preset, userParams: request.body.presetParams });
    validateCreatePresetParams({ preset, rawParams: request.body.presetParams, resolvedParams });
    const generation = await options.store.create({
      presetId: request.body.presetId,
      templateId: preset.templateId,
      presetParams: request.body.presetParams
    });

The final implementation should pass `resolvedParams` to `store.create`.

## Interfaces and Dependencies

In `src/shared/generations.ts`, export:

    export const updateGenerationRequestSchema = z.object({
      presetId: z.string().min(1),
      presetParams: z.record(z.string(), z.unknown())
    });

    export type UpdateGenerationRequest = z.infer<typeof updateGenerationRequestSchema>;

In `src/server/generations/store.ts`, define:

    export interface UpdateEditableGenerationInput {
      presetId: string;
      templateId: string;
      presetParams: Record<string, unknown>;
    }

and add this method to `GenerationStore`:

    updateEditableGeneration(
      generationId: string,
      input: UpdateEditableGenerationInput
    ): Promise<Generation | undefined>;

The PATCH route should use existing `resolvePresetParams`, `validateCreatePresetParams`, `generationSchema`, `generationParamsSchema`, and `errorResponseSchema`. It should publish a `GenerationEventBus` upsert event when a generation is updated.

Plan revision note 2026-04-26: Initial ExecPlan created before production code changes to satisfy repo process requirements and record the agreed implementation semantics.

Plan revision note 2026-04-26: Updated progress and discoveries after the red test run. The failure set confirms the new tests are exercising missing behavior rather than existing implementation.
