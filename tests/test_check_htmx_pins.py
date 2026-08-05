"""Validate the HTMX pin freshness check without network access."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent


def _load_module():
    path = ROOT / "scripts" / "check-htmx-pins.py"
    spec = importlib.util.spec_from_file_location("check_htmx_pins", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load {path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_latest_v2_ignores_prereleases() -> None:
    module = _load_module()
    latest = module._latest_for_major(["2.0.10", "2.1.0-beta1"], "2")
    assert str(latest) == "2.0.10"


def test_fetch_tags_uses_github_token(monkeypatch: pytest.MonkeyPatch) -> None:
    module = _load_module()

    class Response:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return None

        def read(self) -> bytes:
            return json.dumps([{"name": "v2.0.10"}]).encode()

    def urlopen(request, timeout):
        assert request.get_header("Authorization") == "Bearer test-token"
        assert timeout == module.REQUEST_TIMEOUT
        return Response()

    monkeypatch.setenv("GITHUB_TOKEN", "test-token")
    monkeypatch.setattr(module.urllib.request, "urlopen", urlopen)
    assert module._fetch_tags() == ["2.0.10"]
