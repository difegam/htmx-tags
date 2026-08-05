# CI and Packaging

The CI workflow verifies source quality, catalog determinism, extension-host behavior, and the packaged VSIX.

## CI checks

`.github/workflows/ci.yml` runs on pushes and pull requests for `main` and `master`:

1. installs Node 22, Python 3.12, npm dependencies, and the locked uv environment;
1. runs ESLint, TypeScript type checking, Ruff checks, and Python tests;
1. runs TypeScript unit tests;
1. regenerates `htmx.catalog.json` and checks for a diff;
1. runs VS Code extension-host smoke tests through Xvfb;
1. packages and lists the VSIX contents.

## Package locally

```bash
npm run package
npx vsce ls --tree
```

The package should include compiled JavaScript, `htmx.catalog.json`, the Django snippets, README, license, icon, banner, and editor screenshots. `.vscodeignore` removes source files, tests, docs, local caches, Python tooling, and Node tooling from the VSIX.

## Test the artifact

```bash
code --install-extension htmx-tags-django-*.vsix --force
```

Open an HTML file and a Django HTML template, then verify `hx-` completion, `data-hx-*` aliases, hover on a known attribute, no hover on an ordinary HTML attribute, diagnostics, and local partial completion.
