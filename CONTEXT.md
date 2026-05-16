# Comfy Frontend Orchestrator

This context describes the core generation concepts used by the LAN-hosted image workflow product.

## Language

**Generation**:
A persisted image-work record that can be executed repeatedly over time.
_Avoid_: job, task

**Run**:
A single execution attempt of a generation.
_Avoid_: generation, attempt record

**Control Model**:
The `model.json` file inside a preset bundle. It defines editable fields, categories, validation rules, and UI metadata for that bundle.
_Avoid_: form schema, preset config

**Preset Bundle**:
A folder-scoped workflow package containing one workflow template, one control model, and one or more preset variants.
_Avoid_: preset folder, template package

**Preset Variant**:
A named set of defaults for a preset bundle.
_Avoid_: workflow, template

**Workflow Template**:
A ComfyUI workflow JSON with template tokens that are resolved before execution.
_Avoid_: preset, prompt

**Template Token**:
A placeholder such as `{{prompt}}` inside a workflow template. The backend replaces it with a resolved runtime value before submitting the workflow.
_Avoid_: variable, macro

**App Status State**:
The current readiness state of the app: `Offline`, `Starting`, `Online`, or `StartupFailed`.
_Avoid_: server status, worker state

**Active Locale**:
The current UI language tag used to resolve both static UI copy and localized preset metadata.
_Avoid_: user language setting, translation mode

**Worker Loop**:
The single background execution loop that claims the oldest queued generation and processes it end-to-end.
_Avoid_: queue runner, daemon

**Wake-on-LAN (WOL)**:
The network wake-up packet sent to bring the remote ComfyUI machine online before use.
_Avoid_: boot request, ping

**SSE Events Stream**:
The live-only `text/event-stream` connection used to push generation updates and telemetry to the browser.
_Avoid_: websocket, polling channel

## Relationships

- A **Generation** can have many **Runs** over time.
- In v1, only the latest **Run** metadata is retained on the **Generation** record.
- A **Preset Bundle** contains exactly one **Control Model**.
- A **Preset Bundle** contains exactly one **Workflow Template**.
- A **Preset Bundle** can contain one or more **Preset Variants**.
- A **Preset Variant** belongs to exactly one **Preset Bundle**.
- A **Template Token** is resolved using values from a **Control Model** or runtime-only server-owned parameters.
- A **Worker Loop** executes only when the **App Status State** permits generation processing.

## Example dialogue

> **Dev:** "When a user clicks Generate again, do we create a new **Generation**?"
> **Domain expert:** "No. We start a new **Run** for the existing **Generation** and keep the latest execution metadata on that record."
>
> **Dev:** "Does each **Preset Variant** choose its own template file?"
> **Domain expert:** "No. The **Preset Bundle** owns the **Workflow Template**; variants only provide named defaults."

> **Dev:** "Is a **Run** the same thing as a **Generation** in the database?"
> **Domain expert:** "No. The **Generation** is the persisted record the user works with. A **Run** is one execution of that record. In v1 we only keep the latest run metadata on the generation."

## Flagged ambiguities

- "run" previously risked sounding like a persisted history entity — resolved: a **Run** is an execution attempt, not a first-class persisted record in v1.
- "preset" can mean either a bundle or a variant — resolved: use **Preset Bundle** for the folder-scoped package and **Preset Variant** for an individual `*.preset.json`.
- "model" previously risked meaning either UI metadata or runtime parameter values — resolved: use **Control Model** for `model.json`, and refer to submitted or persisted values as params.
