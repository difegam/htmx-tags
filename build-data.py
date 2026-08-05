#!/usr/bin/env python3
"""Generate the offline HTMX 2/4 catalog consumed by the VS Code extension."""

from __future__ import annotations

import argparse
import json
import logging
import re
import tomllib
import zipfile
from io import BytesIO
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import urlopen

LOGGER = logging.getLogger(__name__)
DEFAULT_HTMX_V2_VERSION = "2.0.10"
DEFAULT_HTMX_V4_VERSION = "4.0.0-beta6"
DEFAULT_OUTPUT_FILE = Path("htmx.catalog.json")
REMOVED_IN_HTMX_V2 = {"hx-sse", "hx-ws"}

_INTERNAL_LINK_PATTERN = re.compile(r"@/([^\s)\]\"']+)")
_FRONT_MATTER_PATTERN = re.compile(
    r"^\s*(?P<delimiter>\+\+\+|---)\s*\n(?P<header>.*?)\n(?P=delimiter)\s*(?:\n|$)",
    re.DOTALL,
)
_YAML_METADATA_PATTERN = re.compile(
    r'^\s*(title|description)\s*:\s*["\'](.*?)["\']\s*$', re.MULTILINE
)
_FENCED_CODE_PATTERN = re.compile(
    r"```(?:html|htm|django-html)?[^\n]*\n(?P<code>.*?)```",
    re.IGNORECASE | re.DOTALL,
)
_V2_CATEGORY_SECTION_PATTERN = re.compile(
    r"^## (?P<label>Core|Additional) Attribute Reference.*?(?=^## |\Z)",
    re.MULTILINE | re.DOTALL,
)
_V2_CATEGORY_ATTRIBUTE_PATTERN = re.compile(
    r"^\|\s*\[`(?P<name>hx-[^`]+)`\]\(",
    re.MULTILINE,
)
_V4_ATTRIBUTE_GROUPS_PATTERN = re.compile(
    r"export const ATTRIBUTE_GROUPS\s*=\s*\[(?P<groups>.*?)\];",
    re.DOTALL,
)
_V4_CATEGORY_PATTERN = re.compile(
    r"label:\s*['\"](?P<label>[^'\"]+)['\"]\s*,\s*"
    r"titles:\s*\[(?P<titles>[^]]*)\]",
    re.DOTALL,
)
_V4_CATEGORY_ATTRIBUTE_PATTERN = re.compile(r"['\"](?P<name>hx-[^'\"]+)['\"]")


def _value(
    name: str,
    description: str,
    *,
    insert_text: str | None = None,
    versions: list[str] | None = None,
    kind: str = "value",
    documentation: str | None = None,
) -> dict[str, Any]:
    value: dict[str, Any] = {"name": name, "description": description, "kind": kind}
    if insert_text is not None:
        value["insertText"] = insert_text
    if versions is not None:
        value["versions"] = versions
    if documentation is not None:
        value["documentation"] = documentation
    return value


ATTRIBUTE_VALUES: dict[str, dict[str, Any]] = {
    "hx-boost": {
        "strict": True,
        "values": [
            _value("true", "Enable boosted navigation"),
            _value("false", "Disable boosted navigation"),
        ],
    },
    "hx-encoding": {
        "strict": True,
        "values": [_value("multipart/form-data", "Use multipart form encoding for file uploads")],
    },
    "hx-method": {
        "strict": True,
        "values": [
            _value(method, f"Issue a {method.upper()} request", versions=["4"])
            for method in ("get", "post", "put", "patch", "delete")
        ],
    },
    "hx-swap": {
        "values": [
            _value("innerHTML", "Replace the target's contents", kind="strategy"),
            _value("outerHTML", "Replace the target element", kind="strategy"),
            _value("textContent", "Replace text without parsing HTML", kind="strategy"),
            _value("beforebegin", "Insert before the target", kind="strategy"),
            _value("afterbegin", "Insert before the target's first child", kind="strategy"),
            _value("beforeend", "Insert after the target's last child", kind="strategy"),
            _value("afterend", "Insert after the target", kind="strategy"),
            _value("delete", "Delete the target", kind="strategy"),
            _value("none", "Do not swap response content", kind="strategy"),
            _value("innerMorph", "Morph the target's contents", versions=["4"], kind="strategy"),
            _value("outerMorph", "Morph the target element", versions=["4"], kind="strategy"),
            _value("before", "Alias for beforebegin", versions=["4"], kind="strategy"),
            _value("after", "Alias for afterend", versions=["4"], kind="strategy"),
            _value("prepend", "Alias for afterbegin", versions=["4"], kind="strategy"),
            _value("append", "Alias for beforeend", versions=["4"], kind="strategy"),
            _value(
                "swap:",
                "Delay the swap after receiving a response",
                insert_text="swap:${1:500ms}",
                kind="modifier",
            ),
            _value(
                "settle:",
                "Delay the settle phase after swapping",
                insert_text="settle:${1:100ms}",
                kind="modifier",
            ),
            _value(
                "transition:",
                "Use a view transition for the swap",
                insert_text="transition:${1|true,false|}",
                kind="modifier",
            ),
            _value(
                "scroll:",
                "Scroll the target after swapping",
                insert_text="scroll:${1|top,bottom|}",
                kind="modifier",
            ),
            _value(
                "show:",
                "Show the target after swapping",
                insert_text="show:${1|top,bottom|}",
                kind="modifier",
            ),
            _value(
                "ignoreTitle:",
                "Ignore title elements in the response",
                insert_text="ignoreTitle:${1|true,false|}",
                kind="modifier",
            ),
            _value(
                "focus-scroll:",
                "Control scrolling to restored focus",
                insert_text="focus-scroll:${1|true,false|}",
                kind="modifier",
            ),
        ]
    },
    "hx-target": {
        "values": [
            _value("this", "Target the element itself"),
            _value(
                "closest",
                "Target the closest matching ancestor",
                insert_text="closest ${1:selector}",
            ),
            _value(
                "find", "Target the first matching descendant", insert_text="find ${1:selector}"
            ),
            _value("next", "Target the next sibling", insert_text="next${1: selector}"),
            _value("previous", "Target the previous sibling", insert_text="previous${1: selector}"),
            _value("host", "Target the shadow host", versions=["4"]),
            _value(
                "global:",
                "Target outside the current shadow root",
                insert_text="global:${1:selector}",
                versions=["4"],
            ),
        ]
    },
    "hx-trigger": {
        "values": [
            _value("click", "Trigger on click", kind="event"),
            _value("change", "Trigger when the value changes", kind="event"),
            _value("input", "Trigger when the input value changes", kind="event"),
            _value("keyup", "Trigger when a key is released", kind="event"),
            _value("submit", "Trigger when the form submits", kind="event"),
            _value("load", "Trigger when the element loads", kind="event"),
            _value("revealed", "Trigger when scrolled into view", kind="event"),
            _value("intersect", "Trigger when intersecting the viewport", kind="event"),
            _value("every", "Poll at an interval", insert_text="every ${1:1s}", kind="event"),
            _value("once", "Trigger only once", kind="modifier"),
            _value("changed", "Trigger only when the value changed", kind="modifier"),
            _value("delay:", "Delay the event", insert_text="delay:${1:500ms}", kind="modifier"),
            _value(
                "throttle:",
                "Throttle the event",
                insert_text="throttle:${1:500ms}",
                kind="modifier",
            ),
            _value(
                "from:",
                "Listen on another element",
                insert_text="from:${1:selector}",
                kind="modifier",
            ),
            _value(
                "target:",
                "Filter events by target",
                insert_text="target:${1:selector}",
                kind="modifier",
            ),
            _value("consume", "Stop parent HTMX triggers", kind="modifier"),
            _value(
                "queue:",
                "Choose how events queue during a request",
                insert_text="queue:${1|first,last,all,none|}",
                kind="modifier",
            ),
        ]
    },
    "hx-ext": {
        "values": [
            _value(
                "head-support",
                "Merge response head content",
                kind="extension",
                documentation="https://htmx.org/extensions/head-support/",
            ),
            _value(
                "preload",
                "Preload linked content for faster navigation",
                kind="extension",
                documentation="https://htmx.org/extensions/preload/",
            ),
            _value(
                "response-targets",
                "Target elements by HTTP response status",
                kind="extension",
                documentation="https://htmx.org/extensions/response-targets/",
            ),
            _value(
                "sse",
                "Add Server-Sent Events support",
                kind="extension",
                documentation="https://htmx.org/extensions/sse/",
            ),
            _value(
                "ws",
                "Add WebSocket support",
                kind="extension",
                documentation="https://htmx.org/extensions/ws/",
            ),
            _value(
                "idiomorph",
                "Use Idiomorph DOM morphing",
                kind="extension",
                documentation="https://github.com/bigskysoftware/idiomorph",
            ),
            _value(
                "json-enc",
                "Encode request parameters as JSON",
                kind="extension",
                documentation="https://github.com/bigskysoftware/htmx-extensions/tree/main/src/json-enc",
            ),
            _value(
                "morphdom-swap",
                "Use morphdom for response swaps",
                kind="extension",
                documentation="https://github.com/bigskysoftware/htmx-extensions/tree/main/src/morphdom-swap",
            ),
            _value(
                "alpine-morph",
                "Use Alpine's morph plugin for swaps",
                kind="extension",
                documentation="https://github.com/bigskysoftware/htmx-extensions/tree/main/src/alpine-morph",
            ),
            _value(
                "class-tools",
                "Manipulate classes declaratively",
                kind="extension",
                documentation="https://github.com/bigskysoftware/htmx-extensions/tree/main/src/class-tools",
            ),
            _value(
                "multi-swap",
                "Swap multiple response elements",
                kind="extension",
                documentation="https://github.com/bigskysoftware/htmx-extensions/tree/main/src/multi-swap",
            ),
            _value(
                "path-deps",
                "Refresh elements from path dependencies",
                kind="extension",
                documentation="https://github.com/bigskysoftware/htmx-extensions/tree/main/src/path-deps",
            ),
            _value(
                "remove-me",
                "Remove elements after a delay",
                kind="extension",
                documentation="https://github.com/bigskysoftware/htmx-extensions/tree/main/src/remove-me",
            ),
            _value(
                "loading-states",
                "Manage loading states with CSS classes",
                kind="extension",
                documentation="https://github.com/bigskysoftware/htmx-extensions/tree/main/src/loading-states",
            ),
            _value(
                "debug",
                "Log HTMX events for debugging",
                kind="extension",
                documentation="https://github.com/bigskysoftware/htmx-extensions/tree/main/src/debug",
            ),
            _value(
                "method-override",
                "Send HTTP method override headers",
                kind="extension",
                documentation="https://github.com/bigskysoftware/htmx-extensions/tree/main/src/method-override",
            ),
            _value(
                "client-side-templates",
                "Render responses with client-side templates",
                kind="extension",
                documentation="https://github.com/bigskysoftware/htmx-extensions/tree/main/src/client-side-templates",
            ),
        ]
    },
    "hx-sync": {
        "values": [
            _value("this:drop", "Drop this request while another is active", kind="strategy"),
            _value("this:abort", "Abort this request if another is active", kind="strategy"),
            _value("this:replace", "Replace the active request", kind="strategy"),
            _value("this:queue first", "Queue only the first request", kind="strategy"),
            _value("this:queue last", "Queue only the last request", kind="strategy"),
            _value("this:queue all", "Queue every request", kind="strategy"),
            _value(
                "closest form:abort",
                "Abort requests on the closest form",
                insert_text="closest ${1:form}:abort",
                kind="strategy",
            ),
            _value(
                "closest form:drop",
                "Drop requests while the closest form is active",
                insert_text="closest ${1:form}:drop",
                kind="strategy",
            ),
            _value(
                "closest form:replace",
                "Replace requests on the closest form",
                insert_text="closest ${1:form}:replace",
                kind="strategy",
            ),
        ]
    },
    "hx-params": {
        "values": [
            _value("*", "Include all parameters"),
            _value("none", "Include no parameters"),
            _value("not", "Exclude named parameters", insert_text="not ${1:param1,param2}"),
        ]
    },
    "hx-disinherit": {
        "values": [_value("*", "Disable inheritance for every HTMX attribute", kind="attribute")]
    },
    "hx-swap-oob": {
        "values": [
            _value("true", "Swap by matching the element id", kind="strategy"),
            _value(
                "innerHTML",
                "Replace the matching element's contents",
                insert_text="innerHTML${1::selector}",
                kind="strategy",
            ),
            _value(
                "outerHTML",
                "Replace the matching element",
                insert_text="outerHTML${1::selector}",
                kind="strategy",
            ),
            _value(
                "beforebegin",
                "Insert before the matching element",
                insert_text="beforebegin${1::selector}",
                kind="strategy",
            ),
            _value(
                "afterbegin",
                "Insert inside at the beginning",
                insert_text="afterbegin${1::selector}",
                kind="strategy",
            ),
            _value(
                "beforeend",
                "Insert inside at the end",
                insert_text="beforeend${1::selector}",
                kind="strategy",
            ),
            _value(
                "afterend",
                "Insert after the matching element",
                insert_text="afterend${1::selector}",
                kind="strategy",
            ),
            _value("delete", "Delete the matching element", kind="strategy"),
            _value("none", "Do not swap response content", kind="strategy"),
            _value(
                "innerMorph",
                "Morph the matching element's contents",
                insert_text="innerMorph${1::selector}",
                versions=["4"],
                kind="strategy",
            ),
            _value(
                "outerMorph",
                "Morph the matching element",
                insert_text="outerMorph${1::selector}",
                versions=["4"],
                kind="strategy",
            ),
            _value(
                "before",
                "Alias for beforebegin",
                insert_text="before${1::selector}",
                versions=["4"],
                kind="strategy",
            ),
            _value(
                "after",
                "Alias for afterend",
                insert_text="after${1::selector}",
                versions=["4"],
                kind="strategy",
            ),
            _value(
                "prepend",
                "Alias for afterbegin",
                insert_text="prepend${1::selector}",
                versions=["4"],
                kind="strategy",
            ),
            _value(
                "append",
                "Alias for beforeend",
                insert_text="append${1::selector}",
                versions=["4"],
                kind="strategy",
            ),
        ]
    },
}

CURATED_EXAMPLES: dict[str, str] = {
    "hx-get": '<button hx-get="/items" hx-target="#results">Load</button>',
    "hx-post": '<form hx-post="/items" hx-target="#results">\n  <button>Save</button>\n</form>',
    "hx-put": '<button hx-put="/items/42" hx-target="#item-42">Update</button>',
    "hx-patch": '<button hx-patch="/items/42" hx-target="#item-42">Patch</button>',
    "hx-delete": '<button hx-delete="/items/42" hx-confirm="Delete this item?">Delete</button>',
    "hx-method": '<button hx-method="post" hx-url="/items">Save</button>',
    "hx-boost": '<nav hx-boost="true"><a href="/account">Account</a></nav>',
    "hx-target": '<button hx-get="/items" hx-target="closest section">Refresh</button>',
    "hx-swap": '<section hx-get="/items" hx-swap="innerHTML swap:300ms"></section>',
    "hx-trigger": '<input hx-get="/search" hx-trigger="keyup changed delay:300ms">',
    "hx-ext": '<main hx-ext="preload,response-targets"></main>',
    "hx-sync": '<input hx-get="/search" hx-sync="closest form:abort">',
    "hx-params": '<button hx-post="/search" hx-params="not csrfmiddlewaretoken">Search</button>',
    "hx-disinherit": '<section hx-disinherit="hx-target hx-swap"></section>',
    "hx-swap-oob": '<aside id="notifications" hx-swap-oob="beforeend"></aside>',
}

APPENDABLE_V4_ATTRIBUTES = {"hx-headers", "hx-include", "hx-indicator", "hx-vals"}
DEPRECATED: dict[str, str] = {
    "hx-vars": "Deprecated in HTMX 2; use hx-vals instead.",
}

DYNAMIC_PATTERNS: list[dict[str, Any]] = [
    {
        "name": "hx-on:<event>",
        "pattern": r"^hx-on(?:::[a-z0-9_.:-]+|:[a-z0-9_.:-]+|--[a-z0-9_.-]+|-[a-z0-9_.-]+)$",
        "description": "Handle a DOM or HTMX event inline.",
        "versions": ["2", "4"],
        "documentation": {
            "2": "https://htmx.org/attributes/hx-on/",
            "4": "https://four.htmx.org/reference/attributes/hx-on",
        },
        "examples": {
            "2": "<button hx-on:click=\"this.classList.toggle('active')\">Toggle</button>",
            "4": "<button hx-on:click=\"this.classList.toggle('active')\">Toggle</button>",
        },
        "categories": {"2": "Core", "4": "Scripting"},
    },
    {
        "name": "hx-target-<status>",
        "pattern": r"^hx-target-(?:error|\*|[1-5](?:[0-9]{2}|[0-9][*x]|[*x]{1,2}))$",
        "description": "Target responses by HTTP status through the response-targets extension.",
        "versions": ["2"],
        "documentation": {"2": "https://htmx.org/extensions/response-targets/"},
        "examples": {"2": '<form hx-post="/items" hx-target-422="#errors"></form>'},
    },
    {
        "name": "hx-status:<status>",
        "pattern": r"^hx-status:[1-5](?:[0-9]{2}|[0-9]x|xx)$",
        "description": "Override HTMX 4 swap behavior for an HTTP status.",
        "versions": ["4"],
        "documentation": {"4": "https://four.htmx.org/reference/attributes/hx-status"},
        "examples": {"4": '<form hx-post="/items" hx-status:422="target:#errors"></form>'},
        "categories": {"4": "Advanced"},
    },
]


def _resolve_htmx_link(match: re.Match[str]) -> str:
    path = match.group(1)
    path_part, separator, fragment = path.partition("#")
    url_path = path_part.removesuffix(".md")
    anchor = f"#{fragment}" if separator else ""
    return f"https://htmx.org/{url_path}/{anchor}"


def resolve_htmx_links(text: str) -> str:
    """Replace HTMX 2's @/-prefixed documentation links with absolute URLs."""
    return _INTERNAL_LINK_PATTERN.sub(_resolve_htmx_link, text)


def fetch_zip_content(zip_url: str) -> bytes:
    """Fetch a ZIP archive over HTTPS."""
    parsed_url = urlparse(zip_url)
    if parsed_url.scheme != "https":
        raise ValueError(f"Invalid archive URL scheme '{parsed_url.scheme}'. Expected 'https'.")

    LOGGER.info("Downloading htmx docs archive: %s", zip_url)
    try:
        with urlopen(zip_url, timeout=30) as response:
            if response.status != 200:
                raise RuntimeError(f"Unexpected status code: {response.status}")
            return response.read()
    except HTTPError as exc:
        raise RuntimeError(f"Unable to download HTMX archive ({exc.code}): {zip_url}") from exc
    except URLError as exc:
        raise RuntimeError(f"Unable to reach HTMX archive: {zip_url} ({exc.reason})") from exc


def parse_document(markdown: str) -> tuple[dict[str, str], str]:
    """Return simple title/description front matter and the Markdown body."""
    match = _FRONT_MATTER_PATTERN.match(markdown)
    if match is None:
        return {}, markdown.strip()

    header = match.group("header")
    if match.group("delimiter") == "+++":
        try:
            parsed = tomllib.loads(header)
        except tomllib.TOMLDecodeError:
            parsed = {}
        metadata = {
            key: re.sub(r"\s+", " ", value).strip()
            for key in ("title", "description")
            if isinstance((value := parsed.get(key)), str)
        }
    else:
        metadata = {key: value for key, value in _YAML_METADATA_PATTERN.findall(header)}
    return metadata, markdown[match.end() :].strip()


def strip_front_matter(markdown: str) -> str:
    """Compatibility helper retained for downstream users and tests."""
    return parse_document(markdown)[1]


def _fallback_summary(body: str, attribute: str) -> str:
    text = re.sub(r"```.*?```", "", body, flags=re.DOTALL)
    text = re.sub(r"[#*_`\[\]]", "", text)
    paragraph = next((part.strip() for part in text.split("\n\n") if part.strip()), "")
    paragraph = re.sub(r"\s+", " ", paragraph)
    return paragraph[:240] or f"HTMX documentation for {attribute}."


def extract_html_example(body: str, attribute: str) -> str | None:
    """Return the first bounded HTML code fence that demonstrates the attribute."""
    for match in _FENCED_CODE_PATTERN.finditer(body):
        code = match.group("code").strip()
        if attribute in code and len(code) <= 1600:
            return code
    return None


def extract_attribute_categories(zip_bytes: bytes, major: str) -> dict[str, str]:
    """Extract the official attribute category map from an HTMX release archive."""
    if major not in {"2", "4"}:
        raise ValueError(f"Unsupported HTMX major version: {major}")

    suffix = "/www/content/reference.md" if major == "2" else "/www/src/content/reference/index.mdx"
    try:
        with zipfile.ZipFile(BytesIO(zip_bytes)) as zip_fd:
            path = next((name for name in zip_fd.namelist() if name.endswith(suffix)), None)
            if path is None:
                raise RuntimeError(f"missing HTMX {major} attribute reference source ({suffix})")
            source = zip_fd.read(path).decode()
    except zipfile.BadZipFile as exc:
        raise RuntimeError(
            f"invalid ZIP payload when parsing categories bundle ({len(zip_bytes)} bytes): {exc}"
        ) from exc

    categories: dict[str, str] = {}
    if major == "2":
        groups = (
            (match.group("label"), match.group(0))
            for match in _V2_CATEGORY_SECTION_PATTERN.finditer(source)
        )
        category_names = _V2_CATEGORY_ATTRIBUTE_PATTERN
    else:
        container = _V4_ATTRIBUTE_GROUPS_PATTERN.search(source)
        if container is None:
            raise RuntimeError("missing HTMX 4 ATTRIBUTE_GROUPS definition")
        groups = (
            (match.group("label"), match.group("titles"))
            for match in _V4_CATEGORY_PATTERN.finditer(container.group("groups"))
        )
        category_names = _V4_CATEGORY_ATTRIBUTE_PATTERN

    for label, body in groups:
        for match in category_names.finditer(body):
            name = match.group("name").removesuffix("*")
            previous = categories.setdefault(name, label)
            if previous != label:
                raise RuntimeError(
                    f"conflicting HTMX {major} categories for {name}: {previous}, {label}"
                )
    if not categories:
        raise RuntimeError(f"no HTMX {major} attribute categories found")
    return categories


def iter_attribute_docs(zip_bytes: bytes) -> list[tuple[str, str, str]]:
    """Extract canonical attribute name, summary, and body from either HTMX docs layout."""
    attributes: list[tuple[str, str, str]] = []
    try:
        with zipfile.ZipFile(BytesIO(zip_bytes)) as zip_fd:
            for zip_info in zip_fd.infolist():
                path = zip_info.filename
                is_v2 = path.endswith(".md") and "/www/content/attributes/" in path
                is_v4 = path.endswith(".md") and "/www/src/content/reference/01-attributes/" in path
                if not (is_v2 or is_v4) or "_index" in path or path.endswith("/index.md"):
                    continue

                metadata, body = parse_document(zip_fd.read(zip_info).decode())
                fallback_name = re.sub(r"^\d+-", "", Path(path).stem)
                attribute = metadata.get("title", fallback_name)
                if not attribute.startswith("hx-"):
                    continue
                description = metadata.get("description") or _fallback_summary(body, attribute)
                attributes.append((attribute, description, resolve_htmx_links(body)))
    except zipfile.BadZipFile as exc:
        raise RuntimeError(
            f"invalid ZIP payload when parsing attributes bundle ({len(zip_bytes)} bytes): {exc}"
        ) from exc

    return sorted(attributes, key=lambda item: item[0])


def _version_docs_url(major: str, attribute: str) -> str:
    if major == "2":
        return f"https://htmx.org/attributes/{attribute}/"
    return f"https://four.htmx.org/reference/attributes/{attribute}"


def build_catalog(v2_version: str, v4_version: str) -> dict[str, Any]:
    """Build a deterministic merged catalog from pinned HTMX 2 and 4 archives."""
    sources = {"2": v2_version, "4": v4_version}
    merged: dict[str, dict[str, Any]] = {}

    for major, release in sources.items():
        zip_url = f"https://github.com/bigskysoftware/htmx/archive/refs/tags/v{release}.zip"
        archive = fetch_zip_content(zip_url)
        categories = extract_attribute_categories(archive, major)
        for name, description, body in iter_attribute_docs(archive):
            if major == "2" and name in REMOVED_IN_HTMX_V2:
                continue
            category = categories.get(name)
            if category is None:
                raise RuntimeError(f"missing HTMX {major} category for {name}")
            entry = merged.setdefault(
                name,
                {
                    "name": name,
                    "description": description,
                    "versions": [],
                    "documentation": {},
                    "examples": {},
                    "categories": {},
                },
            )
            entry["versions"].append(major)
            entry["documentation"][major] = _version_docs_url(major, name)
            entry["categories"][major] = category
            example = extract_html_example(body, name)
            if example is not None:
                entry["examples"][major] = example
            if major == "4":
                entry["description"] = description

    for name, entry in merged.items():
        if name in ATTRIBUTE_VALUES:
            value_data = ATTRIBUTE_VALUES[name]
            entry["values"] = value_data["values"]
            if value_data.get("strict"):
                entry["strictValues"] = True
        if "4" in entry["versions"]:
            entry["modifiers"] = ["inherited"]
            if name in APPENDABLE_V4_ATTRIBUTES:
                entry["modifiers"].append("append")
        if name in DEPRECATED:
            entry["deprecated"] = DEPRECATED[name]
        if name in CURATED_EXAMPLES:
            entry["examples"] = {major: CURATED_EXAMPLES[name] for major in entry["versions"]}
        elif not entry["examples"]:
            del entry["examples"]

    return {
        "schemaVersion": 2,
        "generatedFrom": {"htmx2": v2_version, "htmx4": v4_version},
        "attributes": [merged[name] for name in sorted(merged)],
        "patterns": DYNAMIC_PATTERNS,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--htmx-v2-version", default=DEFAULT_HTMX_V2_VERSION)
    parser.add_argument("--htmx-v4-version", default=DEFAULT_HTMX_V4_VERSION)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_FILE)
    return parser.parse_args()


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    args = parse_args()
    catalog = build_catalog(args.htmx_v2_version, args.htmx_v4_version)
    args.output.write_text(json.dumps(catalog, indent=2) + "\n", encoding="utf-8")
    LOGGER.info("Wrote %s with %s attributes", args.output, len(catalog["attributes"]))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
