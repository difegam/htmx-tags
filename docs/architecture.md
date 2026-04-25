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

### `package.json`

Defines extension metadata and registers the custom data source:

- `contributes.html.customData = ["./html.htmx-data.json"]`

### `build-data.py`

Generator script that:

- pins upstream source version (`HTMX_VERSION = "1.9.6"`)
- downloads htmx tag archive from GitHub
- collects attribute markdown content
- builds VS Code custom data JSON structure
- persists output to `html.htmx-data.json`

### `html.htmx-data.json`

Runtime artifact used directly by VS Code. It contains:

- `globalAttributes`: all supported `hx-*` attributes and docs
- `valueSets`: currently includes predefined values for `hx-swap`

## Design decisions

- **Static artifact at runtime**: eliminates extension runtime network dependencies
- **Pinned upstream version**: predictable regeneration and reproducible updates
- **Generated output committed to git**: easy review of upstream documentation changes

## Known limitations

- generator is currently a single script (not modular/tested)
- no automated drift detection in CI
- reference label typo (`Official documention`) originates from generator output
