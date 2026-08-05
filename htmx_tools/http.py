"""Shared httpx2 client helpers."""

from __future__ import annotations

from typing import Any

import httpx2


def make_client(**kwargs: Any) -> httpx2.Client:
    """Return an httpx2 client; the single seam tests swap for a mocked transport."""
    return httpx2.Client(**kwargs)
