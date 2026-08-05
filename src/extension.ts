import * as vscode from "vscode";

import {
  type CatalogAttribute,
  type CatalogIndex,
  type HtmxVersionMode,
  loadCatalog,
} from "./catalog.js";
import { analyzeDocument } from "./diagnostics.js";
import { computeQuickFixes } from "./quickfixes.js";
import { evictScan, getScan } from "./scanCache.js";
import {
  attributeMetadataLabel,
  completionKind,
  COPY_EXAMPLE_COMMAND,
  documentationMarkdown,
  OPEN_SETTINGS_COMMAND,
  valueExample,
  valueKindLabel,
  valuesForMode,
  versionsLabel,
} from "./intellisense.js";
import {
  attributeAtOffset,
  partialAtOffset,
  partialSpansByName,
  tagAtOffset,
  templatePartialReferenceAtOffset,
  type AttributeToken,
  type PartialDefinition,
  type ScanResult,
} from "./scanner.js";

const DOCUMENT_SELECTOR: vscode.DocumentFilter[] = [{ language: "html" }, { language: "django-html" }];
const PARTIAL_SELECTOR: vscode.DocumentFilter[] = [{ language: "django-html" }, { language: "python" }];
const PYTHON_SELECTOR: vscode.DocumentFilter = { language: "python" };
const DIAGNOSTIC_SOURCE = "htmx-tags";
const COMPLETION_DOCUMENTATION = new WeakMap<vscode.CompletionItem, () => vscode.MarkdownString>();
// ponytail: cap to avoid 100k+ results on monorepos repeating index.html; raise if users report truncation.
const TEMPLATE_FINDFILES_LIMIT = 2000;
const ATTRIBUTE_PRIORITIES = [
  "hx-get",
  "hx-post",
  "hx-put",
  "hx-patch",
  "hx-delete",
  "hx-method",
  "hx-target",
  "hx-swap",
  "hx-trigger",
  "hx-boost",
  "hx-ext",
];

function configuration(document?: vscode.TextDocument): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration("htmxTags", document?.uri);
}

function versionMode(document: vscode.TextDocument): HtmxVersionMode {
  return configuration(document).get<HtmxVersionMode>("version", "compatible");
}

function deferDocumentation(item: vscode.CompletionItem, factory: () => vscode.MarkdownString): void {
  COMPLETION_DOCUMENTATION.set(item, factory);
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
  mode: HtmxVersionMode,
): vscode.CompletionItem {
  const item = new vscode.CompletionItem(
    {
      label: spelling,
      detail: ` · ${attributeMetadataLabel(entry.categories, entry.versions, mode)}`,
      description: entry.description,
    },
    vscode.CompletionItemKind.Property,
  );
  item.detail = entry.deprecated ?? "HTMX attribute";
  item.range = range;
  item.insertText = insertValue ? new vscode.SnippetString(`${spelling}=\"$0\"`) : spelling;
  item.filterText = spelling;
  item.sortText = `${attributePriority(entry.name)}-${spelling}`;
  if (entry.deprecated !== undefined) {
    item.tags = [vscode.CompletionItemTag.Deprecated];
  }
  deferDocumentation(item, () =>
    documentationMarkdown({
      name: spelling,
      description: entry.description,
      versions: entry.versions,
      documentation: entry.documentation,
      categories: entry.categories,
      mode,
      values: entry.values,
      examples: entry.examples,
    }),
  );
  return item;
}

function attributePriority(name: string): string {
  const index = ATTRIBUTE_PRIORITIES.indexOf(name);
  return index < 0 ? "20" : index.toString().padStart(2, "0");
}

function dynamicCompletion(
  label: string,
  snippet: string,
  detail: string,
  range: vscode.Range,
  mode: HtmxVersionMode,
  versions: CatalogAttribute["versions"],
  documentation: CatalogAttribute["documentation"],
  examples?: CatalogAttribute["examples"],
  categories?: CatalogAttribute["categories"],
): vscode.CompletionItem {
  const item = new vscode.CompletionItem(
    { label, detail: ` · ${attributeMetadataLabel(categories, versions, mode)}`, description: detail },
    vscode.CompletionItemKind.Property,
  );
  item.detail = "Dynamic HTMX attribute";
  item.range = range;
  item.insertText = new vscode.SnippetString(snippet);
  item.filterText = label;
  item.sortText = `3-${label}`;
  deferDocumentation(item, () =>
    documentationMarkdown({
      name: label,
      description: detail,
      versions,
      documentation,
      categories,
      mode,
      examples,
    }),
  );
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

function partialTagCompletionItems(
  document: vscode.TextDocument,
  offset: number,
): vscode.CompletionItem[] | undefined {
  const textBefore = document.getText().slice(0, offset);
  const tagStart = textBefore.lastIndexOf("{%");
  if (tagStart < textBefore.lastIndexOf("%}")) {
    return undefined;
  }
  const active = textBefore.slice(tagStart);
  const match = active.match(/^\{%\s*([A-Za-z]*)$/);
  if (match === null) {
    return undefined;
  }
  const prefix = match[1];
  const range = new vscode.Range(document.positionAt(offset - prefix.length), document.positionAt(offset));
  const leadingSpace = active === "{%" ? " " : "";
  const completions = [
    ["partialdef", "partialdef ${1:partial_name} %}\n  $0\n{% endpartialdef %}", "Define a Django partial"],
    [
      "partialdef … inline",
      "partialdef ${1:partial_name} inline %}\n  $0\n{% endpartialdef %}",
      "Define and render an inline Django partial",
    ],
    ["partial", "partial ${1:partial_name} %}", "Render a Django partial"],
    ["endpartialdef", "endpartialdef %}", "Close a Django partial definition"],
  ] as const;
  return completions.map(([label, snippet, detail], index) => {
    const item = new vscode.CompletionItem(label, vscode.CompletionItemKind.Keyword);
    item.detail = detail;
    item.filterText = label.replace(" …", "");
    item.insertText = new vscode.SnippetString(`${leadingSpace}${snippet}`);
    item.range = range;
    item.sortText = `0-${index}`;
    return item;
  });
}

interface ResolvedPartialDefinition {
  document: vscode.TextDocument;
  definition: PartialDefinition;
  workspacePath: string;
}

/**
 * Cache of resolved cross-file template partials keyed by normalized template name.
 * Template-partial completion and definition run on every keystroke inside an
 * `include`/`render` string, so without this each request re-globs the workspace and
 * re-opens every candidate file. The cache is cleared by a file-system watcher on any
 * HTML or Python change so results never go stale.
 */
const templatePartialCache = new Map<string, ResolvedPartialDefinition[]>();

function clearTemplatePartialCache(): void {
  templatePartialCache.clear();
}

function escapeGlobSegment(value: string): string {
  return value.replace(/[?*\[\]{}]/g, (character) => {
    if (character === "[") {
      return "[[]";
    }
    if (character === "]") {
      return "[]]";
    }
    return `[${character}]`;
  });
}

async function resolveTemplatePartials(
  templateName: string,
  token: vscode.CancellationToken,
): Promise<ResolvedPartialDefinition[]> {
  const normalized = templateName.replace(/\\/g, "/").replace(/^(\.\/)+/, "");
  const parts = normalized.split("/");
  const basename = parts.at(-1);
  if (basename === undefined || basename === "" || normalized.startsWith("/") || parts.includes("..")) {
    return [];
  }
  const cached = templatePartialCache.get(normalized);
  if (cached !== undefined) {
    return cached;
  }
  const uris = await vscode.workspace.findFiles(
    `**/${escapeGlobSegment(normalized)}`,
    undefined,
    TEMPLATE_FINDFILES_LIMIT,
    token,
  );
  const suffix = `/${normalized}`;
  const matches = uris
    .filter((uri) => uri.path === normalized || uri.path.endsWith(suffix))
    .sort((left, right) => left.toString().localeCompare(right.toString()));
  const resolved: ResolvedPartialDefinition[] = [];
  for (const uri of matches) {
    if (token.isCancellationRequested) {
      return [];
    }
    const document = await vscode.workspace.openTextDocument(uri);
    const workspacePath = vscode.workspace.asRelativePath(uri, false);
    for (const definition of getScan(document).partialDefinitions) {
      resolved.push({ document, definition, workspacePath });
    }
  }
  if (token.isCancellationRequested) {
    return resolved;
  }
  templatePartialCache.set(normalized, resolved);
  return resolved;
}

async function templatePartialCompletionItems(
  document: vscode.TextDocument,
  offset: number,
  token: vscode.CancellationToken,
): Promise<vscode.CompletionItem[] | undefined> {
  if (document.languageId !== "django-html" && document.languageId !== "python") {
    return undefined;
  }
  const reference = templatePartialReferenceAtOffset(document.getText(), document.languageId, offset);
  if (reference === undefined) {
    return undefined;
  }
  const definitions = await resolveTemplatePartials(reference.templateName, token);
  const byName = new Map<string, ResolvedPartialDefinition[]>();
  for (const definition of definitions) {
    const matches = byName.get(definition.definition.name) ?? [];
    matches.push(definition);
    byName.set(definition.definition.name, matches);
  }
  const range = new vscode.Range(
    document.positionAt(reference.nameStart),
    document.positionAt(reference.nameEnd),
  );
  return [...byName.entries()].map(([name, matches]) => {
    const paths = [...new Set(matches.map((match) => match.workspacePath))];
    const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Reference);
    item.detail = `Django partial${matches.some((match) => match.definition.inline) ? " · inline" : ""} · ${paths.join(", ")}`;
    item.range = range;
    item.sortText = `0-${name}`;
    return item;
  });
}

async function provideDefinitions(
  document: vscode.TextDocument,
  position: vscode.Position,
  token: vscode.CancellationToken,
): Promise<vscode.Location[] | undefined> {
  const text = document.getText();
  const offset = document.offsetAt(position);
  if (document.languageId === "django-html") {
    const scan = getScan(document);
    const reference = scan.partialReferences.find(
      (partial) => offset >= partial.nameStart && offset <= partial.nameEnd,
    );
    if (reference !== undefined) {
      return scan.partialDefinitions
        .filter((definition) => definition.name === reference.name)
        .map(
          (definition) =>
            new vscode.Location(
              document.uri,
              new vscode.Range(document.positionAt(definition.nameStart), document.positionAt(definition.nameEnd)),
            ),
        );
    }
  }
  if (document.languageId !== "django-html" && document.languageId !== "python") {
    return undefined;
  }
  const reference = templatePartialReferenceAtOffset(text, document.languageId, offset);
  if (reference === undefined || reference.name === "") {
    return undefined;
  }
  const definitions = await resolveTemplatePartials(reference.templateName, token);
  const locations = definitions
    .filter((candidate) => candidate.definition.name === reference.name)
    .map(
      (candidate) =>
        new vscode.Location(
          candidate.document.uri,
          new vscode.Range(
            candidate.document.positionAt(candidate.definition.nameStart),
            candidate.document.positionAt(candidate.definition.nameEnd),
          ),
        ),
    );
  return locations.length === 0 ? undefined : locations;
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
  const resolved = catalog.resolve(attribute.name);
  if (resolved?.attribute?.values === undefined) {
    return undefined;
  }
  const entry = resolved.attribute;
  const mode = versionMode(document);
  const beforeCursor = document.getText().slice(attribute.valueStart, offset);
  let values = valuesForMode(entry.values, mode);
  let start = attribute.valueStart;
  let used: string[] = [];

  if (resolved.canonicalName === "hx-swap") {
    const tokens = beforeCursor.trim().split(/\s+/).filter(Boolean);
    const strategyChosen = values.some(
      (value) => value.kind === "strategy" && value.name === tokens[0],
    );
    if (strategyChosen && (/\s$/.test(beforeCursor) || tokens.length > 1)) {
      values = values.filter((value) => value.kind === "modifier");
      start = attribute.valueStart + (beforeCursor.search(/\S+$/) < 0 ? beforeCursor.length : beforeCursor.search(/\S+$/));
      used = tokens.slice(1);
    } else {
      values = values.filter((value) => value.kind === "strategy");
      start += beforeCursor.search(/\S|$/);
    }
  } else if (resolved.canonicalName === "hx-trigger") {
    const clauseStart = beforeCursor.lastIndexOf(",") + 1;
    const clause = beforeCursor.slice(clauseStart);
    const tokens = clause.trim().split(/\s+/).filter(Boolean);
    if (tokens.length > 0 && (/\s$/.test(clause) || tokens.length > 1)) {
      values = values.filter((value) => value.kind === "modifier");
      start = attribute.valueStart + clauseStart + (clause.search(/\S+$/) < 0 ? clause.length : clause.search(/\S+$/));
      used = tokens.slice(1);
    } else {
      values = values.filter((value) => value.kind === "event");
      start = attribute.valueStart + clauseStart + clause.search(/\S|$/);
    }
  } else if (resolved.canonicalName === "hx-ext") {
    const segmentStart = beforeCursor.lastIndexOf(",") + 1;
    const segment = beforeCursor.slice(segmentStart);
    start = attribute.valueStart + segmentStart + segment.search(/\S|$/);
    used = beforeCursor
      .slice(0, segmentStart)
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  } else if (resolved.canonicalName === "hx-disinherit") {
    values = [...values, ...catalog.disinheritCandidates(mode)];
    const segment = beforeCursor.split(/[\s,]/).at(-1) ?? "";
    start = offset - segment.length;
    used = beforeCursor.split(/[\s,]/).filter(Boolean);
  } else if (!entry.strictValues && !["hx-target", "hx-sync", "hx-params", "hx-swap-oob"].includes(resolved.canonicalName)) {
    const segment = beforeCursor.split(/[\s,]/).at(-1) ?? "";
    start = offset - segment.length;
  }

  values = values.filter(
    (value) => !used.some((token) => token === value.name || token.startsWith(value.name)),
  );
  const range = new vscode.Range(document.positionAt(start), document.positionAt(offset));
  return values.map((value, index) => {
    const versions = value.versions ?? entry.versions;
    const item = new vscode.CompletionItem(
      { label: value.name, description: value.description },
      completionKind(value.kind),
    );
    item.detail = `${valueKindLabel(value.kind)} · ${versionsLabel(versions)}`;
    item.range = range;
    item.insertText = new vscode.SnippetString(value.insertText ?? value.name);
    item.filterText = value.name;
    item.sortText = index.toString().padStart(2, "0");
    item.preselect = index === 0;
    deferDocumentation(item, () =>
      documentationMarkdown({
        name: `${attribute.name}=\"${value.name}\"`,
        description: value.description,
        versions,
        documentation: entry.documentation,
        categories: entry.categories,
        relatedDocumentation: value.documentation,
        mode,
        example: valueExample(attribute.name, value),
      }),
    );
    return item;
  });
}

async function provideCompletions(
  catalog: CatalogIndex,
  document: vscode.TextDocument,
  position: vscode.Position,
  token: vscode.CancellationToken,
): Promise<vscode.CompletionItem[] | undefined> {
  if (!configuration(document).get("enableCompletion", true)) {
    return undefined;
  }
  const text = document.getText();
  const offset = document.offsetAt(position);
  const scan = getScan(document);
  if (document.languageId === "django-html") {
    const templatePartials = await templatePartialCompletionItems(document, offset, token);
    if (templatePartials !== undefined) {
      return templatePartials;
    }
    const partials = partialCompletionItems(document, offset, scan);
    if (partials !== undefined) {
      return partials;
    }
    const tags = partialTagCompletionItems(document, offset);
    if (tags !== undefined) {
      return tags;
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
  const mode = versionMode(document);
  const entries = catalog.list(mode);
  const items = entries.map((entry) => {
    const spelling = dataAlias ? `data-${entry.name}` : entry.name;
    return attributeCompletion(entry, spelling, range, !assignmentExists, mode);
  });

  const alias = dataAlias ? "data-" : "";
  const pattern = (name: string) => catalog.data.patterns.find((entry) => entry.name === name);
  const hxOn = pattern("hx-on:<event>");
  if (hxOn !== undefined) {
  items.push(
    dynamicCompletion(
      `${alias}hx-on:<event>`,
      `${alias}hx-on:\${1:event}=\"$0\"`,
      "Handle a DOM event inline",
      range,
        mode,
        hxOn.versions,
        hxOn.documentation,
        hxOn.examples,
        hxOn.categories,
      ),
    dynamicCompletion(
      `${alias}hx-on::<event>`,
      `${alias}hx-on::\${1:before-request}=\"$0\"`,
      "Handle an HTMX event inline",
      range,
        mode,
        hxOn.versions,
        hxOn.documentation,
        hxOn.examples,
        hxOn.categories,
      ),
  );
  }
  if (mode !== "4") {
    const responseTargets = pattern("hx-target-<status>");
    if (responseTargets !== undefined) {
    items.push(
      dynamicCompletion(
        `${alias}hx-target-<status>`,
        `${alias}hx-target-\${1:4*}=\"\${2:#errors}\"`,
        "Response Targets extension",
        range,
          mode,
          responseTargets.versions,
          responseTargets.documentation,
          responseTargets.examples,
          responseTargets.categories,
      ),
    );
    }
  }
  if (mode !== "2") {
    const status = pattern("hx-status:<status>");
    if (status !== undefined) {
    items.push(
      dynamicCompletion(
        `${alias}hx-status:<status>`,
        `${alias}hx-status:\${1:422}=\"\${2:target:#errors}\"`,
        "HTMX 4 status-specific response handling",
        range,
          mode,
          status.versions,
          status.documentation,
          status.examples,
          status.categories,
      ),
    );
    }
  }

  for (const entry of entries) {
    for (const modifier of entry.modifiers ?? []) {
      const spelling = `${alias}${entry.name}:${modifier}`;
      const item = attributeCompletion(entry, spelling, range, !assignmentExists, mode);
      item.sortText = `30-${spelling}`;
      items.push(item);
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
  const scan = getScan(document);
  const attribute = attributeAtOffset(scan, offset);
  if (attribute !== undefined && offset >= attribute.nameStart && offset <= attribute.nameEnd) {
    const resolved = catalog.resolve(attribute.name);
    if (resolved === undefined) {
      return undefined;
    }
    const markdown = documentationMarkdown({
      name: attribute.name,
      description: resolved.description,
      versions: resolved.versions,
      documentation: resolved.documentation,
      categories: resolved.categories,
      mode: versionMode(document),
      values: resolved.attribute?.values,
      modifier: resolved.modifier,
      examples: resolved.examples,
    });
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

function partialNameRange(document: vscode.TextDocument, position: vscode.Position): vscode.Range | undefined {
  if (document.languageId !== "django-html") {
    return undefined;
  }
  const scan = getScan(document);
  const target = partialAtOffset(scan, document.offsetAt(position));
  if (target === undefined) {
    return undefined;
  }
  return new vscode.Range(document.positionAt(target.nameStart), document.positionAt(target.nameEnd));
}

function provideReferences(
  document: vscode.TextDocument,
  position: vscode.Position,
  context: vscode.ReferenceContext,
): vscode.Location[] | undefined {
  if (document.languageId !== "django-html") {
    return undefined;
  }
  const scan = getScan(document);
  const target = partialAtOffset(scan, document.offsetAt(position));
  if (target === undefined) {
    return undefined;
  }
  const spans = partialSpansByName(scan, target.name).filter(
    (span) => context.includeDeclaration || span.kind !== "definition",
  );
  return spans.map(
    (span) => new vscode.Location(document.uri, new vscode.Range(document.positionAt(span.start), document.positionAt(span.end))),
  );
}

function provideRenameEdits(
  document: vscode.TextDocument,
  position: vscode.Position,
  newName: string,
): vscode.WorkspaceEdit | undefined {
  if (document.languageId !== "django-html") {
    return undefined;
  }
  if (!/^[\w-]+$/.test(newName)) {
    throw new Error("A Django partial name may only contain letters, numbers, underscores, and hyphens.");
  }
  const scan = getScan(document);
  const target = partialAtOffset(scan, document.offsetAt(position));
  if (target === undefined) {
    return undefined;
  }
  const edit = new vscode.WorkspaceEdit();
  for (const span of partialSpansByName(scan, target.name)) {
    edit.replace(
      document.uri,
      new vscode.Range(document.positionAt(span.start), document.positionAt(span.end)),
      newName,
    );
  }
  return edit;
}

function provideCodeActions(
  catalog: CatalogIndex,
  document: vscode.TextDocument,
  context: vscode.CodeActionContext,
): vscode.CodeAction[] {
  const relevant = context.diagnostics.filter(
    (diagnostic): diagnostic is vscode.Diagnostic & { code: string } =>
      diagnostic.source === DIAGNOSTIC_SOURCE && typeof diagnostic.code === "string",
  );
  if (relevant.length === 0) {
    return [];
  }
  const scan = getScan(document);
  const diagnosticLikes = relevant.map((diagnostic) => ({
    code: diagnostic.code,
    message: diagnostic.message,
    start: document.offsetAt(diagnostic.range.start),
    end: document.offsetAt(diagnostic.range.end),
  }));
  return computeQuickFixes(document.getText(), diagnosticLikes, catalog, scan).map((fix) => {
    const action = new vscode.CodeAction(fix.title, vscode.CodeActionKind.QuickFix);
    const edit = new vscode.WorkspaceEdit();
    for (const change of fix.edits) {
      edit.replace(
        document.uri,
        new vscode.Range(document.positionAt(change.start), document.positionAt(change.end)),
        change.newText,
      );
    }
    action.edit = edit;
    action.diagnostics = [relevant[fix.diagnosticIndex]];
    if (fix.isPreferred === true) {
      action.isPreferred = true;
    }
    return action;
  });
}

export function activate(context: vscode.ExtensionContext): void {
  let catalog: CatalogIndex;
  try {
    catalog = loadCatalog(context.asAbsolutePath("htmx.catalog.json"));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(
      `HTMX Tags could not load its catalog and is disabled for this session: ${detail}`,
    );
    return;
  }
  const diagnostics = vscode.languages.createDiagnosticCollection(DIAGNOSTIC_SOURCE);
  const timers = new Map<string, NodeJS.Timeout>();
  const partialWatcher = vscode.workspace.createFileSystemWatcher("**/*.{html,py}");
  partialWatcher.onDidChange(clearTemplatePartialCache);
  partialWatcher.onDidCreate(clearTemplatePartialCache);
  partialWatcher.onDidDelete(clearTemplatePartialCache);

  const updateDiagnostics = (document: vscode.TextDocument): void => {
    if (!DOCUMENT_SELECTOR.some((selector) => typeof selector !== "string" && selector.language === document.languageId)) {
      return;
    }
    if (!configuration(document).get("enableValidation", true)) {
      diagnostics.delete(document.uri);
      return;
    }
    const entries = analyzeDocument(
      document.getText(),
      document.languageId,
      catalog,
      versionMode(document),
      getScan(document),
    ).map((issue) => {
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

  const copyExample = async (argument: unknown): Promise<void> => {
    if (
      typeof argument !== "object" ||
      argument === null ||
      !("text" in argument) ||
      typeof argument.text !== "string" ||
      argument.text.length === 0 ||
      argument.text.length > 20_000
    ) {
      return;
    }
    await vscode.env.clipboard.writeText(argument.text);
    vscode.window.setStatusBarMessage("HTMX example copied", 2_000);
  };

  context.subscriptions.push(
    diagnostics,
    partialWatcher,
    vscode.languages.registerCompletionItemProvider(
      DOCUMENT_SELECTOR,
      {
        provideCompletionItems: (document, position, token) => provideCompletions(catalog, document, position, token),
        resolveCompletionItem: (item) => {
          item.documentation = COMPLETION_DOCUMENTATION.get(item)?.();
          return item;
        },
      },
      "-",
      ":",
      "\"",
      "'",
      "%",
      " ",
      "#",
    ),
    vscode.languages.registerCompletionItemProvider(
      PYTHON_SELECTOR,
      {
        provideCompletionItems: async (document, position, token) => {
          if (!configuration(document).get("enableCompletion", true)) {
            return undefined;
          }
          return templatePartialCompletionItems(document, document.offsetAt(position), token);
        },
      },
      "#",
    ),
    vscode.languages.registerDefinitionProvider(PARTIAL_SELECTOR, {
      provideDefinition: (document, position, token) => provideDefinitions(document, position, token),
    }),
    vscode.languages.registerHoverProvider(DOCUMENT_SELECTOR, {
      provideHover: (document, position) => provideHover(catalog, document, position),
    }),
    vscode.languages.registerCodeActionsProvider(
      DOCUMENT_SELECTOR,
      {
        provideCodeActions: (document, _range, context) => provideCodeActions(catalog, document, context),
      },
      { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] },
    ),
    vscode.languages.registerReferenceProvider(
      { language: "django-html" },
      { provideReferences: (document, position, context) => provideReferences(document, position, context) },
    ),
    vscode.languages.registerRenameProvider(
      { language: "django-html" },
      {
        provideRenameEdits: (document, position, newName) => provideRenameEdits(document, position, newName),
        prepareRename: (document, position) => {
          const range = partialNameRange(document, position);
          if (range === undefined) {
            throw new Error("Only Django partial names can be renamed here.");
          }
          return range;
        },
      },
    ),
    vscode.commands.registerCommand(COPY_EXAMPLE_COMMAND, copyExample),
    vscode.commands.registerCommand(OPEN_SETTINGS_COMMAND, () =>
      vscode.commands.executeCommand("workbench.action.openSettings", "@ext:difegam.htmx-tags-django"),
    ),
    vscode.workspace.onDidOpenTextDocument(updateDiagnostics),
    vscode.workspace.onDidChangeTextDocument((event) => scheduleDiagnostics(event.document)),
    vscode.workspace.onDidCloseTextDocument((document) => {
      const key = document.uri.toString();
      const timer = timers.get(key);
      if (timer !== undefined) {
        clearTimeout(timer);
        timers.delete(key);
      }
      evictScan(document);
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
