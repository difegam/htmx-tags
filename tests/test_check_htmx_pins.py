"""Validate the HTMX pin freshness check without network access."""

from __future__ import annotations

from typing import Any

import httpx2
import pytest

from htmx_tools import pins


def test_latest_v2_ignores_prereleases() -> None:
    latest = pins._latest_for_major(["2.0.10", "2.1.0-beta1"], "2")
    assert str(latest) == "2.0.10"


def test_fetch_tags_uses_github_token(monkeypatch: pytest.MonkeyPatch) -> None:
    captured_requests: list[httpx2.Request] = []
    captured_headers: list[dict[str, str]] = []

    def handler(request: httpx2.Request) -> httpx2.Response:
        captured_requests.append(request)
        return httpx2.Response(200, json=[{"name": "v2.0.10"}])

    def fake_make_client(*, headers: dict[str, str], **kwargs: Any) -> httpx2.Client:
        captured_headers.append(headers)
        return httpx2.Client(transport=httpx2.MockTransport(handler), headers=headers, **kwargs)

    monkeypatch.setenv("GITHUB_TOKEN", "test-token")
    monkeypatch.setattr(pins, "make_client", fake_make_client)

    assert pins._fetch_tags() == ["2.0.10"]
    assert len(captured_requests) == 1
    assert captured_headers[0]["Authorization"] == "Bearer test-token"
    assert captured_requests[0].headers["Authorization"] == "Bearer test-token"
