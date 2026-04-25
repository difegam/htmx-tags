# Release guide

## Current release baseline

- package version in `package.json`: `0.0.7`
- generator source htmx version in `build-data.py`: `1.9.6`

## Release checklist

1. Update `package.json` version
1. Review whether `HTMX_VERSION` should be updated
1. Regenerate `html.htmx-data.json` when generator or source version changes
1. Verify extension behavior in VS Code
1. Prepare release notes and publish

## Recommended smoke test

1. Install or launch extension in Extension Development Host
1. Open an HTML file
1. Type `hx-` and verify completion suggestions
1. Verify presence of common attributes (`hx-get`, `hx-post`, `hx-swap`)
1. Hover attributes and verify readable docs and links

## Regression signals to watch

- no suggestions on `hx-` prefix
- missing hover docs
- malformed markdown rendering
- broken or missing reference URLs

## Rollback strategy

If release quality is unacceptable:

1. revert to previous known-good generated JSON
1. increment patch version
1. republish with explicit rollback note

## GitHub Pages deployment

This repository includes a Pages workflow at `.github/workflows/docs.yml` that:

1. runs on push to `main` (and manual dispatch)
1. installs Python 3.12 and `uv`
1. builds docs with `zensical build --clean --strict`
1. uploads `site/` and deploys with `actions/deploy-pages`

If deployment fails, inspect the **Documentation** workflow run in GitHub Actions first.
