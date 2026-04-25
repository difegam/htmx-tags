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

[doc("build docs and fail on any warning")]
[group("docs")]
docs-strict:
    uv run zensical build --clean --strict
