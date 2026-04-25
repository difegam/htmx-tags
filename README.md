# htmx-tags (Difegam fork)

![CodeRabbit Pull Request Reviews](https://img.shields.io/coderabbit/prs/github/difegam/htmx-tags?utm_source=oss&utm_medium=github&utm_campaign=difegam%2Fhtmx-tags&labelColor=171717&color=FF570A&link=https%3A%2F%2Fcoderabbit.ai&label=CodeRabbit+Reviews)

`htmx-tags` is a VS Code extension that provides autocompletion and hover documentation for HTMX attributes.

## Features

- HTMX attribute completion in HTML files.
- HTMX hover documentation based on upstream `htmx.org` attribute pages.
- Django template support via `django-html` activation and dependency on the Django extension.

## HTMX 2.x compatibility updates

Aligned with the HTMX 2.0 release guidance:

- Removed deprecated `hx-sse` and `hx-ws` from custom attribute data.
- Added wildcard `hx-on` autocomplete entries for `hx-on:*` and `hx-on::*` syntax.
- Kept docs generation targeting HTMX `2.0.9` by default in `build-data.py`.

## Django template support

This extension is validated to support Django templates by:

- Activating on `django-html` language files.
- Declaring `batisteo.vscode-django` as an extension dependency.
- Running automated tests that verify both settings.

## Development

### Tooling

This repository uses modern, update-friendly tooling:

- **TypeScript** for extension scaffold and strict compile checks.
- **uv** for Python dependency and environment management.
- **prek** for pre-commit/pre-push hook orchestration.
- **just** recipes for repeatable local commands.
- **GitHub Actions** for CI checks.

### Quick start

```bash
just init
just check
```

### Regenerate custom HTMX data

```bash
just build-data
```

or directly:

```bash
uv run python build-data.py --htmx-version 2.0.9
```

## License

`htmx-tags` is licensed under the Apache 2.0 License. See `LICENSE.txt`.

## Credits

This package is maintained at `difegam/htmx-tags` and is a community fork of the original `otovo/htmx-tags` project.
All credit for the original idea, data model, and initial implementation goes to the original maintainers and contributors.
