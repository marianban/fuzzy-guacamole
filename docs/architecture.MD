# Fuzzy Guacamole Architecture

Current code only. No planned or proposed architecture is documented here.

## Runtime Overview

```mermaid
flowchart LR
  Browser["React SPA<br/>src/client/src/App.tsx"]
  Vite["Vite Dev Server<br/>src/client/vite.config.ts"]
  API["Fastify API<br/>src/server/app.ts"]
  SharedStatus["Shared Status Contract<br/>src/shared/status.ts"]
  SharedPresets["Shared Preset Contract<br/>src/shared/presets.ts"]
  Startup["Server Startup<br/>src/server/index.ts"]
  Config["Config Loader<br/>src/server/config.ts"]
  Presets["Preset Loader<br/>src/server/presets.ts"]

  Browser -->|"GET /api/status (SWR poll)"| Vite
  Vite -->|"proxy /api/*"| API
  API -->|"validate status response"| SharedStatus
  API -->|"validate preset responses"| SharedPresets
  Browser -->|"parse status response"| SharedStatus
  Startup --> Config
  Startup --> Presets
  Config -->|"paths.presets"| Presets
  Presets --> API
```

## Server Surface

```mermaid
flowchart TD
  Start["src/server/index.ts"] --> Build["buildServer()"]
  Start --> Config["loadAppConfig()"]
  Start --> Catalog["loadPresetCatalog()"]
  Build --> Health["GET /healthz"]
  Build --> Status["GET /api/status"]
  Build --> PresetsList["GET /api/presets"]
  Build --> PresetsDetail["GET /api/presets/*"]
  Status --> Payload["state: Starting<br/>since: startup timestamp"]
  PresetsList --> PresetPayload["preset summaries only"]
  PresetsDetail --> PresetDetailPayload["preset summary + template workflow"]
```

Implemented routes:
- `GET /healthz` -> `{ ok: true }`
- `GET /api/status` -> status payload validated via shared Zod schema
- `GET /api/presets` -> preset metadata list loaded from disk at startup
- `GET /api/presets/{presetId}` -> wildcard-backed route (`/api/presets/*`) returning metadata + resolved template

## Comfy Module (Implemented, Not Wired to API Routes)

```mermaid
flowchart TD
  C[ComfyClient<br/>src/server/comfy/client.ts]
  H[healthCheck]
  U[uploadInputImage]
  S[submitPrompt]
  P[pollHistory]
  D[downloadImage]
  T[client.integration.test.ts]

  C --> H
  C --> U
  C --> S
  C --> P
  C --> D
  T --> C
```

The Comfy client has integration tests and endpoint-fallback handling, but current Fastify routes do not call it.
