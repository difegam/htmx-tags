# Settings

These VS Code settings are contributed by HTMX Tags for Django.

| Setting | Type | Default | Effect |
| --- | --- | --- | --- |
| `htmxTags.enableCompletion` | boolean | `true` | Enables HTMX attribute/value and Django partial completion. |
| `htmxTags.enableHover` | boolean | `true` | Enables HTMX and Django partial hover documentation. |
| `htmxTags.enableValidation` | boolean | `true` | Enables HTMX and same-file Django partial diagnostics. |
| `htmxTags.version` | `compatible`, `2`, or `4` | `compatible` | Selects the version-aware completion and hint behavior. |

## Scope

Settings are read through VS Code configuration for the active document, so they can be set at user, workspace, folder, or language scope using standard VS Code settings precedence.

## Example language-specific configuration

```json
{
  "[django-html]": {
    "htmxTags.version": "4"
  }
}
```

Changing an `htmxTags` setting refreshes diagnostics for open supported documents.
