import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { CatalogIndex, normalizeAttributeName, type CatalogData } from "../catalog.js";

const catalog = new CatalogIndex(
  JSON.parse(readFileSync(path.resolve(__dirname, "../../htmx.catalog.json"), "utf8")) as CatalogData,
);

test("catalog contains both pinned HTMX versions", () => {
  assert.deepEqual(catalog.data.generatedFrom, { htmx2: "2.0.10", htmx4: "4.0.0-beta5" });
  assert.equal(catalog.resolve("hx-get")?.versions.join(","), "2,4");
  assert.deepEqual(catalog.resolve("hx-status")?.versions, ["4"]);
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
});
