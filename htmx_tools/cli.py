"""Unified CLI for htmx-tags developer tooling."""

from __future__ import annotations

import json
import logging
import sys
from pathlib import Path

from cyclopts import App

from htmx_tools.catalog import (
    DEFAULT_HTMX_V2_VERSION,
    DEFAULT_HTMX_V4_VERSION,
    DEFAULT_OUTPUT_FILE,
    build_catalog,
)
from htmx_tools.pins import check_pins as _check_pins
from htmx_tools.snippets import SOURCE_FILE, generated_outputs, sync_outputs

app = App(name="htmx-tools", help=__doc__)


@app.command
def check_pins() -> None:
    """Verify the pinned HTMX tags are still current upstream."""
    raise SystemExit(_check_pins())


@app.command(name="build-data")
def build_data(
    htmx_v2_version: str = DEFAULT_HTMX_V2_VERSION,
    htmx_v4_version: str = DEFAULT_HTMX_V4_VERSION,
    output: Path = DEFAULT_OUTPUT_FILE,
) -> None:
    """Regenerate htmx.catalog.json from pinned upstream HTMX docs."""
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    logger = logging.getLogger("htmx_tools.catalog")
    catalog = build_catalog(htmx_v2_version, htmx_v4_version)
    output.write_text(json.dumps(catalog, indent=2) + "\n", encoding="utf-8")
    logger.info("Wrote %s with %s attributes", output, len(catalog["attributes"]))


@app.command(name="build-snippets")
def build_snippets(check: bool = False) -> None:
    """Validate the Django HTMX snippet source and (re)generate its outputs."""
    try:
        stale = sync_outputs(generated_outputs(), check=check)
    except (OSError, json.JSONDecodeError, ValueError) as error:
        print(f"{SOURCE_FILE}: {error}", file=sys.stderr)
        raise SystemExit(1) from None

    if check and stale:
        for path in stale:
            relative = path.relative_to(SOURCE_FILE.parent.parent)
            print(f"stale generated file: {relative}", file=sys.stderr)
        raise SystemExit(1)
