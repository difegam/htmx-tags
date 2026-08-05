# First Docs Build

Serve the local Zensical site and validate the same documentation build that GitHub Pages uses.

## Prerequisites

- Python 3.12 or later
- `uv`

## Install documentation dependencies

```bash
uv sync --group docs
```

## Serve the site

```bash
just docs
```

Open <http://localhost:1031> and navigate through the section indexes. Zensical rebuilds the site when a Markdown file or `zensical.toml` changes.

## Validate before review

```bash
just docs-strict
```

The command builds to `site/`, which is ignored by the extension package. In restricted environments, use the same command through a workspace-local uv cache:

```bash
uv --cache-dir .cache/uv run zensical build --clean --strict
```

## Formatting

```bash
just docs-format
```

This recipe uses `uvx` to obtain the Markdown formatter and rewrites documentation files. Review its diff before committing.
