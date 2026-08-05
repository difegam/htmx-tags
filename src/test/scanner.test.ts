import assert from "node:assert/strict";
import test from "node:test";

import {
  partialSpansByName,
  scanDocument,
  scanTemplatePartialReferences,
  tagAtOffset,
  templatePartialReferenceAtOffset,
} from "../scanner.js";

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

test("scanner ignores partial-looking text inside script and style blocks", () => {
  const scan = scanDocument(`
{% partialdef card inline %}<article></article>{% endpartialdef %}
<script>const t = "{% partial missing %}";</script>
<style>/* {% partial hidden %} */</style>
{% partial card %}`);
  assert.deepEqual(scan.partialDefinitions.map(({ name }) => name), ["card"]);
  assert.deepEqual(scan.partialReferences.map(({ name }) => name), ["card"]);
});

test("partialSpansByName collects the definition and every same-name reference", () => {
  const text = `{% partialdef card %}<article></article>{% endpartialdef %}\n{% partial card %}\n{% partial card %}\n{% partial other %}`;
  const spans = partialSpansByName(scanDocument(text), "card");
  assert.equal(spans.filter((span) => span.kind === "definition").length, 1);
  assert.equal(spans.filter((span) => span.kind === "reference").length, 2);
  for (const span of spans) {
    assert.equal(text.slice(span.start, span.end), "card");
  }
});

test("scanner finds static Django include partial references", () => {
  const text = `
{% include "cards/item.html#result-card" with item=item %}
{% include template_name %}
{% comment %}{% include "hidden.html#hidden" %}{% endcomment %}`;
  const references = scanTemplatePartialReferences(text, "django-html");
  assert.deepEqual(
    references.map(({ templateName, name }) => ({ templateName, name })),
    [{ templateName: "cards/item.html", name: "result-card" }],
  );
  assert.equal(templatePartialReferenceAtOffset(text, "django-html", references[0].nameStart)?.name, "result-card");
});

test("scanner finds template partials in supported Python call arguments", () => {
  const text = `
render(request, "authors.html#card")
django.shortcuts.render(request, template_name='authors.html#detail')
loader.render_to_string(template_name="authors.html#row")
loader.get_template(r"shared\\\\authors.html#summary")
select_template(["authors.html#compact", "fallback.html#compact"])
TemplateResponse(request, template="authors.html#page")`;
  assert.deepEqual(
    scanTemplatePartialReferences(text, "python").map(({ templateName, name }) => [templateName, name]),
    [
      ["authors.html", "card"],
      ["authors.html", "detail"],
      ["authors.html", "row"],
      ["shared\\authors.html", "summary"],
      ["authors.html", "compact"],
      ["fallback.html", "compact"],
      ["authors.html", "page"],
    ],
  );
});

test("scanner rejects dynamic, concatenated, commented, misplaced, and incomplete Python references", () => {
  const text = `
# render(request, "hidden.html#hidden")
render("wrong-position.html#wrong", context)
render(request, f"{template}.html#dynamic")
render(request, b"bytes.html#bytes")
render(request, "joined.html#" + name)
render(request, "implicit.html#" "joined")
render(request, "formatted.html#partial".format())
render(request, "unterminated.html#partial)`;
  assert.deepEqual(scanTemplatePartialReferences(text, "python"), []);
});
