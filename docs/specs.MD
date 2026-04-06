# Comfy Frontend Orchestrator -- Spec Draft v1

NAS-hosted | single-image img2img + txt2img | ComfyUI standard API

---

## 1) Goal

A LAN-hosted web application running on a NAS provides a simple UI to run **single-image img2img** and **txt2img** workflows on a remote **ComfyUI** machine.

Key principles:
- One run = one output image (no batching in v1)
- Presets are exported ComfyUI workflows stored on disk
- Backend transparently wakes the remote machine + ComfyUI
- UI shows a full-page loader until the system is ready
- Cancel is per generation and must stop ComfyUI execution
- No auth, LAN-only, truly open on LAN
- Global history (no per-user sessions)

Terminology:
- A **generation** is a persisted record (DB + folders) that can be re-run multiple times.
- A **run** is one execution of a generation that produces one output image.

---

## 2) Development Stack

- Runtime: Node.js 24
- Framework: React, TypeScript (classic SPA no SSR needed), vite + react-ts template
 zod, swr for data fetching on the client
- Server: Fastify, REST for API and SSE for events + zod for validation, drizzle ORM for Postgres
- Linting/formatting: ESLint (use new flat config format), use https://typescript-eslint.io/getting-started + Prettier
plugins: https://www.npmjs.com/package/eslint-plugin-react-hooks
https://www.npmjs.com/package/eslint-plugin-react
  ```
  import reactHooks from 'eslint-plugin-react-hooks';
  import eslintReact from 'eslint-plugin-react;
  import globals from 'globals';
  export default defineConfig(
    eslint.configs.recommended,
    tseslint.configs.strict,
    tseslint.configs.stylistic,
    reactHooks.configs.flat.recommended,
    {
    files: ['**/*.{js,jsx,mjs,cjs,ts,tsx}'],
    plugins: {
      eslintReact,
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
      },
    }
  },
  ```);

  ```
  import reactHooks from 'eslint-plugin-react-hooks';

- Styling: CSS modules
- UI components library: Radix UI (for theme use <Theme appearance="dark"></Theme> wrapper), https://react-hook-form.com/ for forms + @hookform/resolvers for zod schema validation
- Database: Postgres
- Containerized (Docker, NAS-agnostic)
- Persistent volumes:
  - /data/config.json
  - /data/ssh/ (optional; SSH private key material for remote start)
  - /data/presets/
  - /data/inputs/
  - /data/outputs/
  - /data/logs/

Current target ComfyUI environment (locked for v1 integration):
- ComfyUI `0.8.2`
- ComfyUI_frontend `v1.36.13`
- ComfyUI-Manager `V3.39.2`
- LAN-only mode without authentication/CSRF

---

## 3) Configuration (file-based, no UI)

### /data/config.json
```json
{
  "comfyBaseUrl": "http://192.168.0.X:8188",
  "ssh": {
    "host": "192.168.0.X",
    "port": 22,
    "username": "windows-user",
    "privateKeyPath": "/data/ssh/id_ed25519"
  },
  "remoteStart": {
    "startComfyCommand": "cmd /c start \"\" /b \"E:\\\\comfyui\\\\ComfyUI-Easy-Install\\\\run_nvidia_gpu_SageAttention.bat\""
  },
  "wol": {
    "mac": "AA:BB:CC:DD:EE:FF",
    "broadcast": "192.168.0.255",
    "port": 9
  },
  "paths": {
    "presets": "/data/presets",
    "inputs": "/data/inputs",
    "outputs": "/data/outputs"
  },
  "timeouts": {
    "pcBootMs": 180000,
    "sshPollMs": 2000,
    "comfyBootMs": 180000,
    "healthPollMs": 2000,
    "historyPollMs": 1000
  }
}
```

Configuration policy:
- `/data/config.json` (or the path in `CONFIG_PATH`) is committed and contains the complete config shape.
- Secret or deployment-specific fields can use token values in the form `ENV:VARIABLE_NAME`.
- At runtime, token values are replaced with process environment variables before schema validation.
- Missing token variables are treated as configuration errors.
- `.env.example` documents required variables; real secret values live in `.env`/deployment env vars and are not committed.

---

## 4) Presets (workflow bundles on disk)

### 4.1 Structure
```
/data/presets/img2img-basic/
  |- preset.template.json
  |- model.json
  |- basic.preset.json
  `- advanced.preset.json
```

Folder naming rule:
- Folder name is `templateId` (for example `img2img-basic`).
- One template can have multiple preset variants (`1:N` relation).

### 4.2 preset.template.json
```json
{
  "id": "img2img-basic",
  "type": "img2img",
  "workflow": {}
}
```

Template rules:
- `workflow` is an exported ComfyUI workflow JSON with field-id template tokens.
- `preset.template.json` contains workflow structure only.
- Field metadata is defined in `model.json`, not inline in the template.

### 4.3 model.json
```json
{
  "templateId": "img2img-basic",
  "categories": [
    {
      "id": "main",
      "label": {
        "en": "Main",
        "sk": "Hlavne"
      },
      "order": 10,
      "presentation": {
        "collapsible": false,
        "defaultExpanded": true
      }
    },
    {
      "id": "advanced",
      "label": {
        "en": "Advanced Parameters",
        "sk": "Pokrocile parametre"
      },
      "order": 20,
      "presentation": {
        "collapsible": true,
        "defaultExpanded": false
      }
    }
  ],
  "fields": [
    {
      "id": "prompt",
      "fieldType": "string",
      "categoryId": "main",
      "order": 10,
      "label": {
        "en": "Prompt",
        "sk": "Prompt"
      },
      "description": {
        "en": "Primary instruction for the generation.",
        "sk": "Hlavna instrukcia pre generovanie."
      },
      "default": "",
      "validation": {
        "required": true,
        "maxLength": 4000
      },
      "control": {
        "type": "input",
        "multiline": true,
        "rows": 4,
        "placeholder": {
          "en": "Describe the image you want to generate",
          "sk": "Popiste obrazok, ktory chcete vygenerovat"
        }
      }
    },
    {
      "id": "negativePrompt",
      "fieldType": "string",
      "categoryId": "advanced",
      "order": 20,
      "label": {
        "en": "Negative Prompt",
        "sk": "Negativny prompt"
      },
      "default": "",
      "validation": {
        "required": false,
        "maxLength": 4000
      },
      "control": {
        "type": "input",
        "multiline": true,
        "rows": 3
      }
    },
    {
      "id": "steps",
      "fieldType": "integer",
      "categoryId": "advanced",
      "order": 30,
      "label": {
        "en": "Steps",
        "sk": "Kroky"
      },
      "default": 30,
      "validation": {
        "required": true,
        "min": 1,
        "max": 100
      },
      "control": {
        "type": "slider",
        "min": 1,
        "max": 100,
        "step": 1
      }
    },
    {
      "id": "cfg",
      "fieldType": "number",
      "categoryId": "advanced",
      "order": 40,
      "label": {
        "en": "CFG",
        "sk": "CFG"
      },
      "default": 7,
      "validation": {
        "required": true,
        "min": 1,
        "max": 20
      },
      "control": {
        "type": "slider",
        "min": 1,
        "max": 20,
        "step": 0.5
      }
    },
    {
      "id": "seedMode",
      "fieldType": "enum",
      "categoryId": "advanced",
      "order": 50,
      "label": {
        "en": "Seed Mode",
        "sk": "Rezim seedu"
      },
      "default": "random",
      "validation": {
        "required": true
      },
      "control": {
        "type": "select",
        "options": [
          {
            "value": "random",
            "label": {
              "en": "Random",
              "sk": "Nahodny"
            }
          },
          {
            "value": "fixed",
            "label": {
              "en": "Fixed",
              "sk": "Pevny"
            }
          }
        ]
      }
    },
    {
      "id": "seed",
      "fieldType": "integer",
      "categoryId": "advanced",
      "order": 60,
      "label": {
        "en": "Seed",
        "sk": "Seed"
      },
      "validation": {
        "required": false,
        "min": 0
      },
      "visibility": {
        "field": "seedMode",
        "equals": "fixed"
      },
      "control": {
        "type": "input",
        "inputMode": "numeric"
      }
    }
  ]
}
```

Model rules:
- `model.json` is required for every preset bundle.
- `templateId` must match the preset folder name and `preset.template.json.id`.
- `categories` define optional UI groups. Category labels are localized.
- `fields` define control-panel field metadata for the bundle.
- Workflow template tokens for control-panel values use field ids directly with the syntax `{{fieldId}}` (for example `{{prompt}}`, `{{steps}}`).
- Non-control-panel runtime values such as uploaded input image references are not currently modeled in `model.json`.
- `label` is required for every field and category and must support localization.
- `description` is optional localized helper text.
- `fieldType` defines the underlying value shape, validation, and serialization. Initial supported values:
  - `string`
  - `integer`
  - `number`
  - `boolean`
  - `enum`
  - `image`
- `control` is required for every field.
- Initial supported `control.type` values:
  - `input`
  - `select`
  - `slider`
  - `range`
- Control-specific metadata:
  - `input`: may define `multiline`, `rows`, `inputMode`, `maxLength`, `placeholder`
  - `select`: must define `options[]` with `value` and localized `label`
  - `slider`: must define `min`, `max`, and may define `step`
  - `range`: reserved for bounded numeric range editing and follows the same numeric metadata contract as `slider`
- `validation.required` is mandatory on every field.
- Additional validation keys are field-type dependent and can include `min`, `max`, `minLength`, `maxLength`, `pattern`.
- `default` is optional bundle-level fallback metadata for the field.
- `categoryId` is optional. Fields without a category render in the default top-level group.
- `order` controls rendering order within the category.
- `visibility` is optional and allows declarative conditional fields (for example seed only when `seedMode === fixed`).
- `id` must be unique within a bundle and is the canonical key used by:
  - workflow template tokens
  - preset defaults
  - runtime generation params
- A field may exist without being referenced by the workflow if it is needed for UI-only behavior or derived runtime logic.
- Runtime-only generation params that are not edited in the control panel may exist outside `model.json.fields`.

Localization rules:
- Localized values use an object keyed by BCP 47 language tags (for example `en`, `en-US`, `sk`).
- Client fallback order:
  1. Exact locale match (for example `sk-SK`)
  2. Base language match (for example `sk`)
  3. `en`
  4. First available localized value
  5. Field/category `id` as a last-resort fallback

### 4.4 *.preset.json
```json
{
  "id": "img2img-basic/basic",
  "name": "Img2Img - Basic",
  "type": "img2img",
  "template": "preset.template.json",
  "model": "model.json",
  "defaults": {
    "prompt": "soft cinematic lighting",
    "negativePrompt": "",
    "steps": 30,
    "cfg": 7,
    "seedMode": "random"
  }
}
```

Preset rules:
- `template` is required and must point to a template file in the same preset folder (v1).
- `model` is required and must point to `model.json` in the same preset folder (vNext preset contract).
- `id` format is `{templateId}/{presetName}` to avoid collisions across folders.
- Presets provide preset-specific defaults/overrides only.
- Control-panel field metadata lives in `model.json`.
- Default value resolution order:
  1. Runtime user-entered value
  2. System-assigned value (for example uploaded input image path)
  3. `*.preset.json.defaults`
  4. `model.json.fields[].default`

### 4.5 Supported preset types

v1 supports:
- `img2img`
- `txt2img`

### 4.6 Template token application and validation

Workflows are treated as JSON templates with field-id template tokens (for example `{{prompt}}`) placed inside `preset.template.json`.

Implementation rules:
1. Load selected `*.preset.json`.
2. Resolve and load preset `template` (`preset.template.json`) as JSON (not as a raw string).
3. Resolve and load preset `model` (`model.json`).
4. Validate model integrity before queueing:
   - every control-panel template token used in `template.workflow` must resolve to exactly one `fields[].id`
   - every `categoryId` must reference an existing category
   - preset `type`, template `type`, and model `templateId` must resolve to the same bundle
5. Resolve runtime parameter values using the default precedence defined above.
6. Validate runtime values against `model.json.fields[].validation`.
7. Recursively walk `template.workflow` values.
8. For any string value:
   - If it contains a template token, replace occurrences with the corresponding parameter value.
   - If the entire string equals the token, replace with the raw value (so numbers can stay numbers).
   - If the token is embedded in a larger string, replace with the stringified value.

Validation rules (v1):
- At queue time, fail if any control-panel template token exists in the template workflow but does not reference a field id from `model.json`.
- Fail if any required field resolves to no value.
- Fail if preset `type` and template `type` do not match.
- Fail if preset `template` file is missing.
- Fail if preset `model` file is missing.
- Do not validate models/assets on the ComfyUI machine; if the workflow fails, surface the error.

UI generation rules:
- The control panel is generated from `model.json.fields`.
- Fields are grouped by `categoryId` and ordered by `order`.
- Category headings come from localized `categories[].label`.
- Advanced sections are not hardcoded; they are just categories with presentation metadata.
- Non-control runtime values such as uploaded input images are handled outside `model.json.fields`.

### 4.7 Initial validated workflow templates (2026-02-22)

- Current implementation validation scope:
  - `examples/prompts/img2img.json`
  - `examples/prompts/txt2img.json`
- These example prompts are source workflows used to build `preset.template.json` files by replacing concrete values with `{{fieldId}}` template tokens.
- For `examples/prompts/img2img.json`, v1 canonical final output is SaveImage node `3` (ignore upscaled SaveImage node `21` for initial release).

---

## 5) App-wide Status

### Status

States:
- Starting
- Online
- Offline

Notes:
- `Online` means ComfyUI responds successfully to `GET /api/system_stats` (see readiness below) with the required fields.
- `Starting` means the backend is actively trying to bring the remote machine + ComfyUI online (WOL/SSH/start/poll).
- `Offline` means no bring-up is in progress and ComfyUI is not currently reachable.

Recommended response shape (v1):
- `state`: `Starting | Online | Offline`
- `lastError`: optional string
- `since`: timestamp for current state
- `comfy`: optional object populated when `Online` (and optionally best-effort while `Starting`):
  - `comfyuiVersion` (from `/api/system_stats.system.comfyui_version`)
  - `pytorchVersion` (from `/api/system_stats.system.pytorch_version`)
  - `devices[]`: `name`, `type`, `vram_total`, `vram_free` (when provided)

---

## 6) UI

### Distinctive, production-grade frontend interfaces with high design quality

### Bottom history panel -- Recent generations
- Recent generations/history is docked at the bottom of the workspace (not in a left panel)
- List of generations (latest first)
  - each generation item: thumbnail 128x128 (output or placeholder), createdAt (relative after a week absolute)

### Control panel
- Preset dropdown
- Dynamic control categories from `model.json`
- Dynamic controls generated from `fields[]`
- Localized labels/descriptions/placeholders/options resolved from the active locale
- Validation and required state driven by `fields[].validation`
- Conditional fields and advanced sections driven by category/visibility metadata, not hardcoded logic
- Generate (used for reruns too), Cancel, Delete
- at bottom shows logs

### Canvas
- responsive area filling remaining space
- top-left action in the main image area: `+ New generation` (client-only draft)
- zoom + pan
- `img2img`: single input drop zone, after generation shows output image. In edit mode user can iterate on image. input->output->input...
- `txt2img`: shows output image after generation
- Input upload and other canvas interactions are handled outside `model.json.fields`

### Top bar
- Logo
- Undo/Redo buttons (useful for prompt edits). When undo it will load the previous image into the canvas.
- before/after toggle (for img2img, on hover it shows the original input image, otherwise shows the current image. If clicked, then shows drawable divider to compare the two)
- Selection tool (user can select region of image he wants to edit, then it sends for editing only that part of the image. Then it is edited and composited back to the original image. The composition should be done that before merging the edited part the edges should be blurred to avoid hard edges in the final image.)

### UX Principles

see: `docs/ux-principles.md`

---

## 7) Generation Lifecycle

States:
- draft (client-only until user starts; server-side draft exists only after `POST /api/generations`)
- queued
- submitted
- completed
- failed
- canceled

Transitions:
- draft -> queued
- queued -> submitted
- submitted -> completed | failed
- queued | submitted -> canceled
- canceled -> queued (re-run)
- completed/failed -> queued (re-run)

Re-run behavior:
- A user can re-run any generation at any time; re-running re-queues the same generation id.
- Each run produces new output files under the same generation output folder (no attempts table in v1).

---

## 8) Backend behavior

- Backend ensures ComfyUI availability transparently
- Uses WOL + SSH + polling
- No public ensure-online API
- Bring-up flow (v1):
  1. Send WOL packet.
  2. Poll until the remote machine is reachable via SSH (successful auth + can run a trivial command).
  3. Start ComfyUI on the remote machine via SSH by running the configured `remoteStart.startComfyCommand` in the background (detached from the SSH session).
  4. Poll ComfyUI readiness via `GET /api/system_stats` until success or timeout.
- Implementation requirements:
  - Must be idempotent: if ComfyUI is already ready, do not start a new instance.
  - Must be concurrency-safe: multiple callers share the same in-flight bring-up attempt (single-flight).

---

## 9) ComfyUI execution

- POST /prompt with body `{ "prompt": <workflow-json> }` -> prompt_id
- GET /api/history_v2/{prompt_id} (fallback: /history/{prompt_id}) polling
- One output image expected

### 9.0 img2img input transfer and output persistence

- For img2img, backend uploads the source image to Comfy via API (`POST /api/upload/image` or OSS-compatible `POST /upload/image` depending on target endpoint availability).
- Backend injects the uploaded file reference into the workflow (`LoadImage.inputs.image`) before `POST /prompt`.
- Backend does not rely on manual filesystem copy into ComfyUI `input/`.
- Final outputs are always downloaded from Comfy and persisted under `/data/outputs/{generationId}/...` regardless of Comfy-side storage layout.

### 9.1 Checking when a run is "ready"

After submitting a prompt, the backend needs a deterministic way to know when the run has finished and an output image can be fetched/saved.

Use ComfyUI's history endpoint and poll for completion:
- Preferred (per `docs/ComfyApi.md`): `GET /api/history_v2/{prompt_id}`
  - While the prompt is still executing, this may return `404` (prompt not found) or a payload that does not include the `prompt_id` yet.
  - Treat the run as **ready** when the response includes the `prompt_id` key and its entry contains a non-empty `outputs` object (the output image(s) are referenced there).
- Fallback (older OSS ComfyUI builds): `GET /history/{prompt_id}` with the same readiness rules.

Optional cross-check (useful for debugging/timeouts):
- `GET /api/queue` exposes `queue_pending` and `queue_running`. If the `prompt_id` is not present in the queue anymore but also never appears in history before the backend's history timeout elapses, mark the run as failed with `History timeout`.

ComfyUI readiness (v1):
- `GET /api/system_stats` returning HTTP 200 with a payload containing at least `system` and `devices` indicates ComfyUI is started and ready for use.

---

## 10) Cancel behavior

`POST /api/generations/{generationId}/cancel`

- queued -> canceled
- submitted -> interrupt ComfyUI -> canceled
- failure to cancel -> failed

---

## 11) Delete behavior

`DELETE /api/generations/{generationId}`

- Allowed for draft, completed, failed, canceled
- queued -> remove then delete
- submitted -> 409 Conflict

---

## 12) Error handling

Generation fails on:
- Comfy offline timeout
- Remote machine (SSH) offline timeout
- Remote Comfy start failure
- Upload failure
- Prompt submit failure
- Execution error
- History timeout
- Output failure
- Cancel failure

Retries (v1):
- One retry is allowed for transient failures (network/timeouts) during upload/submit/history polling.
- Non-transient failures (validation errors, explicit Comfy execution error) do not retry.

## 12.1) Logging and diagnostics

Backend logging requirements:
- Use Fastify's Pino-based logger as the single backend logging implementation.
- Write a human-readable log file for direct developer inspection. Default path is `./data/logs/backend.log` and can be overridden with `LOG_FILE_PATH` (for container deployments this should typically point into `/data/logs/`).
- Keep stdout/stderr usable for container log collection; file output is the primary developer-facing diagnostic artifact.
- Log level is configurable through `LOG_LEVEL` and defaults to `info`.

Request logging requirements:
- Every completed API request must log:
  - request id
  - method
  - matched route
  - raw URL
  - status code
  - total request time
- Request logs should include summarized input metadata that helps diagnostics without duplicating full persisted payloads.
- Prefer stable references over full payload duplication, for example:
  - `generationId`
  - `presetId`
  - `templateId`
  - `prompt_id`
  - input file path / stored input reference
  - parameter key lists when full values are already stored elsewhere

Workflow logging requirements:
- Important workflow state changes must emit explicit logs with domain identifiers, for example generation created, queued, canceled, deleted, prompt submitted, output stored.
- Rejected operations that are expected but noteworthy (missing entity, invalid state transition, invalid request shape, unavailable dependency) must be logged at `warn`.
- Exceptions must be logged at `error` or `fatal` with stack traces and relevant request/workflow context.
- Process-level failures such as startup failures, uncaught exceptions, and unhandled promise rejections must be logged before shutdown.

Formatting requirements:
- Log file formatting must optimize for direct readability by developers reviewing the file manually.
- Timestamps must be easy to scan.
- Request ids must remain visible so developers can correlate request-completion logs with workflow/error logs.

---

## 13) API

Application API is exposed via REST endpoints (Fastify routes) plus SSE for live generation events.
All API endpoints must be documented in the OpenAPI Specification.

### REST endpoints
- `GET /api/status`
- `GET /api/presets`
- `GET /api/presets/{presetId}`
- `GET /api/generations`
- `GET /api/generations/{generationId}`
- `POST /api/generations`
- `POST /api/generations/{generationId}/input`
- `POST /api/generations/{generationId}/queue`
- `POST /api/generations/{generationId}/cancel`
- `DELETE /api/generations/{generationId}`

### SSE endpoint
- `GET /api/events/generations` (`text/event-stream`)

Notes:
- SSE events are live-only in v1 (no replay/catch-up); they emit basic generation status updates and optional progress when available.
- `+ New generation` is client-only and does not hit the backend.
- `presetId` uses `{templateId}/{presetName}` format (for example `img2img-basic/basic`).
- `GET /api/presets/{presetId}` must expose the resolved template plus the resolved preset `model.json` so the client can build the control panel dynamically.
- Preset parameter payloads are keyed by `fieldId` from `model.json`.
- On Generate, the UI creates the server-side generation (`POST /api/generations`), then:
  - `img2img`: upload input (`POST /api/generations/{generationId}/input`), then queue (`POST /api/generations/{generationId}/queue`)
  - `txt2img`: queue directly (`POST /api/generations/{generationId}/queue`)

---

## 14) Data Model (Postgres)

### Generation
- id (uuid)
- status
- queuedAt (timestamp, nullable)
- promptRequest (jsonb)
- promptResponse (jsonb)
- presetId (text)
- templateId (text)
- presetParams (jsonb)
- error (text)
- createdAt (timestamp)
- updatedAt (timestamp)

---

## 15) Worker

- Single worker loop
- One execution at a time
- Processes oldest queued by `queuedAt`
- Checks cancellation before each step

---

## 16) Out of scope (v1)

- Batch processing
- Multiple outputs
- Preset editor UI
- Auth
- Internet exposure
- Crash recovery

---

## 17) Filesystem conventions

### 17.1 Inputs

For `img2img`, store:
- Original upload: `/data/inputs/{generationId}/original/{filename}`
- Normalized copy (optional/implementation-defined): `/data/inputs/{generationId}/normalized/{filename}`

No format/size validation is enforced in v1; failures surface as generation errors.

### 17.2 Outputs

Outputs are written under:
- `/data/outputs/{generationId}/`

Re-runs create additional files in the same folder. Naming rule (v1):
- Output filenames include a timestamp prefix to avoid collisions (implementation-defined).

## 18) Project structure

- /src
  |- /server
  |- /client
  |- /shared
- `package.json` at repo root only (no npm workspaces, no nested package manifests for `client`/`server`/`shared`)
- Import boundary rules:
  - `src/client` and `src/server` must not import from each other directly
  - Code shared by both (for example Zod schemas/types) must live in `src/shared`
  - Use relative imports between folders

## 19) References
