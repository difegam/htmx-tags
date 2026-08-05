import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { CatalogIndex, normalizeAttributeName, type CatalogData } from "../catalog.js";

const catalog = new CatalogIndex(
  JSON.parse(readFileSync(path.resolve(__dirname, "../../htmx.catalog.json"), "utf8")) as CatalogData,
);

test("catalog contains both pinned HTMX versions", () => {
  assert.equal(catalog.data.schemaVersion, 2);
  assert.deepEqual(catalog.data.generatedFrom, { htmx2: "2.0.10", htmx4: "4.0.0-beta6" });
  assert.equal(catalog.resolve("hx-get")?.versions.join(","), "2,4");
  assert.deepEqual(catalog.resolve("hx-get")?.categories, { "2": "Core", "4": "Requests" });
  assert.deepEqual(catalog.resolve("hx-boost")?.categories, { "2": "Additional", "4": "Enhancements" });
  assert.deepEqual(catalog.resolve("hx-delete")?.categories, { "2": "Additional", "4": "Requests" });
  assert.deepEqual(catalog.resolve("hx-status")?.versions, ["4"]);
});

test("schema v2 carries rich examples and specialized value metadata", () => {
  const swap = catalog.resolve("hx-swap")?.attribute;
  assert.match(swap?.examples?.["4"] ?? "", /hx-swap/);
  assert.equal(swap?.values?.find((value) => value.name === "innerMorph")?.versions?.[0], "4");
  assert.equal(swap?.values?.find((value) => value.name === "swap:")?.insertText, "swap:${1:500ms}");
  assert.ok(catalog.resolve("hx-ext")?.attribute?.values?.some((value) => value.documentation));
  assert.equal(catalog.resolve("hx-target")?.attribute?.values?.find((value) => value.name === "closest")?.insertText, "closest ${1:selector}");
});

test("data-hx aliases normalize without duplicate catalog entries", () => {
  assert.equal(normalizeAttributeName("data-hx-get"), "hx-get");
  assert.equal(catalog.resolve("data-hx-get")?.canonicalName, "hx-get");
  assert.equal(catalog.data.attributes.some((entry) => entry.name.startsWith("data-hx-")), false);
});

test("dynamic issue regressions resolve", () => {
  assert.equal(catalog.resolve("hx-target-4*")?.pattern?.name, "hx-target-<status>");
  assert.equal(catalog.resolve("data-hx-target-404")?.pattern?.name, "hx-target-<status>");
  assert.equal(catalog.resolve("hx-confirm:inherited")?.modifier, "inherited");
  assert.equal(catalog.resolve("hx-headers:append")?.modifier, "append");
  assert.equal(catalog.resolve("hx-status:5xx")?.pattern?.name, "hx-status:<status>");
  assert.deepEqual(catalog.resolve("hx-on:click")?.categories, { "2": "Core", "4": "Scripting" });
  assert.equal(catalog.resolve("hx-target-404")?.categories, undefined);
});
