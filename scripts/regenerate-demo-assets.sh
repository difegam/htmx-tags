#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

npm run compile
npm run bundle
node out/test/captureScreenshots.js

assets=(
  diagnostics.png
  partials.png
  attribute-completions.gif
  context-aware-values.gif
  hover-documentation.gif
)

for asset in "${assets[@]}"; do
  test -s "images/$asset"
  test -s "docs/assets/images/$asset"
  cmp -s "images/$asset" "docs/assets/images/$asset"
done
