# Installation

## Install the VS Code extension

### Marketplace install

1. Open VS Code
1. Open **Extensions** (`Ctrl/Cmd+Shift+X`)
1. Search for `htmx-tags`
1. Click **Install**

Direct link: <https://marketplace.visualstudio.com/items?itemName=otovo-oss.htmx-tags>

## Verify extension behavior

1. Open any `.html` file
1. Type `hx-` within an element
1. Confirm attribute suggestions appear
1. Hover an `hx-*` attribute and confirm docs render

## Local documentation setup (Zensical)

Docs are configured using `zensical.toml` and written in `docs/`.

### Option A: uv (recommended modern workflow)

```bash
uv init
uv add --dev zensical
uv run zensical serve
```

The local docs server usually starts at `http://127.0.0.1:8000`.
