# Development guide

## Prerequisites

- VS Code for manual extension verification
- Node/npm for extension packaging and publishing workflows
- Python 3.12+ for local contributor tooling

## Core workflow

1. Change generator logic in `build-data.py` (if required)
1. Regenerate custom data with `just build-data` (or `uv run python build-data.py`)
1. Review `html.htmx-data.json` diff
1. Smoke test autocompletion + hover docs in VS Code
1. Commit script changes and generated artifact together

## Data regeneration

```bash
just build-data
```

The generator will:

- download `htmx` release zip for configured version
- parse markdown files in `www/content/attributes/` (path inside the downloaded archive)
- strip front matter and preserve markdown body as description
- write updated `html.htmx-data.json`

## Updating htmx docs version

Edit `DEFAULT_HTMX_VERSION` in `build-data.py`, then regenerate data.

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

## Running all local checks

Use `just check` to lint, test, and validate formatting (runs `prek` hooks for markdown/JSON/YAML/TOML):

```bash
just check
```

**Prerequisite:** Run `just init` once after cloning to register pre-commit hooks and install all dependencies.

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

> **Tip:** If other installed extensions interfere, you can create `.vscode/launch.json`
> with `"args": ["--disable-extensions"]` to isolate the test run.

### Package and sideload as VSIX

To test the packaged extension exactly as users will receive it:

```bash
# Install local devDependencies (required once after cloning)
npm install

# Compile TypeScript
npm run compile

# Create the .vsix bundle (no global install needed)
npx @vscode/vsce package
```

> **Note:** If `npm run compile` exits with `tsc: command not found`, run `npm install` first.
> The TypeScript compiler is a local `devDependency` and is not available until dependencies are installed.

This produces a file like `htmx-tags-django-0.1.1.vsix`. Inspect the bundle before installing:

```bash
npx @vscode/vsce ls --tree
```

Expect only a handful of files (`out/extension.js`, `html.htmx-data.json`, `package.json`,
`README.md`, `LICENSE.txt`). If the output lists thousands of files, check `.vscodeignore` —
a missing entry for `.venv/`, `.cache/`, or `site/` will cause a bloated package.

Install directly:

```bash
code --install-extension htmx-tags-django-*.vsix --force
```

Reload VS Code when prompted. Uninstall with:

```bash
code --uninstall-extension difegam.htmx-tags-django
```

> **Note:** The extension ID is `difegam.htmx-tags-django` (publisher + name from `package.json`).
> Running `code --list-extensions` shows what is currently installed with the exact ID to use.

### Running tests

This project uses pytest for unit tests. Run them with:

```bash
just test
```

Or directly:

```bash
uv run pytest -q
```

These are plain Python unit tests with no VS Code dependency and can run freely from any terminal.

## Suggested technical backlog

- add CI drift detection to flag when upstream HTMX docs change between releases
- add CI checks for generation drift (regenerate and diff in CI)
