# Changelog

All notable changes to the HTMX Tags for Django extension are documented here.
The project follows [Keep a Changelog](https://keepachangelog.com/) conventions and adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- HTMX pin staleness guard in CI (`scripts/check-htmx-pins.py`) that fails when the pinned upstream tags drift from the latest `bigskysoftware/htmx` git tags.
- `extensionKind: ["ui"]` so the extension activates on the local UI host under SSH/remote/Dev Containers.
- `.vscode/launch.json` "Run Extension" config for F5-attach debugging.

### Changed

- HTMX 4 pin bumped from `4.0.0-beta5` to `4.0.0-beta6`; catalog regenerated.
- Catalog attribute and `hx-disinherit` completion lists are memoized per version mode, reducing per-keystroke allocation.
- `vscode.workspace.findFiles` now caps at 2000 matches to avoid runaway completion latency on large monorepos.
- TypeScript compile is incremental (`tsBuildInfoFile` under `out/`); iterative `npm run test:unit` rebuilds faster.
- `preview: true` declared in `package.json` Marketplace metadata pending the 1.0 cut.

## [0.2.0] — 2026-08-05

### Added

- Catalog covers both HTMX `2.0.10` and `4.0.0-beta6` with `compatible` default mode accepting their union.
- Per-version diagnostic hints when an attribute or value is exclusive to HTMX 2 or 4.
- `DocumentCompletionItemProvider` with deferred documentation resolution via `resolveCompletionItem`.
- Value completions for `hx-swap`, `hx-trigger`, `hx-target`, `hx-ext`, `hx-sync`, `hx-params`, `hx-disinherit`, and `hx-swap-oob` aware of their syntactic segments.
- Django 6 partial IntelliSense: same-file and cross-template completion, Go-to-Definition, hover, Find References, Rename, duplicate/unknown diagnostics, and quick fixes.
- Cross-template partial scanning from `{% include "name.html#partial" %}` and common Python view calls (`render`, `render_to_string`, `get_template`, `select_template`, `TemplateResponse`).
- Quick-fix suggestions for unknown attributes, invalid values, deprecated attributes, and unknown partials.
- Django HTMX snippet library covering GET, POST, DELETE, search, infinite scroll, dependent dropdown, bulk actions, file upload, out-of-band swaps, accessible toasts, and partial definitions.
- Offline-by-design: packaged catalog with no runtime network requests.

## [0.1.1] — initial Marketplace publish

- Fork from `otovo/htmx-tags` with the Django partial toolchain and HTMX `4.0.0-beta5` catalog layer.
