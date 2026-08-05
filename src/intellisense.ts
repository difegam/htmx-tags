import * as vscode from "vscode";

import {
  type CatalogCategories,
  type CatalogValue,
  type CatalogValueKind,
  type HtmxMajor,
  type HtmxVersionMode,
} from "./catalog.js";

export const COPY_EXAMPLE_COMMAND = "htmxTags.copyExample";
export const OPEN_SETTINGS_COMMAND = "htmxTags.openSettings";

export interface DocumentationSubject {
  name: string;
  description: string;
  versions: readonly HtmxMajor[];
  documentation: Readonly<Partial<Record<HtmxMajor, string>>>;
  categories?: Readonly<CatalogCategories>;
  mode: HtmxVersionMode;
  values?: readonly CatalogValue[];
  modifier?: string;
  examples?: Readonly<Partial<Record<HtmxMajor, string>>>;
  example?: string;
  relatedDocumentation?: string;
}

export function versionsLabel(versions: readonly string[]): string {
  return `HTMX ${versions.join(" & ")}`;
}

function categoryEntries(
  categories: Readonly<CatalogCategories> | undefined,
  mode: HtmxVersionMode,
  versions: readonly HtmxMajor[],
): Array<[HtmxMajor, string]> {
  const candidates: readonly HtmxMajor[] = mode === "compatible" ? ["2", "4"] : [mode];
  const majors = candidates.filter((major) => versions.includes(major));
  return majors.flatMap((major) => {
    const category = categories?.[major];
    return category === undefined ? [] : [[major, category]];
  });
}

export function attributeMetadataLabel(
  categories: Readonly<CatalogCategories> | undefined,
  versions: readonly HtmxMajor[],
  mode: HtmxVersionMode,
): string {
  const entries = categoryEntries(categories, mode, versions);
  if (entries.length === 0) {
    return versionsLabel(versions);
  }
  if (mode !== "compatible") {
    return `${entries[0][1]} Attribute · HTMX ${entries[0][0]}`;
  }
  return entries.map(([major, category]) => `HTMX ${major}: ${category}`).join(" · ");
}

export function valuesForMode(
  values: readonly CatalogValue[] | undefined,
  mode: HtmxVersionMode,
): CatalogValue[] {
  if (values === undefined) {
    return [];
  }
  return values.filter(
    (value) => mode === "compatible" || value.versions === undefined || value.versions.includes(mode),
  );
}

export function exampleForMode(
  examples: Readonly<Partial<Record<HtmxMajor, string>>> | undefined,
  mode: HtmxVersionMode,
): string | undefined {
  if (examples === undefined) {
    return undefined;
  }
  if (mode !== "compatible") {
    return examples[mode];
  }
  return examples["4"] ?? examples["2"];
}

export function completionKind(kind: CatalogValueKind | undefined): vscode.CompletionItemKind {
  switch (kind) {
    case "event":
      return vscode.CompletionItemKind.Event;
    case "modifier":
      return vscode.CompletionItemKind.Keyword;
    case "extension":
      return vscode.CompletionItemKind.Module;
    case "attribute":
      return vscode.CompletionItemKind.Property;
    case "strategy":
      return vscode.CompletionItemKind.EnumMember;
    default:
      return vscode.CompletionItemKind.Value;
  }
}

export function valueKindLabel(kind: CatalogValueKind | undefined): string {
  switch (kind) {
    case "event":
      return "Event";
    case "modifier":
      return "Modifier";
    case "extension":
      return "Extension";
    case "attribute":
      return "Attribute";
    case "strategy":
      return "Strategy";
    default:
      return "Value";
  }
}

export function snippetPreview(value: string): string {
  return value
    .replace(/\$\{\d+\|([^}]+)\|\}/g, (_match, choices: string) => choices.split(",")[0] ?? "")
    .replace(/\$\{\d+:([^}]+)\}/g, "$1")
    .replace(/\$\d+/g, "");
}

export function valueExample(attributeName: string, value: CatalogValue): string {
  return `<div ${attributeName}="${snippetPreview(value.insertText ?? value.name)}"></div>`;
}

function tableCell(value: string): string {
  return value.replace(/\r?\n/g, " ").replace(/\\/g, "\\\\").replace(/\|/g, "\\|");
}

function code(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/`/g, "\\`");
}

function commandUri(command: string, args?: unknown[]): string {
  const query = args === undefined ? "" : `?${encodeURIComponent(JSON.stringify(args))}`;
  return `command:${command}${query}`;
}

export function documentationMarkdown(subject: DocumentationSubject): vscode.MarkdownString {
  const markdown = new vscode.MarkdownString(undefined, true);
  markdown.supportHtml = false;
  markdown.isTrusted = { enabledCommands: [COPY_EXAMPLE_COMMAND, OPEN_SETTINGS_COMMAND] };

  markdown.appendMarkdown(`### \`${code(subject.name)}\`\n\n`);
  markdown.appendMarkdown(`$(versions) **${versionsLabel(subject.versions)}**\n\n`);
  const categories = categoryEntries(subject.categories, subject.mode, subject.versions);
  if (categories.length > 0) {
    const label = categories
      .map(([major, category]) => `HTMX ${major}: ${category} Attribute`)
      .join(" · ");
    markdown.appendMarkdown(`$(symbol-enum) **${categories.length === 1 ? "Category" : "Categories"}:** ${label}\n\n`);
  }
  markdown.appendMarkdown(`${subject.description.trim()}\n\n`);

  if (subject.modifier !== undefined) {
    markdown.appendMarkdown(`**Modifier:** \`:${code(subject.modifier)}\`\n\n`);
  }

  const values = valuesForMode(subject.values, subject.mode);
  if (values.length > 0) {
    const shown = values.slice(0, 8);
    markdown.appendMarkdown("**Values and modifiers**\n\n| Syntax | Purpose |\n| --- | --- |\n");
    for (const value of shown) {
      markdown.appendMarkdown(`| \`${code(value.name)}\` | ${tableCell(value.description)} |\n`);
    }
    if (values.length > shown.length) {
      markdown.appendMarkdown(`\n*${values.length - shown.length} more available through completion.*\n`);
    }
    markdown.appendMarkdown("\n");
  }

  const example = subject.example ?? exampleForMode(subject.examples, subject.mode);
  if (example !== undefined) {
    markdown.appendMarkdown("**Example**\n\n");
    markdown.appendCodeblock(example, "html");
    markdown.appendMarkdown("\n");
  }

  const links = Object.entries(subject.documentation)
    .filter((entry): entry is [HtmxMajor, string] => entry[1] !== undefined)
    .sort(([left], [right]) => {
      if (subject.mode === "compatible") {
        return left.localeCompare(right);
      }
      return left === subject.mode ? -1 : right === subject.mode ? 1 : left.localeCompare(right);
    })
    .map(([major, url]) => `$(book) [HTMX ${major} docs](${url})`);
  if (subject.relatedDocumentation !== undefined && !Object.values(subject.documentation).includes(subject.relatedDocumentation)) {
    links.push(`$(link-external) [Value docs](${subject.relatedDocumentation})`);
  }
  if (example !== undefined) {
    links.push(
      `$(copy) [Copy example](${commandUri(COPY_EXAMPLE_COMMAND, [{ text: example }])})`,
    );
  }
  links.push(`$(settings-gear) [HTMX settings](${commandUri(OPEN_SETTINGS_COMMAND)})`);
  markdown.appendMarkdown(`---\n\n${links.join(" · ")}`);
  return markdown;
}
