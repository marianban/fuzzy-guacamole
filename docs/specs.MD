# Comfy Frontend Orchestrator — Spec Draft v1

NAS-hosted | single-image img2img | ComfyUI standard API

---

## 1) Goal

A LAN-hosted web application running on a NAS provides a simple UI to run **single-image img2img** workflows on a remote **ComfyUI** machine.

Key principles:
- One generation = one input image → one output image
- No batching in v1
- Presets are exported ComfyUI workflows stored on disk
- Backend transparently wakes the remote machine + ComfyUI
- UI shows a full-page loader until the system is ready
- Cancel is per generation and must stop ComfyUI execution
- No auth, LAN-only

---

## 2) Deployment

- Runtime: Node.js 24
- Framework: Next.js 16 (App Router), React, TypeScript
- Database: Postgres
- Containerized (Docker, NAS-agnostic)
- Persistent volumes:
  - /data/config.json
  - /data/presets/
  - /data/inputs/
  - /data/outputs/

---

## 3) Configuration (file-based, no UI)

### /data/config.json
```json
{
  "comfyBaseUrl": "http://192.168.0.X:8188",
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
 ├─ workflow.json
 └─ preset.json
```

### 4.2 preset.json
```json
{
  "id": "img2img-basic",
  "name": "Img2Img – Basic",
  "type": "img2img",
  "defaults": {
    "prompt": "soft cinematic lighting",
    "negativePrompt": "",
    "steps": 30,
    "cfg": 7,
    "seedMode": "random"
  },
  "placeholders": {
    "PROMPT": "prompt",
    "NEG_PROMPT": "negativePrompt",
    "STEPS": "steps",
    "CFG": "cfg",
    "SEED": "seed",
    "INPUT_IMAGE": "inputImagePath"
  }
}
```

---

## 5) App-wide Status

### GET /api/status

States:
- Starting
- Online
- Offline

---

## 6) UI

### Left panel — Generations
- List of generations (latest first)
- + New generation
- Delete generation
- No cancel here

### Center — Canvas
- Single input drop zone
- Img2img split view (input / output)

### Right panel — Controls
- Preset dropdown
- Prompt
- Advanced:
  - Negative prompt
  - Seed mode + seed
- Generate

### Generation detail
- Shows parameters, logs, previews
- Cancel button
- Restart if canceled

---

## 7) Generation Lifecycle

States:
- draft
- queued
- submitted
- completed
- failed
- canceled

Transitions:
- draft → queued
- queued → submitted
- submitted → completed | failed
- queued | submitted → canceled
- canceled → queued

---

## 8) Backend behavior

- Backend ensures ComfyUI availability transparently
- Uses WOL + polling
- No public ensure-online API

---

## 9) ComfyUI execution

- POST /prompt → prompt_id
- GET /history/{prompt_id} polling
- One output image expected

---

## 10) Cancel behavior

POST /api/generations/:id/cancel

- queued → canceled
- submitted → interrupt ComfyUI → canceled
- failure to cancel → failed

---

## 11) Delete behavior

DELETE /api/generations/:id

- Allowed for draft, completed, failed, canceled
- queued → remove then delete
- submitted → 409 Conflict

---

## 12) Error handling

Generation fails on:
- Comfy offline timeout
- Upload failure
- Prompt submit failure
- Execution error
- History timeout
- Output failure
- Cancel failure

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

---

## 14) Data Model (Postgres)

### Generation
- id (uuid)
- status
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
- Processes oldest queued
- One execution at a time
- Checks cancellation before each step

---

## 16) Out of scope (v1)

- Batch processing
- Multiple outputs
- Preset editor UI
- Auth
- Internet exposure
- Crash recovery
