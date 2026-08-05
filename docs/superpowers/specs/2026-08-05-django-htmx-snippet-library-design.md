# Django-first HTMX Examples and Snippets

**Status:** Approved design\
**Date:** 2026-08-05

## Summary

Create a dependency-free generated library of 22 secure Django/HTMX template patterns. Classify repository-observed workflows as common, broader examples as curated recipes, and template partials as Django 6 primitives. A single source catalog generates both the packaged VS Code snippets and their copyable documentation; a Core Django guide documents their shared server contracts. The extension's TypeScript runtime, configuration, and language registrations remain unchanged.

## Goals

- Make each new pattern a single catalog edit followed by one generation command.
- Keep runtime snippets and documentation synchronized.
- Ship secure Django defaults and reject known-dangerous example constructs before generation.
- Preserve all existing snippet prefixes and HTMX 2/4 compatible-mode behavior.

## Architecture

Add `snippets/django-htmx.source.json` as the canonical source. It contains an ordered array of entries with exactly these required fields:

| Field            | Meaning                                                                      |
| ---------------- | ---------------------------------------------------------------------------- |
| `name`           | Unique human-readable VS Code snippet name.                                  |
| `prefix`         | Unique completion prefix. Existing prefixes remain stable.                   |
| `category`       | One of the five documented catalog sections.                                 |
| `classification` | One of `common`, `curated`, or `django-6`.                                   |
| `description`    | Concise text shown by VS Code and in documentation.                          |
| `body`           | Non-empty array of VS Code snippet lines.                                    |
| `usage`          | One short explanation of the endpoint response or template context required. |

Add a dependency-free Python generator at `build-snippets.py`. Normal mode validates the complete catalog in memory, then deterministically writes:

- `snippets/django-htmx.json`, retaining its current `package.json` contribution path.
- `docs/reference/snippets.md`, expanded into a prefix table and copyable Django-template examples grouped by category.

Add `docs/how-to/django-response-contracts.md` for the shared Core Django view contracts: full-page versus partial rendering, cache variation, CSRF-safe forms, response headers, and order-independent OOB updates.

Source order controls order within each category. Output uses stable indentation, UTF-8, and a final newline. Validation must finish before either output is written.

The generator also accepts `--check`. Check mode performs no writes, reports each missing or stale output, and exits nonzero when regeneration is required.

Add `build-snippets` and `check-snippets` package scripts using the repository's workspace-local `uv` cache convention. Include `check-snippets` in `npm test`. The README links to the generated snippet reference instead of maintaining a duplicate prefix list.

The source catalog, generator, tests, and documentation stay excluded from the VSIX. Only the generated runtime snippet JSON is packaged.

## Pattern Catalog

The generated library contains exactly these 22 prefixes:

| Classification | Prefixes                                                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Common         | `htmx-get`, `htmx-post`, `htmx-delete`, `htmx-search`, `htmx-form-validation`, `htmx-infinite`, `htmx-lazy`, `htmx-click-to-edit`, `htmx-oob-swap`                             |
| Curated recipe | `htmx-file-upload`, `htmx-bulk-actions`, `htmx-dependent-dropdown`, `htmx-poll`, `htmx-boost-nav`, `htmx-progress`, `htmx-table-row`, `htmx-dialog`, `htmx-tabs`, `htmx-toast` |
| Django 6       | `partialdef`, `partialdef-inline`, `partial`                                                                                                                                   |

All request URLs use `{% url %}` placeholders. The generated reference keeps each template body beside its endpoint contract. The Core Django guide supplies reusable view examples without adding a sample application, models, CSS framework, JavaScript framework, or Python dependency.

## Security and Compatibility

The generator rejects the catalog when any of these rules fail:

- Names and prefixes are non-empty and unique; prefixes match the established `htmx-*` names or one of the three existing partial prefixes.
- Categories are one of the five catalog categories and body arrays contain only non-empty strings.
- Any mutating body is a normal POST form with `method`, `action`, `hx-post`, and `{% csrf_token %}`; `hx-put`, `hx-patch`, and `hx-delete` are rejected from this portable Django subset.
- Bodies do not contain `<script`, inline `on*=` event handlers, `hx-on`, `javascript:`, `js:`, or remotely hosted executable `src` resources.
- Bodies do not use the excluded `hx-sse` or `hx-ws` attributes.

The catalog uses only HTMX syntax supported by both pinned versions. It excludes SSE, WebSocket, extensions, full-page CDN boilerplate, and inline scripting. File upload remains script-free. Tabs replace their complete server-rendered wrapper. The dialog recipe is explicitly non-modal because opening a modal dialog requires `showModal()`. Validation errors return HTTP 200, boosted attributes are placed directly on links, and OOB examples do not rely on version-specific processing order.

Patterns are independently authored using the [HTMX 4 migration guide](https://four.htmx.org/migration-guide-htmx-4/), [Django 6 template-partial documentation](https://docs.djangoproject.com/en/6.0/ref/templates/language/#template-partials), and [Django CSRF documentation](https://docs.djangoproject.com/en/6.0/ref/csrf/) as normative references. The published guide acknowledges the reviewed projects without copying or mapping their code.

## Error Handling

Catalog errors identify the affected entry or prefix and the violated rule, then exit nonzero without writing outputs. Malformed JSON uses the standard parser error with the source path. Check mode lists stale or missing generated paths and never modifies them.

## Verification

- Unit-test schema validation, category validation, stable ordering, unique names and prefixes, and non-empty bodies.
- Exercise every security rejection rule and representative valid mutating and read-only patterns.
- Generate into a temporary directory and assert deterministic output.
- Verify `--check` succeeds for committed output, fails for stale output, and does not modify files.
- Assert the exact 22-prefix set and preservation of all eight current prefixes.
- Assert the exact classification sets, unique bodies, and regression contracts for validation, pagination, navigation, uploads, tabs, response headers, and OOB behavior.
- Insert every generated body through VS Code's snippet parser and reject unresolved placeholders.
- Verify `package.json` still registers only `snippets/django-htmx.json` for `django-html`.
- Package the VSIX and confirm it includes the generated runtime JSON while excluding its source catalog, generator, tests, and docs.
- Run TypeScript and Python lint, type checks, unit tests, documentation build, extension-host tests, and VSIX packaging.

## Public Behavior

Fourteen new prefixes become available in `django-html`. The eight existing prefixes remain available. The unshipped draft `htmx-modal` is renamed to the accurate `htmx-dialog`; classifications appear only in documentation. The only intentional behavior change to a previously shipped prefix is the CSRF-protected POST implementation of `htmx-delete`. No extension API, setting, activation event, or TypeScript type changes.
