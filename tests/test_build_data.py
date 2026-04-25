"""Unit tests for build-data.py helper functions."""

from __future__ import annotations

import importlib.util
from pathlib import Path
from urllib.error import URLError

import pytest


def _load_build_data_module():
    """
    Load the repository's top-level build-data.py as an importable module.
    
    Attempts to locate and execute build-data.py from the repository root and returns the loaded module object.
    
    Returns:
        module: The imported build-data module.
    
    Raises:
        RuntimeError: If the import spec or loader cannot be created for build-data.py.
    """
    root = Path(__file__).resolve().parent.parent
    module_path = root / "build-data.py"
    spec = importlib.util.spec_from_file_location("build_data", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Unable to load build-data.py module")

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_default_htmx_version_is_latest_target() -> None:
    module = _load_build_data_module()
    assert module.DEFAULT_HTMX_VERSION == "2.0.9"


def test_fetch_zip_content_wraps_url_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    module = _load_build_data_module()

    def _raise_url_error(_url: str, timeout: int | float | None = None):
        """
        Simulate a network failure for a given URL by always raising a URLError.
        
        Parameters:
            _url (str): The URL that would have been requested (unused).
        
        Raises:
            URLError: Always raised with the message "network blocked".
        """
        raise URLError("network blocked")

    monkeypatch.setattr(module, "urlopen", _raise_url_error)

    with pytest.raises(RuntimeError, match="Unable to reach HTMX archive"):
        module.fetch_zip_content("https://example.com/archive.zip")


def test_strip_front_matter_removes_leading_toml_block() -> None:
    module = _load_build_data_module()

    markdown = """

+++
title = "hx-get"
description = "Docs"
+++

# hx-get
Fetch content.
"""

    assert module.strip_front_matter(markdown) == "# hx-get\nFetch content."


def test_strip_front_matter_preserves_inline_plus_sequences() -> None:
    module = _load_build_data_module()

    markdown = "A literal +++ marker inside content should stay untouched."

    assert module.strip_front_matter(markdown) == markdown


def test_strip_front_matter_ignores_malformed_delimiters() -> None:
    module = _load_build_data_module()

    markdown = """+++
title = "hx-get"
This is not a closing delimiter.
"""

    assert module.strip_front_matter(markdown) == markdown.strip()


def test_iter_attribute_docs_wraps_bad_zip_errors() -> None:
    module = _load_build_data_module()

    with pytest.raises(
        RuntimeError,
        match=r"invalid ZIP payload when parsing attributes bundle \(14 bytes\):"
        r" File is not a zip file",
    ):
        module.iter_attribute_docs(b"not a zip file")


def test_apply_htmx_v2_adjustments_removes_old_extensions_and_adds_hx_on() -> None:
    module = _load_build_data_module()

    payload = {
        "globalAttributes": [
            {
                "name": "hx-get",
                "references": [
                    {"name": "Official documentation", "url": "https://htmx.org/attributes/hx-get/"}
                ],
            },
            {
                "name": "hx-sse",
                "references": [
                    {"name": "Official documentation", "url": "https://htmx.org/attributes/hx-sse/"}
                ],
            },
            {
                "name": "hx-ws",
                "references": [
                    {"name": "Official documentation", "url": "https://htmx.org/attributes/hx-ws/"}
                ],
            },
        ]
    }

    adjusted = module.apply_htmx_v2_adjustments(payload)
    names = {entry["name"] for entry in adjusted["globalAttributes"]}

    assert "hx-sse" not in names
    assert "hx-ws" not in names
    assert "hx-on:*" in names
    assert "hx-on::*" in names


def test_build_payload_v1_skips_v2_adjustments(monkeypatch: pytest.MonkeyPatch) -> None:
    module = _load_build_data_module()

    monkeypatch.setattr(module, "fetch_zip_content", lambda _url: b"")
    monkeypatch.setattr(
        module,
        "iter_attribute_docs",
        lambda _bytes: [("hx-get", "doc"), ("hx-sse", "doc"), ("hx-ws", "doc")],
    )

    result = module.build_payload("1.9.12")
    names = {entry["name"] for entry in result["globalAttributes"]}

    assert "hx-sse" in names
    assert "hx-ws" in names
    assert "hx-on:*" not in names
    assert "hx-on::*" not in names


def test_build_payload_v2_applies_v2_adjustments(monkeypatch: pytest.MonkeyPatch) -> None:
    module = _load_build_data_module()

    monkeypatch.setattr(module, "fetch_zip_content", lambda _url: b"")
    monkeypatch.setattr(
        module,
        "iter_attribute_docs",
        lambda _bytes: [("hx-get", "doc"), ("hx-sse", "doc"), ("hx-ws", "doc")],
    )

    result = module.build_payload("2.0.0")
    names = {entry["name"] for entry in result["globalAttributes"]}

    assert "hx-sse" not in names
    assert "hx-ws" not in names
    assert "hx-on:*" in names
    assert "hx-on::*" in names
