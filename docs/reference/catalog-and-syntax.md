# Catalog and Dynamic Syntax

The committed catalog is generated from HTMX `2.0.10` and `4.0.0-beta6` and is the extension's only runtime documentation source.

## Catalog entries

Every canonical `hx-*` entry carries its official category for each supported major version alongside a concise description and documentation link. HTMX 2 uses Core and Additional; HTMX 4 uses Requests, Request Control, Scripting, Data, History, Enhancements, and Advanced. Entries can also carry a deprecation note, documented value suggestions, and supported modifiers. `data-hx-*` is not duplicated in the file; it normalizes to the canonical entry at runtime.

Completion labels and rich documentation show the category for the configured version. Compatible mode shows both categories when they differ, such as `HTMX 2: Core · HTMX 4: Requests` for `hx-get`.

## Documented value completion

| Attribute     | Completion content                                           | Strict validation |
| ------------- | ------------------------------------------------------------ | ----------------- |
| `hx-boost`    | `true`, `false`                                              | Yes               |
| `hx-encoding` | `multipart/form-data`                                        | Yes               |
| `hx-method`   | `get`, `post`, `put`, `patch`, `delete`                      | Yes               |
| `hx-swap`     | swap strategies and HTMX 4 aliases                           | No                |
| `hx-target`   | `this`, `closest`, `find`, siblings, and HTMX 4 target forms | No                |
| `hx-trigger`  | events and trigger modifiers                                 | No                |

When strict validation applies, template expressions are exempt so a dynamic Django value does not generate a literal-value warning.

## Dynamic names

| Form                                               | Versions | Meaning                                  |
| -------------------------------------------------- | -------- | ---------------------------------------- |
| `hx-on:<event>` / `hx-on::<event>`                 | 2, 4     | Inline DOM or HTMX event handler.        |
| `hx-target-error`, `hx-target-404`, `hx-target-4*` | 2        | Response-targets extension target.       |
| `hx-status:422`, `hx-status:5xx`                   | 4        | Status-specific HTMX 4 swap behavior.    |
| `hx-confirm:inherited`                             | 4        | Inherited modifier.                      |
| `hx-headers:append`                                | 4        | Append modifier on supported attributes. |

The same patterns accept a `data-` prefix. See [Compatibility](../explanation/compatibility.md) for version-mode behavior.
