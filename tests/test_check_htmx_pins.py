"""Validate the HTMX pin freshness check without network access."""

from __future__ import annotations

import httpx2
import pytest

from htmx_tools import pins


def test_latest_v2_ignores_prereleases() -> None:
    latest = pins._latest_for_major(["2.0.10", "2.1.0-beta1"], "2")
    assert str(latest) == "2.0.10"


def test_fetch_tags_uses_github_token(monkeypatch: pytest.MonkeyPatch) -> None:
    captured_requests: list[httpx2.Request] = []

    def handler(request: httpx2.Request) -> httpx2.Response:
        captured_requests.append(request)
        return httpx2.Response(200, json=[{"name": "v2.0.10"}])

    monkeypatch.setenv("GITHUB_TOKEN", "test-token")
    headers = {"Authorization": "Bearer test-token"}
    client = httpx2.Client(transport=httpx2.MockTransport(handler), headers=headers)

    assert pins._fetch_tags(client=client) == ["2.0.10"]
    assert len(captured_requests) == 1
    assert captured_requests[0].headers["Authorization"] == "Bearer test-token"
