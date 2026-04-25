# Installation

## Install the VS Code extension

### Marketplace install

1. Open VS Code
1. Open **Extensions** (`Ctrl/Cmd+Shift+X`)
1. Search for `htmx-tags-django`
1. Click **Install**

Direct link: <https://marketplace.visualstudio.com/items?itemName=difegam.htmx-tags-django>

### Django template support

If you use Django templates, the extension activates on `django-html` files and depends on the
[Django extension](https://marketplace.visualstudio.com/items?itemName=batisteo.vscode-django)
(`batisteo.vscode-django`). VS Code will prompt you to install it automatically when you install
`htmx-tags-django`.

## Verify extension behavior

1. Open any `.html` file
1. Type `hx-` within an element
1. Confirm attribute suggestions appear
1. Hover an `hx-*` attribute and confirm docs render

## Local documentation setup (Zensical)

Docs are configured using `zensical.toml` and written in `docs/`.

### Option A: just (recommended if already initialised)

```bash
just init   # install all deps and prek hooks (first time only)
just docs   # serve docs at http://localhost:8000
```

### Option B: uv directly

```bash
uv sync --group docs
uv run zensical serve
```

The local docs server starts at `http://127.0.0.1:8000`.
