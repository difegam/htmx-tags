# Django-first HTMX Examples and Snippets

**Status:** Approved design  
**Date:** 2026-08-05

## Summary

Create a dependency-free generated library of 22 secure Django/HTMX template patterns. A single source catalog generates both the packaged VS Code snippets and their copyable documentation. The extension's TypeScript runtime, configuration, and language registrations remain unchanged.

## Goals

- Make each new pattern a single catalog edit followed by one generation command.
- Keep runtime snippets and documentation synchronized.
- Ship secure Django defaults and reject known-dangerous example constructs before generation.
- Preserve all existing snippet prefixes and HTMX 2/4 compatible-mode behavior.

## Architecture

Add `snippets/django-htmx.source.json` as the canonical source. It contains an ordered array of entries with exactly these required fields:

| Field | Meaning |
| --- | --- |
| `name` | Unique human-readable VS Code snippet name. |
| `prefix` | Unique completion prefix. Existing prefixes remain stable. |
| `category` | One of the five documented catalog sections. |
| `description` | Concise text shown by VS Code and in documentation. |
| `body` | Non-empty array of VS Code snippet lines. |
| `usage` | One short explanation of the endpoint response or template context required. |

Add a dependency-free Python generator at `build-snippets.py`. Normal mode validates the complete catalog in memory, then deterministically writes:

- `snippets/django-htmx.json`, retaining its current `package.json` contribution path.
- `docs/reference/snippets.md`, expanded into a prefix table and copyable Django-template examples grouped by category.

Source order controls order within each category. Output uses stable indentation, UTF-8, and a final newline. Validation must finish before either output is written.

The generator also accepts `--check`. Check mode performs no writes, reports each missing or stale output, and exits nonzero when regeneration is required.

Add `build-snippets` and `check-snippets` package scripts using the repository's workspace-local `uv` cache convention. Include `check-snippets` in `npm test`. The README links to the generated snippet reference instead of maintaining a duplicate prefix list.

The source catalog, generator, tests, and documentation stay excluded from the VSIX. Only the generated runtime snippet JSON is packaged.

## Pattern Catalog

The generated library contains exactly these 22 stable prefixes:

| Category | Prefix | Template behavior |
| --- | --- | --- |
| Requests and forms | `htmx-get` | GET button targeting a replaceable content region. Preserve the current body. |
| Requests and forms | `htmx-post` | CSRF-protected POST form targeting a content region. Preserve the current body. |
| Requests and forms | `htmx-delete` | CSRF-protected POST form whose Django view performs deletion and returns the replacement or empty result. This replaces the current unsafe `hx-delete` button. |
| Requests and forms | `htmx-search` | Debounced GET search input targeting results. Preserve the current body. |
| Requests and forms | `htmx-form-validation` | CSRF-protected POST form that replaces its validation-error region with server-rendered errors. |
| Requests and forms | `htmx-file-upload` | CSRF-protected multipart POST form with a text status indicator and response target; no client script or fake progress meter. |
| Requests and forms | `htmx-bulk-actions` | CSRF-protected POST form containing selected row identifiers and replacing the affected table region. |
| Requests and forms | `htmx-dependent-dropdown` | Select element issuing a GET on change and replacing the dependent select. |
| Loading and navigation | `htmx-infinite` | Revealed trigger loading and appending the next page. Preserve the current body. |
| Loading and navigation | `htmx-poll` | Region polling itself with `every 5s`; the endpoint returns the same region and omits polling when complete. |
| Loading and navigation | `htmx-lazy` | Region loading itself once on `load` and replacing its placeholder. |
| Loading and navigation | `htmx-boost-nav` | Normal navigation links enhanced with `hx-boost`, a main-content target, and history updates. |
| Loading and navigation | `htmx-progress` | Accessible native `progress` element inside a polling region; the endpoint returns updated markup and stops polling when complete. |
| Editing and UI | `htmx-click-to-edit` | Read-only record wrapper whose GET button replaces it with a server-rendered edit form. |
| Editing and UI | `htmx-table-row` | Table row whose GET edit button replaces that row with server-rendered editing markup. |
| Editing and UI | `htmx-modal` | GET button replacing a dialog placeholder; the endpoint returns an accessible `<dialog open>` with a native close form. |
| Editing and UI | `htmx-tabs` | Server-driven tabs loaded into one region; the response owns tab selection and ARIA state. |
| Server responses | `htmx-oob-swap` | Server-response fragment using `hx-swap-oob` to update a separate region. |
| Server responses | `htmx-toast` | Accessible `role="status"` server-response fragment appended out of band to a notifications region. |
| Django partials | `partialdef` | Standard Django partial definition. Preserve the current body. |
| Django partials | `partialdef-inline` | Inline Django partial definition. Preserve the current body. |
| Django partials | `partial` | Same-file Django partial render tag. Preserve the current body. |

All request URLs use `{% url %}` placeholders. Patterns are template-side only; the `usage` field states the HTML that the endpoint must return. No sample Django application, views, URL configuration, models, CSS framework, or JavaScript framework is added.

## Security and Compatibility

The generator rejects the catalog when any of these rules fail:

- Names and prefixes are non-empty and unique; prefixes match the established `htmx-*` names or one of the three existing partial prefixes.
- Categories are one of the five catalog categories and body arrays contain only non-empty strings.
- Any body containing `hx-post`, `hx-put`, `hx-patch`, or `hx-delete` also contains a `<form` and `{% csrf_token %}`.
- Bodies do not contain `<script`, inline `on*=` event handlers, `hx-on`, `javascript:`, `js:`, or remotely hosted executable `src` resources.
- Bodies do not use the excluded `hx-sse` or `hx-ws` attributes.

The catalog uses only HTMX syntax supported by both pinned versions. It excludes SSE, WebSocket, full-page CDN boilerplate, and a second active-search pattern. File upload remains script-free. Tabs and modal state are server-driven. User-authored snippet loading, runtime code generation, network access, new settings, and new dependencies are out of scope.

Patterns are independently authored using the official [HTMX examples](https://htmx.org/examples/) and [Django CSRF documentation](https://docs.djangoproject.com/en/6.0/ref/csrf/) as behavioral references; no snippet text is copied from the third-party toolkit.

## Error Handling

Catalog errors identify the affected entry or prefix and the violated rule, then exit nonzero without writing outputs. Malformed JSON uses the standard parser error with the source path. Check mode lists stale or missing generated paths and never modifies them.

## Verification

- Unit-test schema validation, category validation, stable ordering, unique names and prefixes, and non-empty bodies.
- Exercise every security rejection rule and representative valid mutating and read-only patterns.
- Generate into a temporary directory and assert deterministic output.
- Verify `--check` succeeds for committed output, fails for stale output, and does not modify files.
- Assert the exact 22-prefix set and preservation of all eight current prefixes.
- Verify `package.json` still registers only `snippets/django-htmx.json` for `django-html`.
- Package the VSIX and confirm it includes the generated runtime JSON while excluding its source catalog, generator, tests, and docs.
- Run TypeScript and Python lint, type checks, unit tests, documentation build, extension-host tests, and VSIX packaging.

## Public Behavior

Fourteen new prefixes become available in `django-html`. The eight existing prefixes remain available. The only intentional behavior change to an existing prefix is the CSRF-protected POST implementation of `htmx-delete`. No extension API, setting, activation event, or TypeScript type changes.
