# htmx-tags documentation

This documentation is for maintainers and contributors of the `htmx-tags` VS Code extension.

## Project status snapshot

As currently implemented in this repository:

- Extension package name: `htmx-tags-django`
- Published version: `0.1.1`
- VS Code engine requirement: `^1.90.0`
- htmx docs source used by generator: `2.0.9`
- Runtime model: static JSON custom data consumed by VS Code HTML features

## What the extension does

- contributes htmx attributes as HTML custom data
- provides autocomplete and hover descriptions in HTML and Django template files
- activates on `html` and `django-html` language files; requires `batisteo.vscode-django` for Django support
- links attributes to official `https://htmx.org/attributes/<name>/` reference pages

## Repository map

- `package.json` — extension manifest and contribution points
- `src/extension.ts` — extension entry point (declarative, no-op by design)
- `build-data.py` — generator for custom data
- `html.htmx-data.json` — generated artifact consumed by VS Code
- `.vscodeignore` — controls which files are packaged into the VSIX
- `docs/` — project and maintenance documentation
- `zensical.toml` — docs site configuration

## Read next

- [Installation](installation.md): install extension and run local docs site
- [Development](development.md): contributor workflow and coding expectations
- [Architecture](architecture.md): component responsibilities and data flow
- [Release](release.md): versioning and publish checklist
- [Troubleshooting](troubleshooting.md): common errors and recovery steps
