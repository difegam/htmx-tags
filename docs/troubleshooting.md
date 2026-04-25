# Troubleshooting

## No htmx autocomplete suggestions

Check:

- file language mode is **HTML**
- extension is installed/enabled
- `package.json` still points to `./html.htmx-data.json`

## Hover docs missing

Possible causes:

- invalid or incomplete generated JSON
- extraction issue in `build-data.py`
- stale VS Code extension state

Actions:

1. regenerate with `python3 build-data.py`
2. inspect JSON for obvious corruption
3. run **Developer: Reload Window** in VS Code

## Data regeneration fails

Likely causes:

- no network access to GitHub
- `HTMX_VERSION` tag unavailable
- upstream archive layout changed

Actions:

1. verify internet connectivity
2. confirm htmx tag exists upstream
3. update extraction path conditions in generator

## Docs site won't start

Check:

- `zensical` installed in active environment
- command executed from repository root
- `zensical.toml` is present and valid

Try:

```bash
zensical serve
```

or with uv/Poetry wrappers:

```bash
uv run zensical serve
poetry run zensical serve
```
