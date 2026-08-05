#!/usr/bin/env python3
"""Generate the offline HTMX 2/4 catalog consumed by the VS Code extension."""

from __future__ import annotations

import argparse
import json
import logging
import re
import tomllib
import zipfile
from io import BytesIO
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import urlopen

LOGGER = logging.getLogger(__name__)
DEFAULT_HTMX_V2_VERSION = "2.0.10"
DEFAULT_HTMX_V4_VERSION = "4.0.0-beta5"
DEFAULT_OUTPUT_FILE = Path("htmx.catalog.json")
REMOVED_IN_HTMX_V2 = {"hx-sse", "hx-ws"}

_INTERNAL_LINK_PATTERN = re.compile(r"@/([^\s)\]\"']+)")
_FRONT_MATTER_PATTERN = re.compile(
    r"^\s*(?P<delimiter>\+\+\+|---)\s*\n(?P<header>.*?)\n(?P=delimiter)\s*(?:\n|$)",
    re.DOTALL,
)
_YAML_METADATA_PATTERN = re.compile(
    r'^\s*(title|description)\s*:\s*["\'](.*?)["\']\s*$', re.MULTILINE
)

ATTRIBUTE_VALUES: dict[str, dict[str, Any]] = {
    "hx-boost": {
        "strict": True,
        "values": [("true", "Enable boosted navigation"), ("false", "Disable boosted navigation")],
    },
    "hx-encoding": {
        "strict": True,
        "values": [("multipart/form-data", "Use multipart form encoding for file uploads")],
    },
    "hx-method": {
        "strict": True,
        "values": [
            (method, f"Issue a {method.upper()} request")
            for method in ("get", "post", "put", "patch", "delete")
        ],
    },
    "hx-swap": {
        "values": [
            ("innerHTML", "Replace the target's contents"),
            ("outerHTML", "Replace the target element"),
            ("textContent", "Replace text without parsing HTML"),
            ("beforebegin", "Insert before the target"),
            ("afterbegin", "Insert before the target's first child"),
            ("beforeend", "Insert after the target's last child"),
            ("afterend", "Insert after the target"),
            ("delete", "Delete the target"),
            ("none", "Do not swap response content"),
            ("innerMorph", "Morph the target's contents (HTMX 4)"),
            ("outerMorph", "Morph the target element (HTMX 4)"),
            ("before", "Alias for beforebegin (HTMX 4)"),
            ("after", "Alias for afterend (HTMX 4)"),
            ("prepend", "Alias for afterbegin (HTMX 4)"),
            ("append", "Alias for beforeend (HTMX 4)"),
        ]
    },
    "hx-target": {
        "values": [
            ("this", "Target the element itself"),
            ("closest ", "Target the closest matching ancestor"),
            ("find ", "Target the first matching descendant"),
            ("next", "Target the next sibling"),
            ("previous", "Target the previous sibling"),
            ("host", "Target the shadow host (HTMX 4)"),
            ("global:", "Target outside the current shadow root (HTMX 4)"),
        ]
    },
    "hx-trigger": {
        "values": [
            ("click", "Trigger on click"),
            ("change", "Trigger when the value changes"),
            ("submit", "Trigger when the form submits"),
            ("load", "Trigger when the element loads"),
            ("revealed", "Trigger when scrolled into view"),
            ("intersect", "Trigger when intersecting the viewport"),
            ("every ", "Poll at an interval"),
            ("once", "Trigger only once"),
            ("changed", "Trigger only when the value changed"),
            ("delay:", "Delay the event"),
            ("throttle:", "Throttle the event"),
            ("from:", "Listen on another element"),
            ("target:", "Filter events by target"),
            ("consume", "Stop parent HTMX triggers"),
        ]
    },
}

APPENDABLE_V4_ATTRIBUTES = {"hx-headers", "hx-include", "hx-indicator", "hx-vals"}
DEPRECATED: dict[str, str] = {
    "hx-vars": "Deprecated in HTMX 2; use hx-vals instead.",
}

DYNAMIC_PATTERNS: list[dict[str, Any]] = [
    {
        "name": "hx-on:<event>",
        "pattern": r"^hx-on(?:::[a-z0-9_.:-]+|:[a-z0-9_.:-]+|--[a-z0-9_.-]+|-[a-z0-9_.-]+)$",
        "description": "Handle a DOM or HTMX event inline.",
        "versions": ["2", "4"],
        "documentation": {
            "2": "https://htmx.org/attributes/hx-on/",
            "4": "https://four.htmx.org/reference/attributes/hx-on",
        },
    },
    {
        "name": "hx-target-<status>",
        "pattern": r"^hx-target-(?:error|[1-5](?:[0-9]{2}|[0-9][*x]|[*x]{1,2}))$",
        "description": "Target responses by HTTP status through the response-targets extension.",
        "versions": ["2"],
        "documentation": {"2": "https://htmx.org/extensions/response-targets/"},
    },
    {
        "name": "hx-status:<status>",
        "pattern": r"^hx-status:[1-5](?:[0-9]{2}|[0-9]x|xx)$",
        "description": "Override HTMX 4 swap behavior for an HTTP status.",
        "versions": ["4"],
        "documentation": {"4": "https://four.htmx.org/reference/attributes/hx-status"},
    },
]


def _resolve_htmx_link(match: re.Match[str]) -> str:
    path = match.group(1)
    path_part, separator, fragment = path.partition("#")
    url_path = path_part.removesuffix(".md")
    anchor = f"#{fragment}" if separator else ""
    return f"https://htmx.org/{url_path}/{anchor}"


def resolve_htmx_links(text: str) -> str:
    """Replace HTMX 2's @/-prefixed documentation links with absolute URLs."""
    return _INTERNAL_LINK_PATTERN.sub(_resolve_htmx_link, text)


def fetch_zip_content(zip_url: str) -> bytes:
    """Fetch a ZIP archive over HTTPS."""
    parsed_url = urlparse(zip_url)
    if parsed_url.scheme != "https":
        raise ValueError(f"Invalid archive URL scheme '{parsed_url.scheme}'. Expected 'https'.")

    LOGGER.info("Downloading htmx docs archive: %s", zip_url)
    try:
        with urlopen(zip_url, timeout=30) as response:
            if response.status != 200:
                raise RuntimeError(f"Unexpected status code: {response.status}")
            return response.read()
    except HTTPError as exc:
        raise RuntimeError(f"Unable to download HTMX archive ({exc.code}): {zip_url}") from exc
    except URLError as exc:
        raise RuntimeError(f"Unable to reach HTMX archive: {zip_url} ({exc.reason})") from exc


def parse_document(markdown: str) -> tuple[dict[str, str], str]:
    """Return simple title/description front matter and the Markdown body."""
    match = _FRONT_MATTER_PATTERN.match(markdown)
    if match is None:
        return {}, markdown.strip()

    header = match.group("header")
    if match.group("delimiter") == "+++":
        try:
            parsed = tomllib.loads(header)
        except tomllib.TOMLDecodeError:
            parsed = {}
        metadata = {
            key: re.sub(r"\s+", " ", value).strip()
            for key in ("title", "description")
            if isinstance((value := parsed.get(key)), str)
        }
    else:
        metadata = {key: value for key, value in _YAML_METADATA_PATTERN.findall(header)}
    return metadata, markdown[match.end() :].strip()


def strip_front_matter(markdown: str) -> str:
    """Compatibility helper retained for downstream users and tests."""
    return parse_document(markdown)[1]


def _fallback_summary(body: str, attribute: str) -> str:
    text = re.sub(r"```.*?```", "", body, flags=re.DOTALL)
    text = re.sub(r"[#*_`\[\]]", "", text)
    paragraph = next((part.strip() for part in text.split("\n\n") if part.strip()), "")
    paragraph = re.sub(r"\s+", " ", paragraph)
    return paragraph[:240] or f"HTMX documentation for {attribute}."


def iter_attribute_docs(zip_bytes: bytes) -> list[tuple[str, str, str]]:
    """Extract canonical attribute name, summary, and body from either HTMX docs layout."""
    attributes: list[tuple[str, str, str]] = []
    try:
        with zipfile.ZipFile(BytesIO(zip_bytes)) as zip_fd:
            for zip_info in zip_fd.infolist():
                path = zip_info.filename
                is_v2 = path.endswith(".md") and "/www/content/attributes/" in path
                is_v4 = path.endswith(".md") and "/www/src/content/reference/01-attributes/" in path
                if not (is_v2 or is_v4) or "_index" in path or path.endswith("/index.md"):
                    continue

                metadata, body = parse_document(zip_fd.read(zip_info).decode())
                fallback_name = re.sub(r"^\d+-", "", Path(path).stem)
                attribute = metadata.get("title", fallback_name)
                if not attribute.startswith("hx-"):
                    continue
                description = metadata.get("description") or _fallback_summary(body, attribute)
                attributes.append((attribute, description, resolve_htmx_links(body)))
    except zipfile.BadZipFile as exc:
        raise RuntimeError(
            f"invalid ZIP payload when parsing attributes bundle ({len(zip_bytes)} bytes): {exc}"
        ) from exc

    return sorted(attributes, key=lambda item: item[0])


def _version_docs_url(major: str, attribute: str) -> str:
    if major == "2":
        return f"https://htmx.org/attributes/{attribute}/"
    return f"https://four.htmx.org/reference/attributes/{attribute}"


def build_catalog(v2_version: str, v4_version: str) -> dict[str, Any]:
    """Build a deterministic merged catalog from pinned HTMX 2 and 4 archives."""
    sources = {"2": v2_version, "4": v4_version}
    merged: dict[str, dict[str, Any]] = {}

    for major, release in sources.items():
        zip_url = f"https://github.com/bigskysoftware/htmx/archive/refs/tags/v{release}.zip"
        for name, description, _body in iter_attribute_docs(fetch_zip_content(zip_url)):
            if major == "2" and name in REMOVED_IN_HTMX_V2:
                continue
            entry = merged.setdefault(
                name,
                {
                    "name": name,
                    "description": description,
                    "versions": [],
                    "documentation": {},
                },
            )
            entry["versions"].append(major)
            entry["documentation"][major] = _version_docs_url(major, name)
            if major == "4":
                entry["description"] = description

    for name, entry in merged.items():
        if name in ATTRIBUTE_VALUES:
            value_data = ATTRIBUTE_VALUES[name]
            entry["values"] = [
                {"name": value_name, "description": value_description}
                for value_name, value_description in value_data["values"]
            ]
            if value_data.get("strict"):
                entry["strictValues"] = True
        if "4" in entry["versions"]:
            entry["modifiers"] = ["inherited"]
            if name in APPENDABLE_V4_ATTRIBUTES:
                entry["modifiers"].append("append")
        if name in DEPRECATED:
            entry["deprecated"] = DEPRECATED[name]

    return {
        "schemaVersion": 1,
        "generatedFrom": {"htmx2": v2_version, "htmx4": v4_version},
        "attributes": [merged[name] for name in sorted(merged)],
        "patterns": DYNAMIC_PATTERNS,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--htmx-v2-version", default=DEFAULT_HTMX_V2_VERSION)
    parser.add_argument("--htmx-v4-version", default=DEFAULT_HTMX_V4_VERSION)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_FILE)
    return parser.parse_args()


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    args = parse_args()
    catalog = build_catalog(args.htmx_v2_version, args.htmx_v4_version)
    args.output.write_text(json.dumps(catalog, indent=2) + "\n", encoding="utf-8")
    LOGGER.info("Wrote %s with %s attributes", args.output, len(catalog["attributes"]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
