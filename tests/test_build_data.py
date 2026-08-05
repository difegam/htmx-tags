"""Unit tests for the deterministic HTMX 2/4 catalog generator."""

from __future__ import annotations

import importlib.util
import io
import json
import zipfile
from pathlib import Path
from urllib.error import URLError

import pytest


def _load_build_data_module():
    root = Path(__file__).resolve().parent.parent
    module_path = root / "build-data.py"
    spec = importlib.util.spec_from_file_location("build_data", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Unable to load build-data.py module")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _archive(files: dict[str, str]) -> bytes:
    output = io.BytesIO()
    with zipfile.ZipFile(output, "w") as archive:
        for name, content in files.items():
            archive.writestr(name, content)
    return output.getvalue()


def test_default_versions_are_pinned() -> None:
    module = _load_build_data_module()
    assert module.DEFAULT_HTMX_V2_VERSION == "2.0.10"
    assert module.DEFAULT_HTMX_V4_VERSION == "4.0.0-beta5"


def test_fetch_zip_content_wraps_url_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    module = _load_build_data_module()

    def _raise_url_error(_url: str, timeout: int | float | None = None):
        raise URLError("network blocked")

    monkeypatch.setattr(module, "urlopen", _raise_url_error)
    with pytest.raises(RuntimeError, match="Unable to reach HTMX archive"):
        module.fetch_zip_content("https://example.com/archive.zip")


def test_fetch_zip_content_rejects_non_https() -> None:
    module = _load_build_data_module()
    with pytest.raises(ValueError, match="Expected 'https'"):
        module.fetch_zip_content("http://example.com/archive.zip")


@pytest.mark.parametrize("delimiter", ["+++", "---"])
def test_parse_document_strips_supported_front_matter(delimiter: str) -> None:
    module = _load_build_data_module()
    separator = " = " if delimiter == "+++" else ": "
    markdown = (
        f'{delimiter}\ntitle{separator}"hx-get"\ndescription{separator}"Issues a GET request"\n'
        f"{delimiter}\n\nBody."
    )
    metadata, body = module.parse_document(markdown)
    assert metadata == {"title": "hx-get", "description": "Issues a GET request"}
    assert body == "Body."


def test_parse_document_preserves_malformed_front_matter() -> None:
    module = _load_build_data_module()
    markdown = '+++\ntitle = "hx-get"\nmissing closing delimiter'
    assert module.parse_document(markdown) == ({}, markdown)


def test_resolve_htmx_links_handles_paths_and_fragments() -> None:
    module = _load_build_data_module()
    text = "See [target](@/attributes/hx-target.md) and [parameters](@/docs.md#parameters)."
    result = module.resolve_htmx_links(text)
    assert "https://htmx.org/attributes/hx-target/" in result
    assert "https://htmx.org/docs/#parameters" in result
    assert "@/" not in result


def test_iter_attribute_docs_supports_both_repository_layouts() -> None:
    module = _load_build_data_module()
    payload = _archive(
        {
            "htmx/www/content/attributes/hx-get.md": (
                '+++\ntitle = "hx-get"\ndescription = "Issues GET"\n+++\nV2 body.'
            ),
            "htmx/www/src/content/reference/01-attributes/29-hx-status.md": (
                '---\ntitle: "hx-status"\ndescription: "Handles statuses"\n---\nV4 body.'
            ),
            "htmx/www/src/content/reference/01-attributes/index.md": "ignored",
        }
    )
    assert module.iter_attribute_docs(payload) == [
        ("hx-get", "Issues GET", "V2 body."),
        ("hx-status", "Handles statuses", "V4 body."),
    ]


def test_iter_attribute_docs_wraps_bad_zip_errors() -> None:
    module = _load_build_data_module()
    with pytest.raises(RuntimeError, match="invalid ZIP payload"):
        module.iter_attribute_docs(b"not a zip file")


def test_extract_html_example_is_bounded_and_attribute_specific() -> None:
    module = _load_build_data_module()
    body = """```html\n<div hx-post=\"/wrong\"></div>\n```\n```html\n<button hx-get=\"/items\">Load</button>\n```"""  # noqa: E501
    assert module.extract_html_example(body, "hx-get") == '<button hx-get="/items">Load</button>'
    assert module.extract_html_example("```html\n<div></div>\n```", "hx-get") is None


def test_extract_attribute_categories_supports_both_references() -> None:
    module = _load_build_data_module()
    payload = _archive(
        {
            "htmx/www/content/reference.md": """
## Core Attribute Reference {#attributes}
| [`hx-get`](@/attributes/hx-get.md) | GET |
| [`hx-on*`](@/attributes/hx-on.md) | Events |
## Additional Attribute Reference {#attributes-additional}
| [`hx-boost`](@/attributes/hx-boost.md) | Boost |
| [`hx-vars`](@/attributes/hx-vars.md) | Deprecated; use [`hx-on*`](@/attributes/hx-on.md) |
## CSS Class Reference {#classes}
""",
            "htmx/www/src/content/reference/index.mdx": """
export const ATTRIBUTE_GROUPS = [
  { label: 'Requests', titles: ['hx-get', 'hx-delete'] },
  { label: 'Enhancements', titles: ['hx-boost'] },
];
""",
        }
    )
    assert module.extract_attribute_categories(payload, "2") == {
        "hx-get": "Core",
        "hx-on": "Core",
        "hx-boost": "Additional",
        "hx-vars": "Additional",
    }
    assert module.extract_attribute_categories(payload, "4") == {
        "hx-get": "Requests",
        "hx-delete": "Requests",
        "hx-boost": "Enhancements",
    }


def test_build_catalog_merges_versions_and_metadata(monkeypatch: pytest.MonkeyPatch) -> None:
    module = _load_build_data_module()
    v2 = _archive(
        {
            "htmx/www/content/reference.md": """
## Core Attribute Reference
| [`hx-get`](@/attributes/hx-get.md) | GET |
## Additional Attribute Reference
""",
            "htmx/www/content/attributes/hx-get.md": (
                '+++\ntitle = "hx-get"\ndescription = "GET v2"\n+++\nBody.'
            ),
            "htmx/www/content/attributes/hx-ws.md": (
                '+++\ntitle = "hx-ws"\ndescription = "Removed"\n+++\nBody.'
            ),
        }
    )
    v4 = _archive(
        {
            "htmx/www/src/content/reference/index.mdx": """
export const ATTRIBUTE_GROUPS = [
  { label: 'Requests', titles: ['hx-get'] },
  { label: 'Advanced', titles: ['hx-status', 'hx-method'] },
];
""",
            "htmx/www/src/content/reference/01-attributes/01-hx-get.md": (
                '---\ntitle: "hx-get"\ndescription: "GET v4"\n---\nBody.'
            ),
            "htmx/www/src/content/reference/01-attributes/29-hx-status.md": (
                '---\ntitle: "hx-status"\ndescription: "Statuses"\n---\nBody.'
            ),
            "htmx/www/src/content/reference/01-attributes/31-hx-method.md": (
                '---\ntitle: "hx-method"\ndescription: "Method"\n---\nBody.'
            ),
        }
    )
    archives = iter([v2, v4])
    monkeypatch.setattr(module, "fetch_zip_content", lambda _url: next(archives))

    result = module.build_catalog("2.0.10", "4.0.0-beta5")
    entries = {entry["name"]: entry for entry in result["attributes"]}
    assert result["schemaVersion"] == 2
    assert result["generatedFrom"] == {"htmx2": "2.0.10", "htmx4": "4.0.0-beta5"}
    assert entries["hx-get"]["versions"] == ["2", "4"]
    assert entries["hx-get"]["categories"] == {"2": "Core", "4": "Requests"}
    assert entries["hx-get"]["description"] == "GET v4"
    assert entries["hx-status"]["versions"] == ["4"]
    assert entries["hx-method"]["strictValues"] is True
    assert entries["hx-get"]["examples"] == {
        "2": module.CURATED_EXAMPLES["hx-get"],
        "4": module.CURATED_EXAMPLES["hx-get"],
    }
    swap_values = {value["name"]: value for value in module.ATTRIBUTE_VALUES["hx-swap"]["values"]}
    assert swap_values["innerMorph"]["versions"] == ["4"]
    assert swap_values["swap:"]["insertText"] == "swap:${1:500ms}"
    oob_values = {
        value["name"]: value for value in module.ATTRIBUTE_VALUES["hx-swap-oob"]["values"]
    }
    assert oob_values["beforeend"]["insertText"] == "beforeend${1::selector}"
    assert oob_values["innerMorph"]["versions"] == ["4"]
    assert {"hx-ext", "hx-sync", "hx-params", "hx-disinherit", "hx-swap-oob"} <= set(
        module.ATTRIBUTE_VALUES
    )
    assert "hx-ws" not in entries
    assert {pattern["name"] for pattern in result["patterns"]} >= {
        "hx-on:<event>",
        "hx-target-<status>",
        "hx-status:<status>",
    }
    patterns = {pattern["name"]: pattern for pattern in result["patterns"]}
    assert patterns["hx-on:<event>"]["categories"] == {"2": "Core", "4": "Scripting"}
    assert "categories" not in patterns["hx-target-<status>"]


def test_build_catalog_rejects_missing_attribute_category(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    module = _load_build_data_module()
    archive = _archive(
        {
            "htmx/www/content/reference.md": """
## Core Attribute Reference
| [`hx-post`](@/attributes/hx-post.md) | POST |
## Additional Attribute Reference
""",
            "htmx/www/content/attributes/hx-get.md": (
                '+++\ntitle = "hx-get"\ndescription = "GET"\n+++\nBody.'
            ),
        }
    )
    monkeypatch.setattr(module, "fetch_zip_content", lambda _url: archive)
    with pytest.raises(RuntimeError, match="missing HTMX 2 category for hx-get"):
        module.build_catalog("2.0.10", "4.0.0-beta5")


def test_catalog_serialization_is_deterministic(monkeypatch: pytest.MonkeyPatch) -> None:
    module = _load_build_data_module()
    v2 = _archive(
        {
            "htmx/www/content/reference.md": """
## Core Attribute Reference
| [`hx-get`](@/attributes/hx-get.md) | GET |
## Additional Attribute Reference
""",
            "htmx/www/content/attributes/hx-get.md": (
                '+++\ntitle = "hx-get"\ndescription = "GET"\n+++\nBody.'
            ),
        }
    )
    v4 = _archive(
        {
            "htmx/www/src/content/reference/index.mdx": """
export const ATTRIBUTE_GROUPS = [
  { label: 'Requests', titles: ['hx-get'] },
];
""",
            "htmx/www/src/content/reference/01-attributes/01-hx-get.md": (
                '---\ntitle: "hx-get"\ndescription: "GET"\n---\nBody.'
            ),
        }
    )
    monkeypatch.setattr(
        module,
        "fetch_zip_content",
        lambda url: v2 if "v2.0.10" in url else v4,
    )
    first = json.dumps(module.build_catalog("2.0.10", "4.0.0-beta5"), indent=2)
    second = json.dumps(module.build_catalog("2.0.10", "4.0.0-beta5"), indent=2)
    assert first == second
