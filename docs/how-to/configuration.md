# Configuration

Configure HTMX Tags for Django in VS Code settings at the user, workspace, or language-specific scope.

## Settings JSON

```json
{
  "htmxTags.enableCompletion": true,
  "htmxTags.enableHover": true,
  "htmxTags.enableValidation": true,
  "htmxTags.version": "compatible"
}
```

See the complete [settings reference](../reference/settings.md) for defaults and behavior.

## Prefer HTMX 2

Use this during a stable-HTMX-2 codebase migration:

```json
{
  "htmxTags.version": "2"
}
```

HTMX 4-only names remain recognizable but appear as hints in diagnostics. Completion lists HTMX 2 entries.

## Prefer HTMX 4

```json
{
  "htmxTags.version": "4"
}
```

This enables HTMX 4 completion entries and marks HTMX 2-only syntax as hints. Use `compatible` when the codebase intentionally uses both major-version catalogs.

## Disable a feature

Set one of the boolean settings to `false`. Disabling validation also clears the extension's diagnostics for open documents after the configuration change.
