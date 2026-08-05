# Compatibility

The extension supports the HTMX 2 and HTMX 4 catalog union while allowing an editor to prefer one major version.

## Version modes

| `htmxTags.version`     | Completion     | Validation                    |
| ---------------------- | -------------- | ----------------------------- |
| `compatible` (default) | HTMX 2/4 union | No version warnings.          |
| `2`                    | HTMX 2 entries | HTMX 4-only syntax is a hint. |
| `4`                    | HTMX 4 entries | HTMX 2-only syntax is a hint. |

Explicit version hints are not errors: existing templates remain editable while a team migrates between versions.

## Aliases and dynamic names

`data-hx-*` aliases resolve to their canonical `hx-*` entry for hover and diagnostics. Attribute completion shows the aliased form only after a `data-` or `data-hx` prefix, avoiding two default lists.

The catalog also recognizes these documented dynamic forms and their `data-hx-*` equivalents:

- `hx-on:<event>` and `hx-on::<event>`
- response-target names such as `hx-target-error`, `hx-target-404`, and `hx-target-4*`
- HTMX 4 status names such as `hx-status:422` and `hx-status:5xx`
- HTMX 4 modifiers including `:inherited` and `:append` where supported

## Literal validation

The extension validates only documented closed sets, such as `hx-boost`, `hx-encoding`, and `hx-method`. It offers documented values for `hx-swap`, `hx-target`, and `hx-trigger` without treating their richer syntaxes as invalid. Django expressions embedded in values are left untouched.
