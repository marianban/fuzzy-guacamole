# Tables

| Name | Columns | Comment |
|------|---------|---------|
| [generations](./generations.md) | 12 |  |

---

## ER Diagram

```mermaid
erDiagram
    generations {
        uuid id PK
        text status
        text preset_id
        text template_id
        jsonb preset_params
        jsonb execution_snapshot
        jsonb prompt_request
        jsonb prompt_response
        timestamptz queued_at
        text error
        timestamptz created_at
        timestamptz updated_at
    }
```
