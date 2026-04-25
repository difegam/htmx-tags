# Troubleshooting

## No htmx autocomplete suggestions

Check:

- file language mode is **HTML** or **Django HTML**
- extension is installed/enabled
- `package.json` still points to `./html.htmx-data.json`

## No autocomplete in Django templates

The extension activates on `django-html` files but requires `batisteo.vscode-django` to be
installed (declared as an extension dependency). Check:

- `batisteo.vscode-django` is installed and enabled
- file language mode is set to **Django HTML** (shown in the status bar)
- reload VS Code after installing either extension

## Hover docs missing

Possible causes:

- invalid or incomplete generated JSON
- extraction issue in `build-data.py`
- stale VS Code extension state

Actions:

1. regenerate with `just build-data`
1. inspect JSON for obvious corruption
1. run **Developer: Reload Window** in VS Code

## Data regeneration fails

Likely causes:

- no network access to GitHub
- `HTMX_VERSION` tag unavailable
- upstream archive layout changed

Actions:

1. verify internet connectivity
1. confirm htmx tag exists upstream
1. update extraction path conditions in generator

## Docs site won't start

Check:

- `zensical` installed in active environment
- command executed from repository root
- `zensical.toml` is present and valid

Try:

```bash
uv run zensical serve
```
