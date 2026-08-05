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
  );
}

export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension("difegam.htmx-tags-django");
  assert.ok(extension, "extension is discoverable");
  await extension.activate();

  const html = await vscode.workspace.openTextDocument({ language: "html", content: "<div hx" });
  const hxItems = await completions(html, new vscode.Position(0, 7));
  assert.ok(hxItems.items.some((item) => item.label === "hx-get"));
  assert.equal(hxItems.items.some((item) => item.label === "data-hx-get"), false);

  const dataHtml = await vscode.workspace.openTextDocument({ language: "html", content: "<div data-hx" });
  const dataItems = await completions(dataHtml, new vscode.Position(0, 12));
  assert.ok(dataItems.items.some((item) => item.label === "data-hx-get"));

  const hoverDocument = await vscode.workspace.openTextDocument({
    language: "html",
    content: '<div class="card" hx-get="/items"></div>',
  });
  const classHovers = await vscode.commands.executeCommand<vscode.Hover[]>(
    "vscode.executeHoverProvider",
    hoverDocument.uri,
    new vscode.Position(0, 7),
  );
  assert.equal(classHovers.length, 0);
  const hxHovers = await vscode.commands.executeCommand<vscode.Hover[]>(
    "vscode.executeHoverProvider",
    hoverDocument.uri,
    new vscode.Position(0, 20),
  );
  assert.ok(hxHovers.length > 0);

  const django = await vscode.workspace.openTextDocument({
    language: "django-html",
    content: "{% partialdef card inline %}<article></article>{% endpartialdef %}\n{% partial ca",
  });
  const partialItems = await completions(django, new vscode.Position(1, 13));
  assert.ok(partialItems.items.some((item) => item.label === "card"));

  const invalid = await vscode.workspace.openTextDocument({ language: "html", content: '<div hx-nope="x">' });
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.ok(vscode.languages.getDiagnostics(invalid.uri).some((diagnostic) => diagnostic.source === "htmx-tags"));
}
