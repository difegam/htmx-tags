# Development guide

## Prerequisites

- VS Code for manual extension verification
- Node/npm for extension packaging and publishing workflows
- Python 3.12+ for local contributor tooling

## Core workflow

1. Change generator logic in `build-data.py` (if required)
1. Regenerate custom data (`python3 build-data.py`)
1. Review `html.htmx-data.json` diff
1. Smoke test autocompletion + hover docs in VS Code
1. Commit script changes and generated artifact together

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

## Docs CI parity

Use the same command as CI before merging docs changes:

```bash
just docs-strict
```

Note: current `zensical` releases may print `Strict mode is currently unsupported.`
Keep `--strict` in commands anyway so behavior is enforced automatically once supported.

## Testing the extension locally

### Extension Development Host

The fastest way to verify changes is to open the project in VS Code and press
`F5` (or **Run → Start Debugging**). This launches a second VS Code window — the
*Extension Development Host* — with the extension loaded from the workspace.

Inside that window:

1. Open any `.html` or Django template file.
1. Type `hx-` and confirm completion suggestions appear.
1. Hover a recognised attribute and verify the markdown description renders.

Close the host window to stop the session. The parent window keeps running
normally.

> **Tip:** If other installed extensions interfere, add `"--disable-extensions"`
> to `args` in `.vscode/launch.json` to isolate the test run.

### Package and sideload as VSIX

To test the packaged extension exactly as users will receive it:

```bash
# Compile TypeScript first
npm run compile

# Create the .vsix bundle (no global install needed)
npx @vscode/vsce package
```

This produces a file like `htmx-tags-django-0.1.1.vsix`. Install it directly:

```bash
code --install-extension htmx-tags-django-*.vsix
```

Reload VS Code when prompted. Uninstall with:

```bash
code --uninstall-extension difegam.htmx-tags-django
```

### Known limitation when running tests from CLI

VS Code integration tests launched from the terminal require an exclusive
instance. If VS Code is already open you will see:

```
Running extension tests from the command line is currently only supported if
no other instance of Code is running.
```

Workaround: use **VS Code Insiders** for day-to-day editing and run CLI tests
against the stable build, or trigger tests from the debug launch configuration
inside VS Code instead of the terminal.

## Suggested technical backlog

- convert `build-data.py` into a typed module with testable functions
- add `pyproject.toml` for consistent Python tooling (uv/Poetry friendly)
- add CI checks for formatting/linting and generation drift
- add tests validating expected output schema and key attributes
