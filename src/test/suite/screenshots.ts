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

export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension("difegam.htmx-tags-django");
  await extension?.activate();
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

  const showcase = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(ROOT, "examples/showcase.html")));
  await vscode.languages.setTextDocumentLanguage(showcase, "django-html");
  const editor = await vscode.window.showTextDocument(showcase);
  let position = positionOf(showcase, "hx-get", "hx-get".length);
  editor.selection = new vscode.Selection(position, position);
  await vscode.commands.executeCommand("editor.action.triggerSuggest");
  await vscode.commands.executeCommand("notifications.clearAll");
  await checkpoint("completion");

  await vscode.commands.executeCommand("hideSuggestWidget");
  position = positionOf(showcase, "hx-trigger", 3);
  editor.selection = new vscode.Selection(position, position);
  await vscode.commands.executeCommand("editor.action.showHover");
  await vscode.commands.executeCommand("notifications.clearAll");
  await checkpoint("hover");

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
