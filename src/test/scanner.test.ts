import assert from "node:assert/strict";
import test from "node:test";

import { scanDocument, tagAtOffset } from "../scanner.js";

test("scanner reads multiline HTMX attributes and Django expressions", () => {
  const scan = scanDocument(`<button\n  hx-get="{% url 'items' %}"\n  data-hx-target='#results'\n  hx-on::after-request="done()">Go</button>`);
  assert.deepEqual(
    scan.attributes.map((attribute) => [attribute.name, attribute.value]),
    [
      ["hx-get", "{% url 'items' %}"],
      ["data-hx-target", "#results"],
      ["hx-on::after-request", "done()"],
    ],
  );
});

test("scanner ignores comments, scripts, styles, and verbatim blocks", () => {
  const scan = scanDocument(`
<!-- <div hx-bad="x"> -->
<script>const template = '<div hx-script="x">';</script>
<style>.x[data-value="hx-style"] { color: red; }</style>
{% verbatim %}<div hx-verbatim="x">{% endverbatim %}
<div hx-get="/ok"></div>`);
  assert.deepEqual(scan.attributes.map((attribute) => attribute.name), ["hx-get"]);
});

test("scanner handles incomplete quoted values without leaving the tag", () => {
  const scan = scanDocument(`<div hx-trigger="keyup changed delay:300ms`);
  assert.equal(scan.attributes[0]?.name, "hx-trigger");
  assert.equal(scan.attributes[0]?.value, "keyup changed delay:300ms");
  assert.equal(scan.attributes[0]?.valueClosed, false);
});

test("tag lookup excludes the position after a closed tag", () => {
  const closed = scanDocument("<div>");
  const incomplete = scanDocument("<div");
  assert.equal(tagAtOffset(closed, 5), undefined);
  assert.equal(tagAtOffset(incomplete, 4)?.name, "div");
});

test("scanner finds same-file Django partial definitions and references", () => {
  const scan = scanDocument(`
{% partialdef card inline %}<article></article>{% endpartialdef %}
{% partial card %}
{% comment %}{% partial hidden %}{% endcomment %}`);
  assert.deepEqual(scan.partialDefinitions.map(({ name, inline }) => ({ name, inline })), [
    { name: "card", inline: true },
  ]);
  assert.deepEqual(scan.partialReferences.map(({ name }) => name), ["card"]);
});
