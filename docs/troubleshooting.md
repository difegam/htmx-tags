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
- configured `DEFAULT_HTMX_VERSION` tag not available on GitHub
- upstream archive layout changed

Actions:

1. verify internet connectivity
1. confirm htmx tag exists upstream (e.g., `https://github.com/bigskysoftware/htmx/releases/tag/v2.0.9`)
1. update extraction path conditions in generator if archive structure changed

## Docs site won't start

Check:

- `zensical` installed in active environment
- command executed from repository root
- `zensical.toml` is present and valid

Try:

```bash
uv run zensical serve
```

## `tsc: command not found` when compiling

The TypeScript compiler is a local `devDependency` and is not on `PATH` until installed:

```bash
npm install
npm run compile
```

Run `npm install` once after cloning or after a clean checkout.

## VSIX is unexpectedly large

If `npx @vscode/vsce package` reports thousands of files or tens of megabytes, files that
should be excluded are leaking into the bundle. Check `.vscodeignore` for missing entries.
Common culprits: `.venv/`, `.cache/`, `site/`, `docs/`, `tests/`, `uv.lock`.

Inspect what will be included before packaging:

```bash
npx @vscode/vsce ls --tree
```

The expected bundle contains only: `out/extension.js`, `html.htmx-data.json`, `package.json`,
`README.md`, and `LICENSE.txt`.

## Extension uninstall command fails

`code --uninstall-extension` requires the exact publisher + name ID. Confirm with:

```bash
code --list-extensions
```

The correct ID for this extension is `difegam.htmx-tags-django`. Using any other identifier
(e.g. a file name or a different publisher) will silently fail with "Extension is not installed."

## `ModuleNotFoundError: No module named 'packaging'` when running `build-data.py`

If you run `python3 build-data.py` directly, the Python environment lacks the `packaging`
dependency, which is managed by `uv`. Use the project's tooling instead:

```bash
just build-data
```

Or:

```bash
uv run python build-data.py
```
