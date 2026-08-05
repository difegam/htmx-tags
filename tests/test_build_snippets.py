"""Tests for the generated Django HTMX snippet library."""

from __future__ import annotations

import json
import re
from pathlib import Path

import pytest

from htmx_tools import snippets as _snippets_module

ROOT = Path(__file__).resolve().parent.parent
EXPECTED_PREFIXES = [
    "htmx-get",
    "htmx-post",
    "htmx-delete",
    "htmx-search",
    "htmx-form-validation",
    "htmx-file-upload",
    "htmx-bulk-actions",
    "htmx-dependent-dropdown",
    "htmx-infinite",
    "htmx-poll",
    "htmx-lazy",
    "htmx-boost-nav",
    "htmx-progress",
    "htmx-click-to-edit",
    "htmx-table-row",
    "htmx-dialog",
    "htmx-tabs",
    "htmx-oob-swap",
    "htmx-toast",
    "partialdef",
    "partialdef-inline",
    "partial",
]
EXPECTED_CLASSIFICATIONS = {
    "common": {
        "htmx-get",
        "htmx-post",
        "htmx-delete",
        "htmx-search",
        "htmx-form-validation",
        "htmx-infinite",
        "htmx-lazy",
        "htmx-click-to-edit",
        "htmx-oob-swap",
    },
    "curated": {
        "htmx-file-upload",
        "htmx-bulk-actions",
        "htmx-dependent-dropdown",
        "htmx-poll",
        "htmx-boost-nav",
        "htmx-progress",
        "htmx-table-row",
        "htmx-dialog",
        "htmx-tabs",
        "htmx-toast",
    },
    "django-6": {"partialdef", "partialdef-inline", "partial"},
}


def _load_build_snippets_module():
    return _snippets_module


def _entry(**overrides):
    entry = {
        "name": "Safe GET",
        "prefix": "htmx-safe-get",
        "category": "Requests and forms",
        "classification": "common",
        "description": "Load safe content",
        "body": ["<button hx-get=\"{% url 'safe-view' %}\">Load</button>"],
        "usage": "The view returns HTML.",
    }
    entry.update(overrides)
    return entry


def test_committed_catalog_has_exact_expected_prefixes() -> None:
    module = _load_build_snippets_module()
    catalog = module.load_catalog()
    module.validate_catalog(catalog)
    assert [entry["prefix"] for entry in catalog] == EXPECTED_PREFIXES


def test_committed_catalog_has_expected_classifications_and_unique_bodies() -> None:
    module = _load_build_snippets_module()
    catalog = module.load_catalog()
    assert {
        classification: {
            entry["prefix"] for entry in catalog if entry["classification"] == classification
        }
        for classification in module.CLASSIFICATIONS
    } == EXPECTED_CLASSIFICATIONS
    assert len({tuple(entry["body"]) for entry in catalog}) == len(catalog)


def test_snippets_use_only_attributes_shared_by_htmx_2_and_4() -> None:
    module = _load_build_snippets_module()
    catalog = module.load_catalog()
    htmx_catalog = json.loads((ROOT / "htmx.catalog.json").read_text(encoding="utf-8"))
    attributes = {entry["name"]: entry for entry in htmx_catalog["attributes"]}
    used_attributes = {
        match.group(1)
        for entry in catalog
        for line in entry["body"]
        for match in re.finditer(r"\b(hx-[a-z0-9-]+)\s*=", line)
    }
    assert used_attributes
    assert {
        name: attributes.get(name, {}).get("versions")
        for name in used_attributes
        if attributes.get(name, {}).get("versions") != ["2", "4"]
    } == {}
    assert not {name for name in used_attributes if attributes[name].get("deprecated")}


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"description": ""}, "description must be a non-empty string"),
        ({"prefix": "not-an-htmx-prefix"}, "invalid prefix"),
        ({"category": "Unknown"}, "unknown category"),
        ({"classification": "Unknown"}, "unknown classification"),
        ({"body": []}, "body must be a non-empty array"),
        ({"extra": "value"}, "unexpected extra"),
    ],
)
def test_catalog_schema_is_validated(overrides: dict, message: str) -> None:
    module = _load_build_snippets_module()
    with pytest.raises(ValueError, match=message):
        module.validate_catalog([_entry(**overrides)])


def test_malformed_json_and_snippet_placeholders_are_rejected(tmp_path: Path) -> None:
    module = _load_build_snippets_module()
    source = tmp_path / "broken.json"
    source.write_text("{", encoding="utf-8")
    with pytest.raises(json.JSONDecodeError):
        module.load_catalog(source)
    with pytest.raises(ValueError, match="malformed or unsupported placeholder"):
        module.validate_catalog([_entry(body=["<div>${1:unfinished</div>"])])


def test_names_and_prefixes_must_be_unique() -> None:
    module = _load_build_snippets_module()
    with pytest.raises(ValueError, match="duplicate name"):
        module.validate_catalog([_entry(), _entry(prefix="htmx-second")])
    with pytest.raises(ValueError, match="duplicate prefix"):
        module.validate_catalog([_entry(), _entry(name="Second")])


def test_categories_must_keep_documented_order() -> None:
    module = _load_build_snippets_module()
    with pytest.raises(ValueError, match="category order is not stable"):
        module.validate_catalog(
            [
                _entry(category="Loading and navigation"),
                _entry(
                    name="Second",
                    prefix="htmx-second",
                    category="Requests and forms",
                ),
            ]
        )


def test_mutating_forms_require_csrf() -> None:
    module = _load_build_snippets_module()
    with pytest.raises(ValueError, match="mutating forms must include"):
        module.validate_catalog([_entry(body=['<form hx-post="/unsafe"></form>'])])

    module.validate_catalog(
        [
            _entry(
                body=[
                    '<form method="post" action="{% url \'safe-view\' %}"',
                    "      hx-post=\"{% url 'safe-view' %}\">",
                    "{% csrf_token %}",
                    "</form>",
                ]
            )
        ]
    )

    with pytest.raises(ValueError, match="POST method and action"):
        module.validate_catalog(
            [
                _entry(
                    body=[
                        "<form hx-post=\"{% url 'safe-view' %}\">",
                        "{% csrf_token %}",
                        "</form>",
                    ]
                )
            ]
        )
    with pytest.raises(ValueError, match="must use a CSRF-safe hx-post form"):
        module.validate_catalog(
            [
                _entry(
                    body=[
                        '<form method="post" action="/delete" hx-delete="/delete">',
                        "{% csrf_token %}",
                        "</form>",
                    ]
                )
            ]
        )
    with pytest.raises(ValueError, match="action and hx-post must match"):
        module.validate_catalog(
            [
                _entry(
                    body=[
                        '<form method="post" action="/first" hx-post="/second">',
                        "{% csrf_token %}",
                        "</form>",
                    ]
                )
            ]
        )


@pytest.mark.parametrize(
    ("body", "message"),
    [
        (["<script>alert(1)</script>"], "script elements"),
        (['<button onclick="submit()">Save</button>'], "inline event handlers"),
        (['<button hx-on:click="submit()">Save</button>'], "hx-on handlers"),
        (['<a href="javascript:alert(1)">Open</a>'], "javascript URLs"),
        (['<div hx-vals="js:{value: event.target.value}"></div>'], "evaluated js"),
        (['<iframe src="https://example.com/widget"></iframe>'], "remote executable"),
        (['<main hx-ext="preload"></main>'], "extension declarations"),
        (['<div hx-sse="connect:/events"></div>'], "SSE or WebSocket"),
        (['<div hx-ws="connect:/socket"></div>'], "SSE or WebSocket"),
    ],
)
def test_unsafe_snippet_constructs_are_rejected(body: list[str], message: str) -> None:
    module = _load_build_snippets_module()
    with pytest.raises(ValueError, match=message):
        module.validate_catalog([_entry(body=body)])


def test_generated_outputs_match_committed_files() -> None:
    module = _load_build_snippets_module()
    outputs = module.generated_outputs()
    assert outputs == module.generated_outputs()
    assert all(path.read_text(encoding="utf-8") == content for path, content in outputs.items())
    assert "${" not in outputs[module.DOCS_FILE]


def test_portable_pattern_regressions() -> None:
    module = _load_build_snippets_module()
    catalog = {entry["prefix"]: entry for entry in module.load_catalog()}

    search = "\n".join(catalog["htmx-search"]["body"])
    assert "input changed delay:" in search
    assert ", search" in search

    validation = "\n".join(catalog["htmx-form-validation"]["body"])
    assert 'hx-target="this"' in validation
    assert 'hx-swap="outerHTML"' in validation
    assert "HTTP 200" in catalog["htmx-form-validation"]["usage"]

    infinite = "\n".join(catalog["htmx-infinite"]["body"])
    assert "page_obj.has_next" in infinite
    assert 'hx-swap="outerHTML"' in infinite
    assert "afterend" not in infinite

    boost = catalog["htmx-boost-nav"]["body"]
    assert "hx-" not in boost[0]
    assert {
        "hx-boost",
        "hx-target",
        "hx-select",
        "hx-swap",
        "hx-push-url",
    } <= set(re.findall(r"\b(hx-[a-z0-9-]+)=", "\n".join(boost[1:4])))

    upload = "\n".join(catalog["htmx-file-upload"]["body"])
    assert 'method="post"' in upload
    assert upload.count("multipart/form-data") == 2
    assert "request.FILES" in catalog["htmx-file-upload"]["usage"]

    tabs = "\n".join(catalog["htmx-tabs"]["body"])
    assert 'hx-target="#${1:tabs}"' in tabs
    assert 'hx-swap="outerHTML"' in tabs


def test_core_django_contracts_are_portable() -> None:
    contracts = (ROOT / "docs" / "how-to" / "django-response-contracts.md").read_text(
        encoding="utf-8"
    )
    assert '@vary_on_headers("HX-Request")' in contracts
    assert 'request.headers.get("HX-Request")' in contracts
    assert "HTTP 200" in contracts
    assert "request.FILES" in contracts
    assert all(
        header in contracts for header in ("HX-Retarget", "HX-Reswap", "HX-Redirect", "HX-Trigger")
    )
    assert "HX-Trigger-After-Swap" in contracts
    assert "intentionally excluded" in contracts


def test_check_mode_reports_stale_files_without_writing(tmp_path: Path) -> None:
    module = _load_build_snippets_module()
    stale_file = tmp_path / "stale.txt"
    missing_file = tmp_path / "missing.txt"
    stale_file.write_text("old\n", encoding="utf-8")

    stale = module.sync_outputs({stale_file: "new\n", missing_file: "created\n"}, check=True)

    assert stale == [stale_file, missing_file]
    assert stale_file.read_text(encoding="utf-8") == "old\n"
    assert not missing_file.exists()


def test_write_mode_updates_only_stale_files(tmp_path: Path) -> None:
    module = _load_build_snippets_module()
    current_file = tmp_path / "current.txt"
    stale_file = tmp_path / "nested" / "stale.txt"
    current_file.write_text("current\n", encoding="utf-8")

    stale = module.sync_outputs({current_file: "current\n", stale_file: "new\n"}, check=False)

    assert stale == [stale_file]
    assert stale_file.read_text(encoding="utf-8") == "new\n"


def test_snippet_preview_unescapes_placeholder_braces() -> None:
    module = _load_build_snippets_module()
    body = ['<div hx-get="${1:?page={{ page_obj.next_page_number \\}\\}}">']
    assert module.snippet_preview(body) == '<div hx-get="?page={{ page_obj.next_page_number }}">'


def test_runtime_snippet_shape_contains_only_vscode_fields() -> None:
    data = json.loads((ROOT / "snippets" / "django-htmx.json").read_text(encoding="utf-8"))
    assert [entry["prefix"] for entry in data.values()] == EXPECTED_PREFIXES
    assert all(set(entry) == {"prefix", "description", "body"} for entry in data.values())
