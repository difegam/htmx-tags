"""Tests for the generated Django HTMX snippet library."""

from __future__ import annotations

import importlib.util
import json
import re
from pathlib import Path

import pytest

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
    "htmx-modal",
    "htmx-tabs",
    "htmx-oob-swap",
    "htmx-toast",
    "partialdef",
    "partialdef-inline",
    "partial",
]


def _load_build_snippets_module():
    module_path = ROOT / "build-snippets.py"
    spec = importlib.util.spec_from_file_location("build_snippets", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Unable to load build-snippets.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _entry(**overrides):
    entry = {
        "name": "Safe GET",
        "prefix": "htmx-safe-get",
        "category": "Requests and forms",
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


def test_snippets_use_only_attributes_shared_by_htmx_2_and_4() -> None:
    module = _load_build_snippets_module()
    catalog = module.load_catalog()
    htmx_catalog = json.loads((ROOT / "htmx.catalog.json").read_text(encoding="utf-8"))
    versions = {entry["name"]: entry["versions"] for entry in htmx_catalog["attributes"]}
    used_attributes = {
        match.group(1)
        for entry in catalog
        for line in entry["body"]
        for match in re.finditer(r"\b(hx-[a-z0-9-]+)\s*=", line)
    }
    assert used_attributes
    assert {
        name: versions.get(name) for name in used_attributes if versions.get(name) != ["2", "4"]
    } == {}


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"description": ""}, "description must be a non-empty string"),
        ({"prefix": "not-an-htmx-prefix"}, "invalid prefix"),
        ({"category": "Unknown"}, "unknown category"),
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
                    "<form hx-post=\"{% url 'safe-view' %}\">",
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


def test_runtime_snippet_shape_contains_only_vscode_fields() -> None:
    data = json.loads((ROOT / "snippets" / "django-htmx.json").read_text(encoding="utf-8"))
    assert [entry["prefix"] for entry in data.values()] == EXPECTED_PREFIXES
    assert all(set(entry) == {"prefix", "description", "body"} for entry in data.values())
