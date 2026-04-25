# Development guide

## Prerequisites

- VS Code for manual extension verification
- Node/npm for extension packaging and publishing workflows
- Python 3.12+ for local contributor tooling

## Core workflow

1. Change generator logic in `build-data.py` (if required)
2. Regenerate custom data (`python3 build-data.py`)
3. Review `html.htmx-data.json` diff
4. Smoke test autocompletion + hover docs in VS Code
5. Commit script changes and generated artifact together

## Data regeneration

```bash
python3 build-data.py
```

The generator will:

- download `htmx` release zip for configured version
- parse markdown files in `www/content/attributes/`
- strip front matter and preserve markdown body as description
- write updated `html.htmx-data.json`

## Updating htmx docs version

Edit `HTMX_VERSION` in `build-data.py`, then regenerate data.

When reviewing the resulting JSON diff, check for:

- added/removed attributes
- renamed attributes
- changed formatting that may impact VS Code hover rendering

## Contributor engineering standards

Use these defaults for future Python refactors:

- prefer standard library before adding dependencies
- use type hints throughout
- write small, single-responsibility functions
- use `pathlib.Path`, `logging`, context managers, and f-strings
- avoid wildcard imports and avoid `print` in automation scripts

## Suggested technical backlog

- convert `build-data.py` into a typed module with testable functions
- add `pyproject.toml` for consistent Python tooling (uv/Poetry friendly)
- add CI checks for formatting/linting and generation drift
- add tests validating expected output schema and key attributes
