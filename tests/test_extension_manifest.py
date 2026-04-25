"""Validation tests for extension metadata and HTML custom data."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PACKAGE_JSON_PATH = ROOT / "package.json"
CUSTOM_DATA_PATH = ROOT / "html.htmx-data.json"


def _read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def test_html_custom_data_is_registered() -> None:
    manifest = _read_json(PACKAGE_JSON_PATH)
    custom_data = manifest["contributes"]["html"]["customData"]
    assert "./html.htmx-data.json" in custom_data


def test_django_support_is_declared() -> None:
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
    data = _read_json(CUSTOM_DATA_PATH)
    for attribute in data["globalAttributes"]:
        assert attribute["references"][0]["name"] == "Official documentation"


def test_htmx_2_removed_attributes_are_excluded() -> None:
    data = _read_json(CUSTOM_DATA_PATH)
    attribute_names = {attribute["name"] for attribute in data["globalAttributes"]}

    assert "hx-sse" not in attribute_names
    assert "hx-ws" not in attribute_names


def test_htmx_2_hx_on_wildcards_are_present() -> None:
    data = _read_json(CUSTOM_DATA_PATH)
    attribute_names = {attribute["name"] for attribute in data["globalAttributes"]}

    assert "hx-on:*" in attribute_names
    assert "hx-on::*" in attribute_names
