#!/usr/bin/env python3
"""Validate and generate Django HTMX snippets and their documentation."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
SOURCE_FILE = ROOT / "snippets" / "django-htmx.source.json"
SNIPPET_FILE = ROOT / "snippets" / "django-htmx.json"
DOCS_FILE = ROOT / "docs" / "reference" / "snippets.md"

CATEGORIES = (
    "Requests and forms",
    "Loading and navigation",
    "Editing and UI",
    "Server responses",
    "Django partials",
)
REQUIRED_FIELDS = {"name", "prefix", "category", "description", "body", "usage"}
PREFIX_PATTERN = re.compile(r"^(?:htmx-[a-z0-9]+(?:-[a-z0-9]+)*|partialdef(?:-inline)?|partial)$")
MUTATING_ATTRIBUTE_PATTERN = re.compile(r"\bhx-(?:post|put|patch|delete)\s*=", re.I)
FORBIDDEN_PATTERNS = (
    ("script elements", re.compile(r"<script\b", re.I)),
    ("inline event handlers", re.compile(r"\son[a-z][\w:-]*\s*=", re.I)),
    ("hx-on handlers", re.compile(r"\bhx-on\b", re.I)),
    ("javascript URLs", re.compile(r"javascript\s*:", re.I)),
    ("evaluated js expressions", re.compile(r"\bjs\s*:", re.I)),
    (
        "remote executable resources",
        re.compile(
            r"<(?:script|iframe|embed)\b[^>]*\bsrc\s*=\s*[\"']https?://",
            re.I,
        ),
    ),
    ("excluded SSE or WebSocket attributes", re.compile(r"\bhx-(?:sse|ws)\b", re.I)),
)
PLACEHOLDER_PATTERN = re.compile(r"\$\{\d+:([^}]*)\}")
CHOICE_PATTERN = re.compile(r"\$\{\d+\|([^,|}]+)(?:,[^|}]*)?\|\}")
TABSTOP_PATTERN = re.compile(r"\$\d+")


def load_catalog(path: Path = SOURCE_FILE) -> list[dict[str, Any]]:
    """Load a catalog and require an array of object entries."""
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, list):
        raise ValueError("catalog root must be an array")
    if not all(isinstance(entry, dict) for entry in data):
        raise ValueError("every catalog entry must be an object")
    return data


def validate_catalog(catalog: list[dict[str, Any]]) -> None:
    """Reject malformed, unsafe, duplicate, or unstably ordered entries."""
    if not catalog:
        raise ValueError("catalog must contain at least one entry")

    names: set[str] = set()
    prefixes: set[str] = set()
    last_category = 0

    for index, entry in enumerate(catalog, start=1):
        label = entry.get("prefix") or entry.get("name") or f"entry {index}"
        fields = set(entry)
        if fields != REQUIRED_FIELDS:
            missing = sorted(REQUIRED_FIELDS - fields)
            extra = sorted(fields - REQUIRED_FIELDS)
            details = []
            if missing:
                details.append(f"missing {', '.join(missing)}")
            if extra:
                details.append(f"unexpected {', '.join(extra)}")
            raise ValueError(f"{label}: invalid fields ({'; '.join(details)})")

        for field in ("name", "prefix", "category", "description", "usage"):
            if not isinstance(entry[field], str) or not entry[field].strip():
                raise ValueError(f"{label}: {field} must be a non-empty string")

        name = entry["name"]
        prefix = entry["prefix"]
        category = entry["category"]
        body = entry["body"]

        if name in names:
            raise ValueError(f"{label}: duplicate name {name!r}")
        if prefix in prefixes:
            raise ValueError(f"{label}: duplicate prefix {prefix!r}")
        if not PREFIX_PATTERN.fullmatch(prefix):
            raise ValueError(f"{label}: invalid prefix {prefix!r}")
        if category not in CATEGORIES:
            raise ValueError(f"{label}: unknown category {category!r}")

        category_index = CATEGORIES.index(category)
        if category_index < last_category:
            raise ValueError(f"{label}: category order is not stable")
        last_category = category_index

        if (
            not isinstance(body, list)
            or not body
            or not all(isinstance(line, str) and line for line in body)
        ):
            raise ValueError(f"{label}: body must be a non-empty array of non-empty strings")

        markup = "\n".join(body)
        if MUTATING_ATTRIBUTE_PATTERN.search(markup) and (
            "<form" not in markup.lower() or "{% csrf_token %}" not in markup
        ):
            raise ValueError(f"{label}: mutating forms must include {{% csrf_token %}}")
        for description, pattern in FORBIDDEN_PATTERNS:
            if pattern.search(markup):
                raise ValueError(f"{label}: body contains {description}")
        if "${" in snippet_preview(body):
            raise ValueError(f"{label}: body contains a malformed or unsupported placeholder")

        names.add(name)
        prefixes.add(prefix)


def render_snippets(catalog: list[dict[str, Any]]) -> str:
    """Render the VS Code snippet contribution without documentation metadata."""
    snippets = {
        entry["name"]: {
            "prefix": entry["prefix"],
            "description": entry["description"],
            "body": entry["body"],
        }
        for entry in catalog
    }
    return json.dumps(snippets, ensure_ascii=False, indent=2) + "\n"


def snippet_preview(body: list[str]) -> str:
    """Replace VS Code tab stops with their readable defaults for documentation."""
    lines = []
    for line in body:
        line = CHOICE_PATTERN.sub(r"\1", line)
        line = PLACEHOLDER_PATTERN.sub(r"\1", line)
        line = line.replace("$0", "<!-- Add content here. -->")
        lines.append(TABSTOP_PATTERN.sub("", line).rstrip())
    return "\n".join(lines).rstrip()


def render_docs(catalog: list[dict[str, Any]]) -> str:
    """Render the browsable snippet and example reference."""
    lines = [
        "<!-- Generated by build-snippets.py; edit snippets/django-htmx.source.json. -->",
        "",
        "# Snippets and Examples",
        "",
        "The extension contributes secure Django-first HTMX patterns for `django-html` documents.",
        "Type a prefix to insert the snippet, then move through its editable placeholders.",
        "",
        "Mutating forms include Django's CSRF token. The examples use HTMX syntax shared by",
        "the supported HTMX 2 and HTMX 4 catalogs.",
        "",
        "## Prefixes",
        "",
        "| Prefix | Description |",
        "| --- | --- |",
    ]
    lines.extend(f"| `{entry['prefix']}` | {entry['description']} |" for entry in catalog)

    for category in CATEGORIES:
        lines.extend(("", f"## {category}"))
        for entry in catalog:
            if entry["category"] != category:
                continue
            lines.extend(
                (
                    "",
                    f"### `{entry['prefix']}`",
                    "",
                    entry["description"] + ".",
                    "",
                    "```django",
                    snippet_preview(entry["body"]),
                    "```",
                    "",
                    f"**Endpoint or context:** {entry['usage']}",
                )
            )

    return "\n".join(lines) + "\n"


def generated_outputs(
    source_path: Path = SOURCE_FILE,
    snippet_path: Path = SNIPPET_FILE,
    docs_path: Path = DOCS_FILE,
) -> dict[Path, str]:
    """Load and validate the source before rendering either output."""
    catalog = load_catalog(source_path)
    validate_catalog(catalog)
    return {
        snippet_path: render_snippets(catalog),
        docs_path: render_docs(catalog),
    }


def sync_outputs(outputs: dict[Path, str], *, check: bool) -> list[Path]:
    """Write changed outputs, or return stale paths without writing in check mode."""
    stale = [
        path
        for path, content in outputs.items()
        if not path.exists() or path.read_text(encoding="utf-8") != content
    ]
    if not check:
        for path in stale:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(outputs[path], encoding="utf-8")
    return stale


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check",
        action="store_true",
        help="report stale generated files without writing them",
    )
    args = parser.parse_args(argv)

    try:
        stale = sync_outputs(generated_outputs(), check=args.check)
    except (OSError, json.JSONDecodeError, ValueError) as error:
        print(f"{SOURCE_FILE}: {error}", file=sys.stderr)
        return 1

    if args.check and stale:
        for path in stale:
            print(f"stale generated file: {path.relative_to(ROOT)}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
