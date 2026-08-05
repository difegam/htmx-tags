# Release

Release a version only after the committed catalog, source, docs, and VSIX have been reviewed together.

## Prepare

1. Update the extension version in `package.json`.
1. Decide whether the pinned HTMX 2/4 release constants in `htmx_tools/catalog.py` need an update.
1. Regenerate the catalog if generator logic, source versions, or catalog metadata changed.
1. Update user-visible docs and release notes for changed behavior.

## Validate

```bash
npm run lint
npm run check-types
npm test
npm run test:extension
just docs-strict
npm run package
npx vsce ls --tree
```

Sideload the generated VSIX and smoke test the completion, hover, diagnostic, and Django partial paths described in [CI and Packaging](ci-and-packaging.md).

## Publish

Publishing is a maintainer action outside the normal validation workflow:

```bash
npx vsce publish
git tag v<version>
git push --tags
```

Create the corresponding GitHub release with release notes linked to that tag.

## Rollback

If a published artifact is unacceptable, restore the previous known-good catalog and source state, increment the patch version, rerun the complete validation set, and publish a corrective release with an explicit rollback note.
