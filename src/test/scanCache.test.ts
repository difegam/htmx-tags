import assert from "node:assert/strict";
import test from "node:test";

import { clearScanCache, evictScan, getScan, type CacheableDocument } from "../scanCache.js";

class FakeDocument implements CacheableDocument {
  constructor(
    private readonly id: string,
    public version: number,
    private text: string,
  ) {}

  readonly uri = { toString: () => this.id };

  getText(): string {
    return this.text;
  }

  edit(text: string): void {
    this.text = text;
    this.version++;
  }
}

test("getScan reuses the cached scan while the version is unchanged", () => {
  clearScanCache();
  const document = new FakeDocument("file://a", 1, `<div hx-get="/a"></div>`);
  const first = getScan(document);
  const second = getScan(document);
  assert.equal(first, second);
});

test("getScan re-scans after the document version changes", () => {
  clearScanCache();
  const document = new FakeDocument("file://b", 1, `<div hx-get="/a"></div>`);
  const first = getScan(document);
  document.edit(`<div hx-post="/b"></div>`);
  const second = getScan(document);
  assert.notEqual(first, second);
  assert.deepEqual(
    second.attributes.map((attribute) => attribute.name),
    ["hx-post"],
  );
});

test("evictScan forces a fresh scan", () => {
  clearScanCache();
  const document = new FakeDocument("file://c", 1, `<div hx-get="/a"></div>`);
  const first = getScan(document);
  evictScan(document);
  const second = getScan(document);
  assert.notEqual(first, second);
});
