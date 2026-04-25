"""Validation tests for extension metadata and HTML custom data."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
PACKAGE_JSON_PATH = ROOT / "package.json"
CUSTOM_DATA_PATH = ROOT / "html.htmx-data.json"


def _read_json(path: Path) -> dict:
    """
    Read and parse a JSON file from the given filesystem path.
    
    Parameters:
        path (Path): Filesystem path to the JSON file to read.
    
    Returns:
        dict: The parsed JSON object.
    """
    return json.loads(path.read_text(encoding="utf-8"))


def test_html_custom_data_is_registered() -> None:
    manifest = _read_json(PACKAGE_JSON_PATH)
    custom_data = manifest["contributes"]["html"]["customData"]
    assert "./html.htmx-data.json" in custom_data


def test_django_support_is_declared() -> None:
    """
    Verify the extension declares Django support in its package manifest.
    
    Checks that the package manifest registers the Django HTML language activation event "onLanguage:django-html" and lists "batisteo.vscode-django" among its extension dependencies.
    """
    manifest = _read_json(PACKAGE_JSON_PATH)
    activation_events: list[str] = manifest["activationEvents"]
    dependencies: list[str] = manifest["extensionDependencies"]

    assert "onLanguage:django-html" in activation_events
    assert "batisteo.vscode-django" in dependencies


def test_custom_data_schema_shape() -> None:
    data = _read_json(CUSTOM_DATA_PATH)
    assert data["version"] == 1.1
    assert isinstance(data["globalAttributes"], list)
    assert data["globalAttributes"], "globalAttributes should not be empty"


def test_references_use_correct_spelling() -> None:
    """
    Validate that every global attribute's first reference is titled "Official documentation".
    
    This test loads the HTML custom data and asserts for each entry in `globalAttributes` that
    `attribute["references"][0]["name"]` equals "Official documentation".
    """
    data = _read_json(CUSTOM_DATA_PATH)
    for attribute in data["globalAttributes"]:
        assert attribute["references"][0]["name"] == "Official documentation"


def test_htmx_2_removed_attributes_are_excluded() -> None:
    """
    Verify that HTMX 2 attributes removed from the specification are not present in the custom data.
    
    Asserts that "hx-sse" and "hx-ws" do not appear among the file's global attribute names.
    """
    data = _read_json(CUSTOM_DATA_PATH)
    attribute_names = {attribute["name"] for attribute in data["globalAttributes"]}

    assert "hx-sse" not in attribute_names
    assert "hx-ws" not in attribute_names


def test_htmx_2_hx_on_wildcards_are_present() -> None:
    """
    Check that HTMX v2 wildcard attributes "hx-on:*" and "hx-on::*" are present in the custom HTML data's globalAttributes.
    
    Asserts that the attribute names defined in html.htmx-data.json include "hx-on:*" and "hx-on::*".
    """
    data = _read_json(CUSTOM_DATA_PATH)
    attribute_names = {attribute["name"] for attribute in data["globalAttributes"]}

    assert "hx-on:*" in attribute_names
    assert "hx-on::*" in attribute_names
