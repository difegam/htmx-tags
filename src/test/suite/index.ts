import assert from "node:assert/strict";

import * as vscode from "vscode";

async function completions(
  document: vscode.TextDocument,
  position: vscode.Position,
): Promise<vscode.CompletionList> {
  return vscode.commands.executeCommand<vscode.CompletionList>(
    "vscode.executeCompletionItemProvider",
    document.uri,
    position,
    undefined,
    100,
  );
}

function labelOf(item: vscode.CompletionItem): string {
  return typeof item.label === "string" ? item.label : item.label.label;
}

function markdownOf(value: unknown): string {
  return typeof value === "string"
    ? value
    : typeof value === "object" && value !== null && "value" in value && typeof value.value === "string"
      ? value.value
      : "";
}

async function valuesAt(content: string, marker: string): Promise<vscode.CompletionItem[]> {
  const document = await vscode.workspace.openTextDocument({ language: "html", content });
  const offset = content.indexOf(marker) + marker.length;
  return (await completions(document, document.positionAt(offset))).items;
}

export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension("difegam.htmx-tags-django");
  assert.ok(extension, "extension is discoverable");
  await extension.activate();

  const html = await vscode.workspace.openTextDocument({ language: "html", content: "<div hx" });
  const hxItems = await completions(html, new vscode.Position(0, 7));
  const hxGet = hxItems.items.find((item) => labelOf(item) === "hx-get");
  const hxTarget = hxItems.items.find((item) => labelOf(item) === "hx-target");
  assert.ok(hxGet);
  assert.equal(typeof hxGet.label, "object");
  assert.match(typeof hxGet.label === "string" ? "" : hxGet.label.detail ?? "", /HTMX 2 & 4/);
  assert.ok((hxGet.sortText ?? "") < (hxTarget?.sortText ?? ""));
  assert.match(markdownOf(hxGet.documentation), /```html/);
  assert.match(markdownOf(hxGet.documentation), /htmxTags\.copyExample/);
  assert.equal(hxItems.items.some((item) => labelOf(item) === "data-hx-get"), false);
  assert.ok(hxItems.items.find((item) => labelOf(item) === "hx-vars")?.tags?.includes(vscode.CompletionItemTag.Deprecated));

  const dataHtml = await vscode.workspace.openTextDocument({ language: "html", content: "<div data-hx" });
  const dataItems = await completions(dataHtml, new vscode.Position(0, 12));
  assert.ok(dataItems.items.some((item) => labelOf(item) === "data-hx-get"));

  const swapStrategies = await valuesAt('<section hx-swap=""></section>', 'hx-swap="');
  assert.ok(swapStrategies.some((item) => labelOf(item) === "innerHTML"));
  assert.equal(swapStrategies.some((item) => labelOf(item) === "swap:"), false);
  const swapModifiers = await valuesAt('<section hx-swap="innerHTML "></section>', 'hx-swap="innerHTML ');
  assert.ok(swapModifiers.some((item) => labelOf(item) === "swap:"));
  assert.equal(swapModifiers.some((item) => labelOf(item) === "innerHTML"), false);

  const triggerEvents = await valuesAt('<input hx-trigger="">', 'hx-trigger="');
  assert.ok(triggerEvents.some((item) => labelOf(item) === "keyup"));
  const triggerModifiers = await valuesAt('<input hx-trigger="keyup ">', 'hx-trigger="keyup ');
  assert.ok(triggerModifiers.some((item) => labelOf(item) === "delay:"));
  assert.equal(triggerModifiers.some((item) => labelOf(item) === "keyup"), false);

  const targetValues = await valuesAt('<div hx-target=""></div>', 'hx-target="');
  assert.equal(
    (targetValues.find((item) => labelOf(item) === "closest")?.insertText as vscode.SnippetString)?.value,
    "closest ${1:selector}",
  );
  const extValues = await valuesAt('<main hx-ext="preload,"></main>', 'hx-ext="preload,');
  assert.equal(extValues.some((item) => labelOf(item) === "preload"), false);
  assert.ok(extValues.some((item) => labelOf(item) === "response-targets"));
  assert.ok((await valuesAt('<input hx-sync="">', 'hx-sync="')).some((item) => labelOf(item) === "this:replace"));
  assert.ok((await valuesAt('<button hx-params="">', 'hx-params="')).some((item) => labelOf(item) === "not"));
  assert.ok((await valuesAt('<section hx-disinherit="">', 'hx-disinherit="')).some((item) => labelOf(item) === "hx-target"));
  const oobValues = await valuesAt('<aside hx-swap-oob="">', 'hx-swap-oob="');
  assert.equal(
    (oobValues.find((item) => labelOf(item) === "beforeend")?.insertText as vscode.SnippetString)?.value,
    "beforeend${1::selector}",
  );

  await vscode.workspace.getConfiguration("htmxTags").update("version", "2", vscode.ConfigurationTarget.Global);
  assert.equal((await valuesAt('<div hx-swap="">', 'hx-swap="')).some((item) => labelOf(item) === "innerMorph"), false);
  await vscode.workspace.getConfiguration("htmxTags").update("version", "4", vscode.ConfigurationTarget.Global);
  assert.ok((await valuesAt('<div hx-swap="">', 'hx-swap="')).some((item) => labelOf(item) === "innerMorph"));
  await vscode.workspace.getConfiguration("htmxTags").update("version", "compatible", vscode.ConfigurationTarget.Global);

  const hoverDocument = await vscode.workspace.openTextDocument({
    language: "html",
    content: '<div class="card" hx-get="/items"></div>',
  });
  const hxHovers = await vscode.commands.executeCommand<vscode.Hover[]>(
    "vscode.executeHoverProvider",
    hoverDocument.uri,
    new vscode.Position(0, 20),
  );
  assert.ok(hxHovers.length > 0);
  const hoverMarkdown = hxHovers.flatMap((hover) => hover.contents).map(markdownOf).join("\n");
  assert.match(hoverMarkdown, /### `hx-get`/);
  assert.match(hoverMarkdown, /```html/);
  assert.match(hoverMarkdown, /HTMX 2 docs/);
  assert.match(hoverMarkdown, /HTMX 4 docs/);
  assert.match(hoverMarkdown, /command:htmxTags\.copyExample/);
  assert.match(hoverMarkdown, /command:htmxTags\.openSettings/);

  const commands = await vscode.commands.getCommands(true);
  assert.ok(commands.includes("htmxTags.copyExample"));
  assert.ok(commands.includes("htmxTags.openSettings"));
  await vscode.commands.executeCommand("htmxTags.copyExample", { text: '<div hx-get="/items"></div>' });
  assert.equal(await vscode.env.clipboard.readText(), '<div hx-get="/items"></div>');
  await vscode.commands.executeCommand("htmxTags.copyExample", { text: "" });
  assert.equal(await vscode.env.clipboard.readText(), '<div hx-get="/items"></div>');

  const django = await vscode.workspace.openTextDocument({
    language: "django-html",
    content: "{% partialdef card inline %}<article></article>{% endpartialdef %}\n{% partial ca",
  });
  const partialItems = await completions(django, new vscode.Position(1, 13));
  assert.ok(partialItems.items.some((item) => labelOf(item) === "card"));

  const invalid = await vscode.workspace.openTextDocument({ language: "html", content: '<div hx-nope="x">' });
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.ok(vscode.languages.getDiagnostics(invalid.uri).some((diagnostic) => diagnostic.source === "htmx-tags"));
}
