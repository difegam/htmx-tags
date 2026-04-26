# Architecture

## High-level flow

```text
htmx release docs zip
  -> build-data.py
  -> html.htmx-data.json
  -> package.json contributes.html.customData
  -> VS Code HTML completion + hover
```

## Component responsibilities

### `src/extension.ts`

The extension entry point. By design, it is fully declarative:

- `activate()` and `deactivate()` are no-ops
- All functionality is provided via static custom data registered in `package.json`
- This eliminates runtime VS Code API calls and extension activation overhead

### `package.json`

Defines extension metadata and registers the custom data source:

- `contributes.html.customData = ["./html.htmx-data.json"]`

### `build-data.py`

Generator script that:

- pins upstream source version (`DEFAULT_HTMX_VERSION = "2.0.9"`)
- downloads htmx tag archive from GitHub
- collects attribute markdown content
- builds VS Code custom data JSON structure
- applies HTMX 2.x compatibility adjustments (see below)
- persists output to `html.htmx-data.json`

### `html.htmx-data.json`

Runtime artifact used directly by VS Code. It contains:

- `globalAttributes`: all supported `hx-*` attributes and docs
- `valueSets`: currently includes predefined values for `hx-swap`

### HTMX 2.x adjustments

When the configured version is `>= 2.0.0`, `apply_htmx_v2_adjustments()` is called after the
base payload is built. It:

- removes `hx-sse` and `hx-ws` (deprecated and removed in HTMX 2.x)
- adds `hx-on:*` and `hx-on::*` wildcard entries for the new event handler syntax

## Design decisions

- **Static artifact at runtime**: eliminates extension runtime network dependencies
- **Pinned upstream version**: predictable regeneration and reproducible updates
- **Generated output committed to git**: easy review of upstream documentation changes

## Known limitations

- no automated drift detection in CI to flag when upstream HTMX docs change
