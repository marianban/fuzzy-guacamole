# Comfy Frontend Orchestrator

This context describes the core generation concepts used by the LAN-hosted image workflow product.

## Language

**Generation**:
A persisted image-work record that can be executed repeatedly over time.
_Avoid_: job, task

**Run**:
A single execution attempt of a generation.
_Avoid_: generation, attempt record

**Preset Bundle**:
A folder-scoped workflow package containing one workflow template, one control model, and one or more preset variants.
_Avoid_: preset folder, template package

**Preset Variant**:
A named set of defaults for a preset bundle.
_Avoid_: workflow, template

**Workflow Template**:
A ComfyUI workflow JSON with template tokens that are resolved before execution.
_Avoid_: preset, prompt

## Relationships

- A **Generation** can have many **Runs** over time.
- In v1, only the latest **Run** metadata is retained on the **Generation** record.
- A **Preset Bundle** contains exactly one **Workflow Template**.
- A **Preset Bundle** contains exactly one control model.
- A **Preset Bundle** can contain one or more **Preset Variants**.
- A **Preset Variant** belongs to exactly one **Preset Bundle**.

## Example dialogue

> **Dev:** "When a user clicks Generate again, do we create a new **Generation**?"
> **Domain expert:** "No. We start a new **Run** for the existing **Generation** and keep the latest execution metadata on that record."
>
> **Dev:** "Does each **Preset Variant** choose its own template file?"
> **Domain expert:** "No. The **Preset Bundle** owns the **Workflow Template**; variants only provide named defaults."

## Flagged ambiguities

- "run" previously risked sounding like a persisted history entity — resolved: a **Run** is an execution attempt, not a first-class persisted record in v1.
- "preset" can mean either a bundle or a variant — resolved: use **Preset Bundle** for the folder-scoped package and **Preset Variant** for an individual `*.preset.json`.
