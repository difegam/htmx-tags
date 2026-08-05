import * as vscode from "vscode";

import {
  type CatalogAttribute,
  type CatalogIndex,
  type HtmxVersionMode,
  loadCatalog,
} from "./catalog.js";
import { analyzeDocument } from "./diagnostics.js";
import {
  attributeAtOffset,
  partialAtOffset,
  scanDocument,
  tagAtOffset,
  type AttributeToken,
  type ScanResult,
} from "./scanner.js";

const DOCUMENT_SELECTOR: vscode.DocumentFilter[] = [{ language: "html" }, { language: "django-html" }];
const DIAGNOSTIC_SOURCE = "htmx-tags";

function configuration(document?: vscode.TextDocument): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration("htmxTags", document?.uri);
}

function versionMode(document: vscode.TextDocument): HtmxVersionMode {
  return configuration(document).get<HtmxVersionMode>("version", "compatible");
}

function versionsLabel(versions: readonly string[]): string {
  return `HTMX ${versions.join(" & ")}`;
}

function documentationMarkdown(
  name: string,
  description: string,
  versions: readonly string[],
  documentation: Readonly<Record<string, string | undefined>>,
  values?: CatalogAttribute["values"],
  modifier?: string,
): vscode.MarkdownString {
  const markdown = new vscode.MarkdownString(undefined, true);
  markdown.appendMarkdown(`**\`${name}\`** · ${versionsLabel(versions)}\n\n${description}`);
  if (modifier !== undefined) {
    markdown.appendMarkdown(`\n\nModifier: \`:${modifier}\``);
  }
  if (values !== undefined && values.length > 0) {
    markdown.appendMarkdown(`\n\nSuggested values: ${values.map((value) => `\`${value.name}\``).join(", ")}`);
  }
  const links = Object.entries(documentation)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([major, url]) => `[HTMX ${major} docs](${url})`);
  if (links.length > 0) {
    markdown.appendMarkdown(`\n\n${links.join(" · ")}`);
  }
  markdown.isTrusted = false;
  return markdown;
}

function completionRange(
  document: vscode.TextDocument,
  attribute: AttributeToken | undefined,
  offset: number,
): vscode.Range {
  if (attribute !== undefined && offset >= attribute.nameStart && offset <= attribute.nameEnd) {
    return new vscode.Range(document.positionAt(attribute.nameStart), document.positionAt(attribute.nameEnd));
  }
  const text = document.getText();
  let start = offset;
  while (start > 0 && !/[\s<>=/"']/.test(text[start - 1])) {
    start--;
  }
  return new vscode.Range(document.positionAt(start), document.positionAt(offset));
}

function followsWithAssignment(text: string, end: number): boolean {
  let cursor = end;
  while (/\s/.test(text[cursor] ?? "")) {
    cursor++;
  }
  return text[cursor] === "=";
}

function attributeCompletion(
  entry: CatalogAttribute,
  spelling: string,
  range: vscode.Range,
  insertValue: boolean,
): vscode.CompletionItem {
  const item = new vscode.CompletionItem(spelling, vscode.CompletionItemKind.Property);
  item.detail = `${versionsLabel(entry.versions)} attribute`;
  item.documentation = documentationMarkdown(
    spelling,
    entry.description,
    entry.versions,
    entry.documentation,
    entry.values,
  );
  item.range = range;
  item.insertText = insertValue ? new vscode.SnippetString(`${spelling}=\"$0\"`) : spelling;
  item.sortText = `1-${spelling}`;
  return item;
}

function dynamicCompletion(
  label: string,
  snippet: string,
  detail: string,
  range: vscode.Range,
): vscode.CompletionItem {
  const item = new vscode.CompletionItem(label, vscode.CompletionItemKind.Property);
  item.detail = detail;
  item.range = range;
  item.insertText = new vscode.SnippetString(snippet);
  item.sortText = `2-${label}`;
  return item;
}

function partialCompletionItems(
  document: vscode.TextDocument,
  offset: number,
  scan: ScanResult,
): vscode.CompletionItem[] | undefined {
  const textBefore = document.getText().slice(0, offset);
  const tagStart = textBefore.lastIndexOf("{%");
  if (tagStart < textBefore.lastIndexOf("%}")) {
    return undefined;
  }
  const active = textBefore.slice(tagStart);
  const match = active.match(/^\{%\s*partial\s+([^\s%}]*)$/);
  if (match === null) {
    return undefined;
  }
  const prefix = match[1];
  const start = offset - prefix.length;
  const range = new vscode.Range(document.positionAt(start), document.positionAt(offset));
  const unique = new Map(scan.partialDefinitions.map((definition) => [definition.name, definition]));
  return [...unique.values()].map((definition) => {
    const item = new vscode.CompletionItem(definition.name, vscode.CompletionItemKind.Reference);
    item.detail = `Django partial · line ${document.positionAt(definition.nameStart).line + 1}${definition.inline ? " · inline" : ""}`;
    item.range = range;
    return item;
  });
}

function valueCompletionItems(
  document: vscode.TextDocument,
  attribute: AttributeToken,
  offset: number,
  catalog: CatalogIndex,
): vscode.CompletionItem[] | undefined {
  if (attribute.valueStart === undefined || offset < attribute.valueStart) {
    return undefined;
  }
  const entry = catalog.resolve(attribute.name)?.attribute;
  if (entry?.values === undefined) {
    return undefined;
  }
  const beforeCursor = document.getText().slice(attribute.valueStart, offset);
  const segment = entry.strictValues === true ? beforeCursor : beforeCursor.split(/[\s,]/).at(-1) ?? "";
  const start = offset - segment.length;
  const range = new vscode.Range(document.positionAt(start), document.positionAt(offset));
  return entry.values.map((value) => {
    const item = new vscode.CompletionItem(value.name, vscode.CompletionItemKind.Value);
    item.detail = value.description;
    item.range = range;
    item.insertText = value.name;
    return item;
  });
}

function provideCompletions(
  catalog: CatalogIndex,
  document: vscode.TextDocument,
  position: vscode.Position,
): vscode.CompletionItem[] | undefined {
  if (!configuration(document).get("enableCompletion", true)) {
    return undefined;
  }
  const text = document.getText();
  const offset = document.offsetAt(position);
  const scan = scanDocument(text);
  if (document.languageId === "django-html") {
    const partials = partialCompletionItems(document, offset, scan);
    if (partials !== undefined) {
      return partials;
    }
  }

  const tag = tagAtOffset(scan, offset);
  if (tag === undefined) {
    return undefined;
  }
  const attribute = attributeAtOffset(scan, offset);
  if (
    attribute !== undefined &&
    attribute.valueStart !== undefined &&
    offset >= attribute.valueStart &&
    offset <= (attribute.valueEnd ?? offset)
  ) {
    return valueCompletionItems(document, attribute, offset, catalog);
  }

  const range = completionRange(document, attribute, offset);
  const prefix = document.getText(range).toLowerCase();
  if (prefix !== "" && !prefix.startsWith("hx") && !prefix.startsWith("data-hx")) {
    return undefined;
  }
  const dataAlias = prefix.startsWith("data-");
  const assignmentExists = followsWithAssignment(text, attribute?.nameEnd ?? offset);
  const entries = catalog.list(versionMode(document));
  const items = entries.map((entry) => {
    const spelling = dataAlias ? `data-${entry.name}` : entry.name;
    return attributeCompletion(entry, spelling, range, !assignmentExists);
  });

  const alias = dataAlias ? "data-" : "";
  const mode = versionMode(document);
  items.push(
    dynamicCompletion(
      `${alias}hx-on:<event>`,
      `${alias}hx-on:\${1:event}=\"$0\"`,
      "Handle a DOM event inline",
      range,
    ),
    dynamicCompletion(
      `${alias}hx-on::<event>`,
      `${alias}hx-on::\${1:before-request}=\"$0\"`,
      "Handle an HTMX event inline",
      range,
    ),
  );
  if (mode !== "4") {
    items.push(
      dynamicCompletion(
        `${alias}hx-target-<status>`,
        `${alias}hx-target-\${1:4*}=\"\${2:#errors}\"`,
        "Response Targets extension",
        range,
      ),
    );
  }
  if (mode !== "2") {
    items.push(
      dynamicCompletion(
        `${alias}hx-status:<status>`,
        `${alias}hx-status:\${1:422}=\"\${2:target:#errors}\"`,
        "HTMX 4 status-specific response handling",
        range,
      ),
    );
  }

  for (const entry of entries) {
    for (const modifier of entry.modifiers ?? []) {
      const spelling = `${alias}${entry.name}:${modifier}`;
      items.push(attributeCompletion(entry, spelling, range, !assignmentExists));
    }
  }
  return items;
}

function provideHover(
  catalog: CatalogIndex,
  document: vscode.TextDocument,
  position: vscode.Position,
): vscode.Hover | undefined {
  if (!configuration(document).get("enableHover", true)) {
    return undefined;
  }
  const offset = document.offsetAt(position);
  const scan = scanDocument(document.getText());
  const attribute = attributeAtOffset(scan, offset);
  if (attribute !== undefined && offset >= attribute.nameStart && offset <= attribute.nameEnd) {
    const resolved = catalog.resolve(attribute.name);
    if (resolved === undefined) {
      return undefined;
    }
    const markdown = documentationMarkdown(
      attribute.name,
      resolved.description,
      resolved.versions,
      resolved.documentation,
      resolved.attribute?.values,
      resolved.modifier,
    );
    return new vscode.Hover(
      markdown,
      new vscode.Range(document.positionAt(attribute.nameStart), document.positionAt(attribute.nameEnd)),
    );
  }

  if (document.languageId === "django-html") {
    const partial = partialAtOffset(scan, offset);
    if (partial !== undefined) {
      const definition = scan.partialDefinitions.find((candidate) => candidate.name === partial.name);
      if (definition !== undefined) {
        const markdown = new vscode.MarkdownString(
          `**Django partial \`${partial.name}\`**\n\nDefined on line ${document.positionAt(definition.nameStart).line + 1}${definition.inline ? " with `inline`" : ""}.`,
        );
        return new vscode.Hover(
          markdown,
          new vscode.Range(document.positionAt(partial.nameStart), document.positionAt(partial.nameEnd)),
        );
      }
    }
  }
  return undefined;
}

export function activate(context: vscode.ExtensionContext): void {
  const catalog = loadCatalog(context.asAbsolutePath("htmx.catalog.json"));
  const diagnostics = vscode.languages.createDiagnosticCollection(DIAGNOSTIC_SOURCE);
  const timers = new Map<string, NodeJS.Timeout>();

  const updateDiagnostics = (document: vscode.TextDocument): void => {
    if (!DOCUMENT_SELECTOR.some((selector) => typeof selector !== "string" && selector.language === document.languageId)) {
      return;
    }
    if (!configuration(document).get("enableValidation", true)) {
      diagnostics.delete(document.uri);
      return;
    }
    const entries = analyzeDocument(document.getText(), document.languageId, catalog, versionMode(document)).map(
      (issue) => {
        const diagnostic = new vscode.Diagnostic(
          new vscode.Range(document.positionAt(issue.start), document.positionAt(issue.end)),
          issue.message,
          issue.severity === "warning" ? vscode.DiagnosticSeverity.Warning : vscode.DiagnosticSeverity.Hint,
        );
        diagnostic.source = DIAGNOSTIC_SOURCE;
        diagnostic.code = issue.code;
        return diagnostic;
      },
    );
    diagnostics.set(document.uri, entries);
  };

  const scheduleDiagnostics = (document: vscode.TextDocument): void => {
    const key = document.uri.toString();
    const previous = timers.get(key);
    if (previous !== undefined) {
      clearTimeout(previous);
    }
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        updateDiagnostics(document);
      }, 150),
    );
  };

  context.subscriptions.push(
    diagnostics,
    vscode.languages.registerCompletionItemProvider(
      DOCUMENT_SELECTOR,
      { provideCompletionItems: (document, position) => provideCompletions(catalog, document, position) },
      "-",
      ":",
      "\"",
      "'",
      "%",
      " ",
    ),
    vscode.languages.registerHoverProvider(DOCUMENT_SELECTOR, {
      provideHover: (document, position) => provideHover(catalog, document, position),
    }),
    vscode.workspace.onDidOpenTextDocument(updateDiagnostics),
    vscode.workspace.onDidChangeTextDocument((event) => scheduleDiagnostics(event.document)),
    vscode.workspace.onDidCloseTextDocument((document) => {
      const key = document.uri.toString();
      const timer = timers.get(key);
      if (timer !== undefined) {
        clearTimeout(timer);
        timers.delete(key);
      }
      diagnostics.delete(document.uri);
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("htmxTags")) {
        for (const document of vscode.workspace.textDocuments) {
          updateDiagnostics(document);
        }
      }
    }),
  );

  for (const document of vscode.workspace.textDocuments) {
    updateDiagnostics(document);
  }
}

export function deactivate(): void {
  // VS Code disposes all subscriptions registered on the extension context.
}
