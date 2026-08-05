import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";

import * as vscode from "vscode";

const ROOT = path.resolve(__dirname, "../../..");
const STATE_FILE = path.join(ROOT, ".vscode-test", "screenshot-state");

async function checkpoint(state: string): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 500));
  writeFileSync(STATE_FILE, state);
  const acknowledgement = `${STATE_FILE}.${state}.ack`;
  for (let attempt = 0; attempt < 200; attempt++) {
    if (existsSync(acknowledgement)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Screenshot capture timed out for ${state}`);
}

function positionOf(document: vscode.TextDocument, value: string, offset = 0): vscode.Position {
  const index = document.getText().indexOf(value);
  if (index === -1) {
    throw new Error(`Unable to find '${value}' in screenshot document`);
  }
  return document.positionAt(index + offset);
}

async function insert(editor: vscode.TextEditor, text: string): Promise<void> {
  await editor.edit((builder) => builder.insert(editor.selection.active, text));
}

export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension("difegam.htmx-tags-django");
  assert.ok(extension, "extension is discoverable");
  await extension.activate();
  await vscode.workspace.getConfiguration("git").update(
    "openRepositoryInParentFolders",
    "never",
    vscode.ConfigurationTarget.Global,
  );
  await vscode.workspace.getConfiguration("editor").update(
    "minimap.enabled",
    false,
    vscode.ConfigurationTarget.Global,
  );
  await vscode.commands.executeCommand("workbench.action.closeSidebar");
  await vscode.commands.executeCommand("workbench.action.closePanel");
  await vscode.commands.executeCommand("notifications.clearAll");

  const attributes = await vscode.workspace.openTextDocument({
    language: "html",
    content: `<main id="results">\n  <button h></button>\n</main>`,
  });
  const attributeEditor = await vscode.window.showTextDocument(attributes);
  let position = positionOf(attributes, "button h", "button h".length);
  attributeEditor.selection = new vscode.Selection(position, position);
  await checkpoint("attribute-completions-typing");
  await insert(attributeEditor, "x");
  await checkpoint("attribute-completions-prefix");
  await insert(attributeEditor, "-");
  await checkpoint("attribute-completions-trigger");
  await vscode.commands.executeCommand("editor.action.triggerSuggest");
  await vscode.commands.executeCommand("notifications.clearAll");
  await checkpoint("attribute-completions-ranked");
  await vscode.commands.executeCommand("selectNextSuggestion");
  await checkpoint("attribute-completions-selected");
  await vscode.commands.executeCommand("toggleSuggestionDetails");
  await checkpoint("attribute-completions-details");

  await vscode.commands.executeCommand("hideSuggestWidget");
  const values = await vscode.workspace.openTextDocument({
    language: "html",
    content: `<section hx-swap=""></section>`,
  });
  const valuesEditor = await vscode.window.showTextDocument(values);
  position = positionOf(values, `hx-swap="`, `hx-swap="`.length);
  valuesEditor.selection = new vscode.Selection(position, position);
  await checkpoint("context-aware-values-empty");
  await vscode.commands.executeCommand("editor.action.triggerSuggest");
  await vscode.commands.executeCommand("notifications.clearAll");
  await checkpoint("context-aware-values-strategies");
  await vscode.commands.executeCommand("toggleSuggestionDetails");
  await checkpoint("context-aware-values-strategy-details");
  await vscode.commands.executeCommand("hideSuggestWidget");
  await insert(valuesEditor, "innerHTML");
  await checkpoint("context-aware-values-selected");
  await insert(valuesEditor, " ");
  await checkpoint("context-aware-values-modifier-prefix");
  await vscode.commands.executeCommand("editor.action.triggerSuggest");
  await checkpoint("context-aware-values-modifiers");

  await vscode.commands.executeCommand("hideSuggestWidget");
  const hoverDocument = await vscode.workspace.openTextDocument({
    language: "html",
    content: `<main>\n  <button hx-get="/items" hx-target="closest section">Refresh</button>\n</main>`,
  });
  const hoverEditor = await vscode.window.showTextDocument(hoverDocument);
  await checkpoint("hover-documentation-start");
  position = positionOf(hoverDocument, "hx-target", 3);
  hoverEditor.selection = new vscode.Selection(position, position);
  await checkpoint("hover-documentation-focus");
  await vscode.commands.executeCommand("editor.action.showHover");
  await vscode.commands.executeCommand("notifications.clearAll");
  await checkpoint("hover-documentation-rich");
  const actionDocument = await vscode.workspace.openTextDocument({
    language: "html",
    content: `<button hx-get="/items">Load items</button>`,
  });
  const actionEditor = await vscode.window.showTextDocument(actionDocument);
  position = positionOf(actionDocument, "hx-get", 3);
  actionEditor.selection = new vscode.Selection(position, position);
  await checkpoint("hover-documentation-example");
  await vscode.commands.executeCommand("editor.action.showHover");
  await checkpoint("hover-documentation-actions");

  const diagnostics = await vscode.workspace.openTextDocument({
    language: "django-html",
    content: `{% partialdef card %}<article></article>{% endpartialdef %}\n{% partialdef card inline %}<article></article>{% endpartialdef %}\n{% partial missing %}\n<button hx-methd="post">Save</button>`,
  });
  await vscode.window.showTextDocument(diagnostics);
  await new Promise((resolve) => setTimeout(resolve, 300));
  await vscode.commands.executeCommand("workbench.actions.view.problems");
  await vscode.commands.executeCommand("notifications.clearAll");
  await checkpoint("diagnostics");

  await vscode.commands.executeCommand("workbench.action.closePanel");
  const partials = await vscode.workspace.openTextDocument({
    language: "django-html",
    content: `{% partialdef result_card inline %}\n  <article>{{ result.title }}</article>\n{% endpartialdef %}\n\n<section>\n  {% partial res\n</section>`,
  });
  const partialEditor = await vscode.window.showTextDocument(partials);
  position = partials.positionAt(partials.getText().indexOf("{% partial res") + "{% partial res".length);
  partialEditor.selection = new vscode.Selection(position, position);
  await vscode.commands.executeCommand("editor.action.triggerSuggest");
  await vscode.commands.executeCommand("notifications.clearAll");
  await checkpoint("partials");
}
