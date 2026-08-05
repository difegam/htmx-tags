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

async function definitions(
  document: vscode.TextDocument,
  offset: number,
): Promise<(vscode.Location | vscode.LocationLink)[]> {
  return (await vscode.commands.executeCommand<(vscode.Location | vscode.LocationLink)[]>(
    "vscode.executeDefinitionProvider",
    document.uri,
    document.positionAt(offset),
  )) ?? [];
}

function locationUri(location: vscode.Location | vscode.LocationLink): vscode.Uri {
  return location instanceof vscode.Location ? location.uri : location.targetUri;
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

type RuntimeSnippet = {
  body: string[];
  description: string;
  prefix: string;
};

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
  assert.match(
    typeof hxGet.label === "string" ? "" : hxGet.label.detail ?? "",
    /HTMX 2: Core · HTMX 4: Requests/,
  );
  assert.ok((hxGet.sortText ?? "") < (hxTarget?.sortText ?? ""));
  assert.match(markdownOf(hxGet.documentation), /```html/);
  assert.match(markdownOf(hxGet.documentation), /HTMX 2: Core Attribute · HTMX 4: Requests Attribute/);
  assert.match(markdownOf(hxGet.documentation), /htmxTags\.copyExample/);
  assert.equal(hxItems.items.some((item) => labelOf(item) === "data-hx-get"), false);
  assert.ok(hxItems.items.find((item) => labelOf(item) === "hx-vars")?.tags?.includes(vscode.CompletionItemTag.Deprecated));

  const dataHtml = await vscode.workspace.openTextDocument({ language: "html", content: "<div data-hx" });
  const dataItems = await completions(dataHtml, new vscode.Position(0, 12));
  assert.ok(dataItems.items.some((item) => labelOf(item) === "data-hx-get"));

  const swapStrategies = await valuesAt('<section hx-swap=""></section>', 'hx-swap="');
  assert.ok(swapStrategies.some((item) => labelOf(item) === "innerHTML"));
  assert.match(
    markdownOf(swapStrategies.find((item) => labelOf(item) === "innerHTML")?.documentation),
    /HTMX 2: Core Attribute · HTMX 4: Request Control Attribute/,
  );
  const innerMorphDocumentation = markdownOf(
    swapStrategies.find((item) => labelOf(item) === "innerMorph")?.documentation,
  );
  assert.match(innerMorphDocumentation, /HTMX 4: Request Control Attribute/);
  assert.doesNotMatch(innerMorphDocumentation, /HTMX 2: Core Attribute/);
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
  const v2Items = await completions(html, new vscode.Position(0, 7));
  const v2Get = v2Items.items.find((item) => labelOf(item) === "hx-get");
  assert.match(typeof v2Get?.label === "string" ? "" : v2Get?.label.detail ?? "", /Core Attribute · HTMX 2/);
  await vscode.workspace.getConfiguration("htmxTags").update("version", "4", vscode.ConfigurationTarget.Global);
  assert.ok((await valuesAt('<div hx-swap="">', 'hx-swap="')).some((item) => labelOf(item) === "innerMorph"));
  const v4Items = await completions(html, new vscode.Position(0, 7));
  const v4Get = v4Items.items.find((item) => labelOf(item) === "hx-get");
  const v4Status = v4Items.items.find((item) => labelOf(item) === "hx-status:<status>");
  assert.match(typeof v4Get?.label === "string" ? "" : v4Get?.label.detail ?? "", /Requests Attribute · HTMX 4/);
  assert.match(typeof v4Status?.label === "string" ? "" : v4Status?.label.detail ?? "", /Advanced Attribute · HTMX 4/);
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
  assert.match(hoverMarkdown, /HTMX 2: Core Attribute · HTMX 4: Requests Attribute/);
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

  const tagDocument = await vscode.workspace.openTextDocument({ language: "django-html", content: "{% par" });
  const tagItems = await completions(tagDocument, tagDocument.positionAt(tagDocument.getText().length));
  assert.ok(tagItems.items.some((item) => labelOf(item) === "partialdef"));
  assert.ok(tagItems.items.some((item) => labelOf(item) === "partialdef … inline"));
  assert.ok(tagItems.items.some((item) => labelOf(item) === "partial"));
  assert.ok(tagItems.items.some((item) => labelOf(item) === "endpartialdef"));
  assert.equal(tagItems.items.some((item) => labelOf(item) === "endpartial"), false);

  const localDefinitionDocument = await vscode.workspace.openTextDocument({
    language: "django-html",
    content: "{% partialdef card inline %}Card{% endpartialdef %}\n{% partial card %}",
  });
  const localUse = localDefinitionDocument.getText().lastIndexOf("card");
  const localDefinitions = await definitions(localDefinitionDocument, localUse);
  assert.ok(localDefinitions.some((location) => locationUri(location).toString() === localDefinitionDocument.uri.toString()));

  const workspace = vscode.workspace.workspaceFolders?.[0];
  assert.ok(workspace, "test workspace is open");
  let includeDocument = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(workspace.uri, "include.html"));
  if (includeDocument.languageId !== "django-html") {
    includeDocument = await vscode.languages.setTextDocumentLanguage(includeDocument, "django-html");
  }
  const includePartial = includeDocument.getText().indexOf("#card") + 1;
  const includeCompletions = await completions(includeDocument, includeDocument.positionAt(includePartial + 2));
  assert.ok(includeCompletions.items.some((item) => labelOf(item) === "card"));
  assert.ok(includeCompletions.items.some((item) => labelOf(item) === "row"));
  const includeDefinitions = await definitions(includeDocument, includePartial);
  assert.equal(new Set(includeDefinitions.map((location) => locationUri(location).toString())).size, 2);

  const pythonDocument = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(workspace.uri, "views.py"));
  const pythonPartial = pythonDocument.getText().indexOf("#card") + 1;
  const pythonCompletions = await completions(pythonDocument, pythonDocument.positionAt(pythonPartial + 2));
  assert.ok(pythonCompletions.items.some((item) => labelOf(item) === "card"));
  const pythonDefinitions = await definitions(pythonDocument, pythonPartial);
  assert.equal(new Set(pythonDefinitions.map((location) => locationUri(location).toString())).size, 2);

  const missingDocument = await vscode.workspace.openTextDocument({
    language: "python",
    content: 'render(request, "missing.html#card")',
  });
  assert.equal((await definitions(missingDocument, missingDocument.getText().indexOf("#card") + 1)).length, 0);

  const invalid = await vscode.workspace.openTextDocument({ language: "html", content: '<div hx-nope="x">' });
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.ok(vscode.languages.getDiagnostics(invalid.uri).some((diagnostic) => diagnostic.source === "htmx-tags"));

  const snippetBytes = await vscode.workspace.fs.readFile(
    vscode.Uri.joinPath(vscode.Uri.file(extension.extensionPath), "snippets", "django-htmx.json"),
  );
  const snippets = JSON.parse(new TextDecoder().decode(snippetBytes)) as Record<string, RuntimeSnippet>;
  assert.equal(Object.keys(snippets).length, 22);
  const snippetDocument = await vscode.workspace.openTextDocument({ language: "django-html", content: "" });
  const snippetEditor = await vscode.window.showTextDocument(snippetDocument);
  for (const [name, snippet] of Object.entries(snippets)) {
    const end = snippetDocument.positionAt(snippetDocument.getText().length);
    assert.ok(await snippetEditor.edit((edit) => edit.delete(new vscode.Range(new vscode.Position(0, 0), end))));
    snippetEditor.selection = new vscode.Selection(0, 0, 0, 0);
    assert.ok(await snippetEditor.insertSnippet(new vscode.SnippetString(snippet.body.join("\n"))));
    assert.doesNotMatch(snippetDocument.getText(), /\$\{|\$\d+/, `${name} left an unresolved snippet placeholder`);
  }
}
