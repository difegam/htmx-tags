#!/usr/bin/env python3
"""Fail CI when the pinned HTMX tags in `build-data.py` drift from upstream.

Imports the pinned `DEFAULT_HTMX_V2_VERSION` and `DEFAULT_HTMX_V4_VERSION`
constants from `build-data.py` (same loader trick as `tests/test_build_data.py`)
and compares them with the public GitHub releases API for
`bigskysoftware/htmx`. Exits non-zero when:

  * the pinned tag no longer exists upstream (renamed or removed), or
  * a newer same-major stable release exists for HTMX 2, or
  * any newer HTMX 4 release (beta or stable) exists.

Keeping the catalog pinned is intentional, but a stale pin ships an outdated
offline catalog silently. This guard makes drift loud so a contributor can
bump the pin, regenerate the catalog, and commit both together.
"""

from __future__ import annotations

import importlib.util
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

from packaging.version import InvalidVersion, Version

GITHUB_API = "https://api.github.com/repos/bigskysoftware/htmx/tags"
MAX_PAGES = 5
REQUEST_TIMEOUT = 20
USER_AGENT = "htmx-tags-pin-check"


def _load_pinned_versions() -> tuple[str, str]:
    root = Path(__file__).resolve().parent.parent
    module_path = root / "build-data.py"
    spec = importlib.util.spec_from_file_location("build_data", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load {module_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.DEFAULT_HTMX_V2_VERSION, module.DEFAULT_HTMX_V4_VERSION


def _fetch_tags() -> list[str]:
    """Return every git tag name on the upstream htmx repo (without leading ``v``).

    Uses the ``/tags`` endpoint rather than ``/releases``: many older htmx tags
    (e.g. the HTMX 2 patch releases) exist as git tags but never had a release
    object created for them, so ``/releases`` would falsely flag them as missing.
    """
    tags: list[str] = []
    for page in range(1, MAX_PAGES + 1):
        url = f"{GITHUB_API}?per_page=100&page={page}"
        headers = {"User-Agent": USER_AGENT, "Accept": "application/vnd.github+json"}
        if token := os.environ.get("GITHUB_TOKEN"):
            headers["Authorization"] = f"Bearer {token}"
        request = urllib.request.Request(  # noqa: S310 - trusted github.com endpoint
            url, headers=headers
        )
        try:
            with urllib.request.urlopen(request, timeout=REQUEST_TIMEOUT) as response:  # noqa: S310
                payload = json.loads(response.read().decode("utf-8"))
        except (urllib.error.URLError, TimeoutError) as exc:
            raise RuntimeError(f"Unable to reach GitHub tags API: {exc}") from exc
        if not isinstance(payload, list) or not payload:
            break
        for entry in payload:
            tag = entry.get("name") if isinstance(entry, dict) else None
            if isinstance(tag, str) and tag:
                tags.append(tag[1:] if tag.startswith("v") else tag)
        if len(payload) < 100:
            break
    return tags


def _coerce(value: str, label: str) -> Version:
    try:
        return Version(value)
    except InvalidVersion as exc:
        raise RuntimeError(f"Pinned {label} version is not parseable: {value!r} ({exc})") from exc


def _latest_for_major(tags: list[str], major: str) -> Version | None:
    candidates: list[Version] = []
    for tag in tags:
        if not tag.startswith(f"{major}."):
            continue
        try:
            version = Version(tag)
        except InvalidVersion:
            continue
        if major == "2" and version.is_prerelease:
            continue
        candidates.append(version)
    return max(candidates) if candidates else None


def main() -> int:
    pinned_v2_raw, pinned_v4_raw = _load_pinned_versions()
    pinned_v2 = _coerce(pinned_v2_raw, "HTMX 2")
    pinned_v4 = _coerce(pinned_v4_raw, "HTMX 4")

    tags = _fetch_tags()
    if not tags:
        raise RuntimeError(
            "GitHub returned no tags; cannot verify pin freshness. "
            "Check the API rate limit or the bigskysoftware/htmx repository."
        )

    failures: list[str] = []
    if pinned_v2_raw not in tags:
        failures.append(
            f"Pinned HTMX 2 tag {pinned_v2_raw!r} no longer exists upstream. "
            "Regenerate against the current release tag."
        )
    if pinned_v4_raw not in tags:
        failures.append(
            f"Pinned HTMX 4 tag {pinned_v4_raw!r} no longer exists upstream. "
            "Regenerate against the current release tag."
        )

    latest_v2 = _latest_for_major(tags, "2")
    if latest_v2 is not None and latest_v2 > pinned_v2:
        failures.append(
            f"HTMX 2 stable release newer than pin: latest={latest_v2}, pinned={pinned_v2}. "
            "Bump DEFAULT_HTMX_V2_VERSION in build-data.py, regenerate the catalog, commit both."
        )

    latest_v4 = _latest_for_major(tags, "4")
    if latest_v4 is not None and latest_v4 > pinned_v4:
        failures.append(
            f"HTMX 4 release newer than pin: latest={latest_v4}, pinned={pinned_v4}. "
            "Bump DEFAULT_HTMX_V4_VERSION in build-data.py, regenerate the catalog, commit both."
        )

    if not failures:
        print(
            f"HTMX pins current: 2={pinned_v2}, 4={pinned_v4}; latest upstream: "
            f"2={latest_v2 or 'none'}, 4={latest_v4 or 'none'}"
        )
        return 0

    for failure in failures:
        print(f"::error::{failure}", file=sys.stderr)
    print(
        "\nHTMX pin staleness detected. Fix:\n"
        "  1. Edit build-data.py DEFAULT_HTMX_V*_VERSION.\n"
        "  2. npm run build-data\n"
        "  3. git add htmx.catalog.json build-data.py && git commit\n",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":  # pragma: no cover - CLI entry
    raise SystemExit(main())
