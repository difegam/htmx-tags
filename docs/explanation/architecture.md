# Architecture

The extension turns a committed HTMX catalog and one shared scanner into editor features without runtime dependencies or network access.

```mermaid
flowchart LR
    Archives["Pinned HTMX 2 and 4 archives"] --> Generator["htmx_tools/catalog.py"]
    Generator --> Catalog["htmx.catalog.json"]
    Catalog --> Runtime["Catalog index"]
    Source["HTML, Django HTML, or Python document"] --> Scanner["Shared scanner"]
    Scanner --> Cache["Version-keyed scan cache"]
    Cache --> Completion["Completion provider"]
    Cache --> Hover["Hover provider"]
    Cache --> Diagnostics["Diagnostics provider"]
    Cache --> Definition["Definition provider"]
    Cache --> CodeActions["Quick-fix code actions"]
    Cache --> Rename["Reference and rename providers"]
    Workspace["Matching workspace templates"] --> Completion
    Workspace --> Definition
    Runtime --> Completion
    Runtime --> Hover
    Runtime --> Diagnostics
    Runtime --> CodeActions
```

## Build-time catalog

`htmx_tools/catalog.py` (run via `htmx-tools build-data`) merges HTMX `2.0.10` and `4.0.0-beta6` documentation into `htmx.catalog.json`. Each canonical attribute records descriptions, available major versions, version-specific official categories, documentation URLs, documented values, modifiers, deprecation metadata, and dynamic-name patterns. HTMX 2 categories come from its Core and Additional reference tables; HTMX 4 categories come from its exported attribute groups. The generated file is committed and CI regenerates it to detect drift.

## Runtime providers

`src/catalog.ts` loads the catalog, normalizes `data-hx-*` names to canonical `hx-*` names, and resolves dynamic patterns. `src/scanner.ts` is shared by completion, hover, and diagnostics so all features interpret multiline and incomplete tags consistently.

The scanner skips HTML comments, Django comments, `{% comment %}` and `{% verbatim %}` regions, and script/style bodies. It preserves Django expressions in attribute values, recognizes same-file `{% partialdef %}` and `{% partial %}` tags, and finds static cross-template partial references in Django includes and supported Python calls.

`src/scanCache.ts` memoizes each document's scan by its version, so the completion, hover, diagnostics, code-action, reference, and rename providers reuse one parse per revision instead of re-scanning on every request. Cross-template partial lookups are cached by template name and invalidated by a file-system watcher, so completion and navigation inside an `include`/`render` string do not re-glob the workspace on every keystroke.

`src/extension.ts` registers HTMX providers for `html` and `django-html`, plus partial completion and definition providers for `django-html` and Python. It also registers quick-fix code actions for its own diagnostics (`src/quickfixes.ts`) and reference and rename providers for same-file Django partials. Cross-template requests find matching workspace files and scan them on demand. Diagnostics remain limited to HTML and Django HTML; they are debounced after document changes, cleared when a document closes, and recomputed when `htmxTags` settings change. If the committed catalog cannot be loaded, activation reports the error and no providers are registered.

## Design boundaries

- The extension has no runtime dependencies and makes no runtime HTTP requests.
- The catalog stores canonical attributes only; aliases are synthesized during lookup and completion.
- Partial definitions are not indexed across a workspace, and template lookup does not model Django settings or loader order.
- Diagnostics intentionally warn only for clear HTMX typos, closed-set literal errors, duplicate local definitions, and unknown local references.
