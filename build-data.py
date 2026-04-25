#!/usr/bin/env python3
"""Generate HTMX custom data used by the VS Code HTML language service."""

from __future__ import annotations

import argparse
import json
import logging
import re
import zipfile
from io import BytesIO
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import urlopen

from packaging import version

LOGGER = logging.getLogger(__name__)
DEFAULT_HTMX_VERSION = "2.0.9"
DEFAULT_OUTPUT_FILE = Path("html.htmx-data.json")
REMOVED_IN_HTMX_V2 = {"hx-sse", "hx-ws"}
FRONT_MATTER_PATTERN = re.compile(r"^\s*\+\+\+\s*\n.*?\n\+\+\+\s*(?:\n|$)", re.DOTALL)


def build_base_payload() -> dict[str, Any]:
    """Create the base custom-data payload."""
    return {
        "version": 1.1,
        "tags": [],
        "globalAttributes": [],
        "valueSets": [
            {
                "name": "swap",
                "values": [
                    {
                        "name": "innerHTML",
                        "description": "The default, puts the content inside the target element",
                    },
                    {
                        "name": "outerHTML",
                        "description": "Replaces the entire target element with the returned content",
                    },
                    {
                        "name": "afterbegin",
                        "description": "Prepends the content before the first child inside the target",
                    },
                    {
                        "name": "beforebegin",
                        "description": "Prepends the content before the target in the targets parent element",
                    },
                    {
                        "name": "beforeend",
                        "description": "Appends the content after the last child inside the target",
                    },
                    {
                        "name": "afterend",
                        "description": "Appends the content after the target in the targets parent element",
                    },
                    {
                        "name": "delete",
                        "description": "Deletes the target element regardless of the response",
                    },
                    {
                        "name": "none",
                        "description": "Does not append content from response (Out of Band Swaps and Response Headers will still be processed)",
                    },
                ],
            }
        ],
    }


def fetch_zip_content(zip_url: str) -> bytes:
    """Fetch a ZIP archive over HTTPS."""
    parsed_url = urlparse(zip_url)
    if parsed_url.scheme != "https":
        msg = f"Invalid archive URL scheme '{parsed_url.scheme}'. Expected 'https'."
        raise ValueError(msg)

    LOGGER.info("Downloading htmx docs archive: %s", zip_url)
    try:
        with urlopen(zip_url, timeout=10) as response:
            if response.status != 200:
                msg = f"Unexpected status code: {response.status}"
                raise RuntimeError(msg)
            return response.read()
    except HTTPError as exc:
        msg = f"Unable to download HTMX archive ({exc.code}): {zip_url}"
        raise RuntimeError(msg) from exc
    except URLError as exc:
        msg = f"Unable to reach HTMX archive: {zip_url} ({exc.reason})"
        raise RuntimeError(msg) from exc


def strip_front_matter(markdown: str) -> str:
    """Strip TOML front matter from HTMX markdown files."""
    match = FRONT_MATTER_PATTERN.match(markdown)
    if match is None:
        return markdown.strip()
    return markdown[match.end() :].strip()


def iter_attribute_docs(zip_bytes: bytes) -> list[tuple[str, str]]:
    """Extract (attribute_name, markdown_doc) tuples from the HTMX docs archive."""
    attributes: list[tuple[str, str]] = []
    try:
        with zipfile.ZipFile(BytesIO(zip_bytes)) as zip_fd:
            for zip_info in zip_fd.infolist():
                if not (
                    zip_info.filename.endswith(".md")
                    and "/www/content/attributes/" in zip_info.filename
                    and "_index" not in zip_info.filename
                ):
                    continue

                attribute = Path(zip_info.filename).stem
                attribute_doc = zip_fd.read(zip_info).decode()
                attributes.append((attribute, strip_front_matter(attribute_doc)))
    except zipfile.BadZipFile as exc:
        msg = f"invalid ZIP payload when parsing attributes bundle ({len(zip_bytes)} bytes): {exc}"
        raise RuntimeError(msg) from exc

    return sorted(attributes, key=lambda item: item[0])


def apply_htmx_v2_adjustments(payload: dict[str, Any]) -> dict[str, Any]:
    """Apply known HTMX 2.x compatibility adjustments to custom-data output."""
    attributes: list[dict[str, Any]] = payload["globalAttributes"]
    filtered_attributes = [entry for entry in attributes if entry["name"] not in REMOVED_IN_HTMX_V2]

    existing_names = {entry["name"] for entry in filtered_attributes}
    hx_on_wildcards: list[dict[str, Any]] = [
        {
            "name": "hx-on:*",
            "description": "HTMX 2.x event handler syntax using `hx-on:<event-name>` (for example `hx-on:click`).",
            "references": [
                {"name": "Official documentation", "url": "https://htmx.org/attributes/hx-on/"}
            ],
        },
        {
            "name": "hx-on::*",
            "description": "HTMX shorthand syntax for internal events using `hx-on::<event-name>`, such as `hx-on::before-request`.",
            "references": [
                {"name": "Official documentation", "url": "https://htmx.org/attributes/hx-on/"}
            ],
        },
    ]

    for entry in hx_on_wildcards:
        if entry["name"] not in existing_names:
            filtered_attributes.append(entry)

    payload["globalAttributes"] = sorted(filtered_attributes, key=lambda item: item["name"])
    return payload


def build_payload(htmx_version: str) -> dict[str, Any]:
    """Build the full payload from upstream HTMX docs."""
    payload = build_base_payload()
    documented_value_sets = {entry["name"] for entry in payload["valueSets"]}

    zip_url = f"https://github.com/bigskysoftware/htmx/archive/refs/tags/v{htmx_version}.zip"
    zip_bytes = fetch_zip_content(zip_url)

    for attribute, description in iter_attribute_docs(zip_bytes):
        entry: dict[str, Any] = {
            "name": attribute,
            "description": description,
            "references": [
                {
                    "name": "Official documentation",
                    "url": f"https://htmx.org/attributes/{attribute}/",
                }
            ],
        }
        base = attribute.removeprefix("hx-")
        if base in documented_value_sets:
            entry["valueSet"] = base

        payload["globalAttributes"].append(entry)

    if version.parse(htmx_version) >= version.parse("2.0.0"):
        return apply_htmx_v2_adjustments(payload)
    return payload


def parse_args() -> argparse.Namespace:
    """Parse CLI arguments."""
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--htmx-version", default=DEFAULT_HTMX_VERSION)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_FILE)
    return parser.parse_args()


def main() -> int:
    """Entry point."""
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    args = parse_args()

    payload = build_payload(htmx_version=args.htmx_version)
    args.output.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    LOGGER.info("Wrote %s with %s attributes", args.output, len(payload["globalAttributes"]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
