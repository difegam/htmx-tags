# First Contribution

Make a small extension change and verify both its pure logic and its VS Code integration.

## Set up the workspace

```bash
npm install
uv sync --all-groups
```

## Choose the source of truth

| Change                                     | Primary location                        |
| ------------------------------------------ | --------------------------------------- |
| Attribute or version metadata              | `build-data.py` and `htmx.catalog.json` |
| Name parsing or Django partial recognition | `src/scanner.ts`                        |
| Resolution rules                           | `src/catalog.ts`                        |
| Validation behavior                        | `src/diagnostics.ts`                    |
| VS Code provider behavior                  | `src/extension.ts`                      |
| Django snippet                             | `snippets/django-htmx.json`             |

Add or update the focused Node or Python test that fails before the change. Regenerate the catalog only when its generator inputs or metadata change.

## Verify

```bash
npm run lint
npm run check-types
npm test
npm run test:extension
npm run package
```

`npm test` runs TypeScript unit tests and Python generator/manifest tests. `npm run test:extension` launches extension-host smoke tests for both supported language modes. Packaging confirms the installed artifact contains runtime files, catalog, snippets, and presentation assets rather than source and docs.

## Review catalog changes

```bash
npm run build-data
git diff -- htmx.catalog.json
```

Commit catalog and generator changes together. The CI workflow repeats regeneration and fails if it produces a diff.
