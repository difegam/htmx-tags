"""Validate the runtime manifest and generated catalog."""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def test_runtime_provider_manifest() -> None:
    manifest = _read_json(ROOT / "package.json")
    assert "html" not in manifest["contributes"]
    assert manifest["main"] == "./out/extension.js"
    assert manifest["displayName"] == "HTMX Tags for Django"
    assert "onLanguage:html" in manifest["activationEvents"]
    assert "onLanguage:django-html" in manifest["activationEvents"]
    assert "onLanguage:python" in manifest["activationEvents"]
    assert "batisteo.vscode-django" in manifest["extensionDependencies"]


def test_public_configuration_defaults() -> None:
    manifest = _read_json(ROOT / "package.json")
    settings = manifest["contributes"]["configuration"]["properties"]
    assert settings["htmxTags.enableCompletion"]["default"] is True
    assert settings["htmxTags.enableHover"]["default"] is True
    assert settings["htmxTags.enableValidation"]["default"] is True
    assert settings["htmxTags.version"]["default"] == "compatible"
    assert settings["htmxTags.version"]["enum"] == ["compatible", "2", "4"]


def test_django_snippets_are_registered() -> None:
    manifest = _read_json(ROOT / "package.json")
    snippets = manifest["contributes"]["snippets"]
    assert snippets == [{"language": "django-html", "path": "./snippets/django-htmx.json"}]
    data = _read_json(ROOT / "snippets" / "django-htmx.json")
    assert {entry["prefix"] for entry in data.values()} >= {
        "htmx-post",
        "htmx-search",
        "partialdef",
        "partialdef-inline",
        "partial",
    }


def test_catalog_shape_and_version_union() -> None:
    catalog = _read_json(ROOT / "htmx.catalog.json")
    assert catalog["schemaVersion"] == 2
    assert catalog["generatedFrom"] == {"htmx2": "2.0.10", "htmx4": "4.0.0-beta5"}
    attributes = {entry["name"]: entry for entry in catalog["attributes"]}
    assert attributes["hx-get"]["versions"] == ["2", "4"]
    assert attributes["hx-status"]["versions"] == ["4"]
    assert "hx-sse" not in attributes
    assert "hx-ws" not in attributes
    assert not any(name.startswith("data-hx-") for name in attributes)
    assert attributes["hx-get"]["examples"]["4"].startswith("<button")
    assert attributes["hx-target"]["values"][1]["insertText"] == "closest ${1:selector}"
    assert "commands" not in _read_json(ROOT / "package.json")["contributes"]


def test_marketplace_assets_are_declared() -> None:
    manifest = _read_json(ROOT / "package.json")
    assert manifest["icon"] == "images/icon.png"
    assert manifest["galleryBanner"]["color"] == "#0C4B33"
