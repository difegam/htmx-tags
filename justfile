set shell := ["bash", "-cu"]

[doc("List all available recipes")]
default:
    @just --list

[doc("Install Python tooling via uv and install prek hooks")]
init:
    uv sync --all-groups
    uv run prek install --hook-type pre-commit --hook-type pre-push

[doc("Run linter and formatter")]
[group("code-quality")]
lint:
    uv run ruff check --fix
    uv run ruff format

[doc("Regenerate htmx.catalog.json from pinned upstream HTMX docs")]
build-data:
    uv run python build-data.py

[doc("Run all local checks")]
check: lint test
    uv run prek run --all-files

[doc("Run tests")]
test:
    npm test

[doc("Run the VS Code extension-host smoke tests")]
test-extension:
    npm run test:extension

[doc("Format documentation files")]
[group("docs")]
docs-format:
    uvx --cache-dir .cache/uv --with mdformat-ruff --with mdformat-gfm --with mdformat-web --with "mdformat-mkdocs[recommended]" mdformat docs

[doc("build docs and fail on any warning")]
[group("docs")]
docs-strict:
    uv --cache-dir .cache/uv run zensical build --clean --strict

[doc("serve docs locally with hot reload")]
[group("docs")]
docs:
    @echo 'Serving docs on http://localhost:1031'
    uv --cache-dir .cache/uv run zensical serve -a localhost:1031

[doc("build docs site to site/")]
[group("docs")]
docs-build:
    uv --cache-dir .cache/uv run zensical build --clean
