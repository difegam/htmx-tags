# htmx-tags documentation

This documentation is for maintainers and contributors of the `htmx-tags` VS Code extension.

## Project status snapshot

As currently implemented in this repository:

- Extension package name: `htmx-tags`
- Published version: `0.0.7`
- VS Code engine requirement: `^1.63.0`
- htmx docs source used by generator: `v1.9.6`
- Runtime model: static JSON custom data consumed by VS Code HTML language features

## What the extension does

- contributes htmx attributes as HTML custom data
- provides autocomplete and hover descriptions in HTML files
- links attributes to official `https://htmx.org/attributes/<name>/` reference pages

## Repository map

- `package.json` — extension manifest and contribution points
- `build-data.py` — generator for custom data
- `html.htmx-data.json` — generated artifact consumed by VS Code
- `docs/` — project and maintenance documentation
- `zensical.toml` — docs site configuration

## Read next

- [Installation](installation.md): install extension and run local docs site
- [Development](development.md): contributor workflow and coding expectations
- [Architecture](architecture.md): component responsibilities and data flow
- [Release](release.md): versioning and publish checklist
- [Troubleshooting](troubleshooting.md): common errors and recovery steps
