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

## 2) Deployment

- Runtime: Node.js 24
- Framework: React, TypeScript (classic SPA no SSR needed), TanStack Start
- Styling: CSS modules
- Database: Postgres
- Containerized (Docker, NAS-agnostic)
- Persistent volumes:
  - /data/config.json
  - /data/ssh/ (optional; SSH private key material for remote start)
  - /data/presets/
  - /data/inputs/
  - /data/outputs/

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

---

## 4) Presets (workflow bundles on disk)

### 4.1 Structure
```
/data/presets/img2img-basic/
  |- workflow.json
  `- preset.json
```

### 4.2 preset.json
```json
{
  "id": "img2img-basic",
  "name": "Img2Img - Basic",
  "type": "img2img",
  "defaults": {
    "prompt": "soft cinematic lighting",
    "negativePrompt": "",
    "steps": 30,
    "cfg": 7,
    "seedMode": "random"
  },
  "placeholders": {
    "{{PROMPT}}": "prompt",
    "{{NEG_PROMPT}}": "negativePrompt",
    "{{STEPS}}": "steps",
    "{{CFG}}": "cfg",
    "{{SEED}}": "seed",
    "{{INPUT_IMAGE}}": "inputImagePath"
  }
}
```

### 4.3 Supported preset types

v1 supports:
- `img2img`
- `txt2img`

### 4.4 Placeholder application (simple templating)

Workflows are treated as JSON templates with placeholder tokens (e.g. `{{PROMPT}}`) placed inside `workflow.json`.

Implementation rules:
1. Load `workflow.json` as JSON (not as a raw string).
2. Recursively walk all values.
3. For any string value:
   - If it contains a placeholder token, replace occurrences with the corresponding parameter value.
   - If the entire string equals the token, replace with the raw value (so numbers can stay numbers).
   - If the token is embedded in a larger string, replace with the stringified value.

Validation rules (v1):
- At queue time, fail if any placeholder token exists in the workflow but has no value.
- Do not validate models/assets on the ComfyUI machine; if the workflow fails, surface the error.

---

## 5) App-wide Status

### GET /api/status

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

### Left panel -- Generations
- List of generations (latest first)
- + New generation (client-only draft)
- Delete generation
- No cancel here

### Center -- Canvas
- `img2img`: single input drop zone + split view (input / output). in the first part of split view textarea for edit prompt at the bottom
- `txt2img`: placeholder (text) until an output exists; then split view with output on right

### Right panel -- Controls
- Preset dropdown
- Prompt
- Advanced:
  - Negative prompt
  - Seed mode + seed
- Generate

### Generation detail
- Shows parameters, logs, previews
- Cancel button (only meaningful while queued/submitted)
- Re-run (queues the same generation again)

---

## 7) Generation Lifecycle

States:
- draft (client-only until user starts; server-side draft exists only after POST /api/generations)
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

- POST /prompt -> prompt_id
- GET /history/{prompt_id} polling
- One output image expected

ComfyUI readiness (v1):
- `GET /api/system_stats` returning HTTP 200 with a payload containing at least `system` and `devices` indicates ComfyUI is started and ready for use.

---

## 10) Cancel behavior

POST /api/generations/:id/cancel

- queued -> canceled
- submitted -> interrupt ComfyUI -> canceled
- failure to cancel -> failed

---

## 11) Delete behavior

DELETE /api/generations/:id

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

---

## 13) API

### Status
- GET /api/status

### Presets
- GET /api/presets
- GET /api/presets/:id

### Generations
- POST /api/generations
- GET /api/generations
- GET /api/generations/:id
- POST /api/generations/:id/input
- POST /api/generations/:id/queue
- POST /api/generations/:id/cancel
- DELETE /api/generations/:id

### Events
- GET /api/events (SSE)

Notes:
- SSE is live-only in v1 (no replay/catch-up); it emits basic generation status updates and optional progress when available.
- `+ New generation` is client-only and does not hit the backend.
- On Generate, the UI creates the server-side generation (POST /api/generations), then:
  - `img2img`: upload input (POST /api/generations/:id/input), then queue (POST /api/generations/:id/queue)
  - `txt2img`: queue directly (POST /api/generations/:id/queue)

---

## 14) Data Model (Postgres)

### Generation
- id (uuid)
- status
- queuedAt (timestamp, nullable)
- promptRequest (jsonb)
- promptResponse (jsonb)
- presetId (text)
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
