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
    assert manifest["main"] == "./dist/extension.js"
    assert manifest["scripts"]["vscode:prepublish"] == "npm run check-types && npm run bundle"
    assert manifest["scripts"]["check-types"].endswith("--noEmit --incremental false")
    assert manifest["displayName"] == "HTMX Tags for Django"
    assert "onLanguage:html" in manifest["activationEvents"]
    assert "onLanguage:django-html" in manifest["activationEvents"]
    assert "onLanguage:python" in manifest["activationEvents"]
    assert "batisteo.vscode-django" in manifest["extensionDependencies"]


def test_f5_launch_keeps_the_django_dependency_enabled() -> None:
    launch = _read_json(ROOT / ".vscode" / "launch.json")
    args = launch["configurations"][0]["args"]
    assert "--disable-extensions" not in args
    assert not any(argument.startswith("--install-extension") for argument in args)
    assert "--extensionDevelopmentPath=${workspaceFolder}" in args


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


def test_snippet_build_sources_are_excluded_from_vsix() -> None:
    ignored = (ROOT / ".vscodeignore").read_text(encoding="utf-8").splitlines()
    assert "build-snippets.py" in ignored
    assert "snippets/*.source.json" in ignored


def test_unbundled_build_output_is_excluded_from_vsix() -> None:
    ignored = (ROOT / ".vscodeignore").read_text(encoding="utf-8").splitlines()
    assert "out/**" in ignored
    assert "src/**" in ignored
    assert "htmx_tools/**" in ignored
    assert "esbuild.js" in ignored


def test_catalog_shape_and_version_union() -> None:
    catalog = _read_json(ROOT / "htmx.catalog.json")
    assert catalog["schemaVersion"] == 2
    assert catalog["generatedFrom"] == {"htmx2": "2.0.10", "htmx4": "4.0.0-beta6"}
    attributes = {entry["name"]: entry for entry in catalog["attributes"]}
    assert attributes["hx-get"]["versions"] == ["2", "4"]
    assert attributes["hx-get"]["categories"] == {"2": "Core", "4": "Requests"}
    assert attributes["hx-boost"]["categories"] == {
        "2": "Additional",
        "4": "Enhancements",
    }
    assert attributes["hx-delete"]["categories"] == {
        "2": "Additional",
        "4": "Requests",
    }
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
