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

[doc("Regenerate html.htmx-data.json from upstream HTMX docs")]
build-data:
    uv run python build-data.py

[doc("Run all local checks")]
check: lint test
    uv run prek run --all-files

[doc("Run tests")]
test:
    uv run pytest -q
