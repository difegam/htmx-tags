import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { CatalogIndex, type CatalogData, type HtmxVersionMode } from "../catalog.js";
import { analyzeDocument } from "../diagnostics.js";
import { computeQuickFixes, editDistance, type DiagnosticLike } from "../quickfixes.js";
import { scanDocument } from "../scanner.js";

const catalog = new CatalogIndex(
  JSON.parse(readFileSync(path.resolve(__dirname, "../../htmx.catalog.json"), "utf8")) as CatalogData,
);

function fixesFor(
  text: string,
  languageId: string,
  mode: HtmxVersionMode = "compatible",
): ReturnType<typeof computeQuickFixes> {
  const scan = scanDocument(text);
  const diagnostics: DiagnosticLike[] = analyzeDocument(text, languageId, catalog, mode, scan).map(
    (issue) => ({ code: issue.code, message: issue.message, start: issue.start, end: issue.end }),
  );
  return computeQuickFixes(text, diagnostics, catalog, scan);
}

test("editDistance computes classic Levenshtein distance", () => {
  assert.equal(editDistance("hx-methd", "hx-method"), 1);
  assert.equal(editDistance("abc", "abc"), 0);
  assert.equal(editDistance("kitten", "sitting"), 3);
});

test("unknown attribute typo offers the nearest attribute", () => {
  const fixes = fixesFor(`<form hx-methd="post"></form>`, "html");
  const preferred = fixes.find((fix) => fix.isPreferred);
  assert.ok(preferred, "expected a preferred fix");
  assert.equal(preferred.title, "Replace with 'hx-method'");
  assert.deepEqual(preferred.edits[0].newText, "hx-method");
});

test("data-hx alias typo keeps the data- prefix", () => {
  const fixes = fixesFor(`<form data-hx-methd="post"></form>`, "html");
  assert.ok(fixes.some((fix) => fix.edits[0].newText === "data-hx-method"));
});

test("invalid strict value offers the allowed values", () => {
  const fixes = fixesFor(`<form hx-method="trace"></form>`, "html");
  const targets = fixes.map((fix) => fix.edits[0].newText);
  assert.ok(targets.includes("get"));
  assert.ok(targets.includes("post"));
});

test("deprecated attribute offers its documented successor", () => {
  const fixes = fixesFor(`<div hx-vars="a:1"></div>`, "html", "2");
  const preferred = fixes.find((fix) => fix.isPreferred);
  assert.ok(preferred, "expected a preferred fix");
  assert.equal(preferred.title, "Replace with 'hx-vals'");
  assert.equal(preferred.edits[0].newText, "hx-vals");
});

test("unknown Django partial offers a rename and a definition stub", () => {
  const text = `{% partialdef card %}{% endpartialdef %}{% partial car %}`;
  const fixes = fixesFor(text, "django-html");
  assert.ok(fixes.some((fix) => fix.edits[0].newText === "card"), "expected nearest-name rename");
  const create = fixes.find((fix) => fix.title.startsWith("Create "));
  assert.ok(create, "expected a create-partialdef fix");
  assert.equal(create.edits[0].start, text.length);
  assert.match(create.edits[0].newText, /\{% partialdef car %\}/);
});
