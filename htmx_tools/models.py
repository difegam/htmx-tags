"""Pydantic models for the htmx.catalog.json and snippet source schemas."""

from __future__ import annotations

import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, model_validator

# --- htmx.catalog.json -------------------------------------------------------


class CatalogValue(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    description: str
    kind: str = "value"
    insertText: str | None = None
    versions: list[str] | None = None
    documentation: str | None = None


class DynamicPattern(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    pattern: str
    description: str
    versions: list[str]
    documentation: dict[str, str]
    examples: dict[str, str] | None = None
    categories: dict[str, str] | None = None


class CatalogEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    description: str
    versions: list[str]
    documentation: dict[str, str]
    examples: dict[str, str] | None = None
    categories: dict[str, str]
    values: list[CatalogValue] | None = None
    strictValues: bool | None = None
    modifiers: list[str] | None = None
    deprecated: str | None = None


class Catalog(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schemaVersion: Literal[2] = 2
    generatedFrom: dict[str, str]
    attributes: list[CatalogEntry]
    patterns: list[DynamicPattern]


# --- snippets/django-htmx.source.json ----------------------------------------

CATEGORIES = (
    "Requests and forms",
    "Loading and navigation",
    "Editing and UI",
    "Server responses",
    "Django partials",
)
CLASSIFICATIONS = {
    "common": "Common",
    "curated": "Curated recipe",
    "django-6": "Django 6",
}
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
    ("extension declarations", re.compile(r"\bhx-ext\b", re.I)),
    ("excluded SSE or WebSocket attributes", re.compile(r"\bhx-(?:sse|ws)\b", re.I)),
)
PLACEHOLDER_PATTERN = re.compile(r"\$\{\d+:((?:\\.|[^\\}])*)\}")
CHOICE_PATTERN = re.compile(r"\$\{\d+\|([^,|}]+)(?:,[^|}]*)?\|\}")
TABSTOP_PATTERN = re.compile(r"\$\d+")


def snippet_preview(body: list[str]) -> str:
    """Replace VS Code tab stops with their readable defaults for documentation."""
    lines = []
    for line in body:
        line = CHOICE_PATTERN.sub(r"\1", line)
        line = PLACEHOLDER_PATTERN.sub(lambda match: re.sub(r"\\(.)", r"\1", match.group(1)), line)
        line = line.replace("$0", "<!-- Add content here. -->")
        lines.append(TABSTOP_PATTERN.sub("", line).rstrip())
    return "\n".join(lines).rstrip()


class SnippetEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    prefix: str
    category: str
    classification: str
    description: str
    body: list[str]
    usage: str

    @model_validator(mode="after")
    def _check_entry(self) -> SnippetEntry:
        label = self.prefix or self.name

        for field in ("name", "prefix", "description", "usage"):
            if not getattr(self, field).strip():
                raise ValueError(f"{label}: {field} must be a non-empty string")

        if not PREFIX_PATTERN.fullmatch(self.prefix):
            raise ValueError(f"{label}: invalid prefix {self.prefix!r}")

        if self.category not in CATEGORIES:
            raise ValueError(f"{label}: unknown category {self.category!r}")
        if self.classification not in CLASSIFICATIONS:
            raise ValueError(f"{label}: unknown classification {self.classification!r}")

        if (self.category == "Django partials") != (self.classification == "django-6"):
            raise ValueError(f"{label}: Django partials must use the django-6 classification")

        if not self.body or not all(isinstance(line, str) and line for line in self.body):
            raise ValueError(f"{label}: body must be a non-empty array of non-empty strings")

        markup = "\n".join(self.body)
        if MUTATING_ATTRIBUTE_PATTERN.search(markup):
            forms = re.findall(r"<form\b[^>]*>.*?</form>", markup, re.I | re.S)
            mutating_forms = [form for form in forms if MUTATING_ATTRIBUTE_PATTERN.search(form)]
            if not mutating_forms or any("{% csrf_token %}" not in form for form in mutating_forms):
                raise ValueError(f"{label}: mutating forms must include {{% csrf_token %}}")
            for form in mutating_forms:
                tag = form[: form.index(">") + 1]
                action = re.search(r"\baction\s*=\s*([\"'])(.*?)\1", tag, re.I)
                hx_post = re.search(r"\bhx-post\s*=\s*([\"'])(.*?)\1", tag, re.I)
                if re.search(r"\bhx-(?:put|patch|delete)\s*=", tag, re.I):
                    raise ValueError(f"{label}: Django mutations must use a CSRF-safe hx-post form")
                if not re.search(r"\bmethod\s*=\s*[\"']post[\"']", tag, re.I) or not action:
                    raise ValueError(f"{label}: mutating forms must include POST method and action")
                if not hx_post or action.group(2) != hx_post.group(2):
                    raise ValueError(f"{label}: action and hx-post must match")

        for description, pattern in FORBIDDEN_PATTERNS:
            if pattern.search(markup):
                raise ValueError(f"{label}: body contains {description}")

        if "${" in snippet_preview(self.body):
            raise ValueError(f"{label}: body contains a malformed or unsupported placeholder")

        return self


def validate_source(entries: list[SnippetEntry]) -> None:
    """Reject duplicate, or unstably ordered entries across the whole catalog."""
    if not entries:
        raise ValueError("catalog must contain at least one entry")

    names: set[str] = set()
    prefixes: set[str] = set()
    last_category = 0

    for entry in entries:
        label = entry.prefix or entry.name
        if entry.name in names:
            raise ValueError(f"{label}: duplicate name {entry.name!r}")
        if entry.prefix in prefixes:
            raise ValueError(f"{label}: duplicate prefix {entry.prefix!r}")

        category_index = CATEGORIES.index(entry.category)
        if category_index < last_category:
            raise ValueError(f"{label}: category order is not stable")
        last_category = category_index

        names.add(entry.name)
        prefixes.add(entry.prefix)
