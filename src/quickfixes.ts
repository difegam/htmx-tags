import type { CatalogIndex } from "./catalog.js";
import type { ScanResult } from "./scanner.js";

export interface DiagnosticLike {
  code: string;
  message: string;
  start: number;
  end: number;
}

export interface QuickFixEdit {
  start: number;
  end: number;
  newText: string;
}

export interface QuickFix {
  title: string;
  diagnosticIndex: number;
  edits: QuickFixEdit[];
  isPreferred?: boolean;
}

/** Classic Levenshtein edit distance, used to rank "did you mean" suggestions. */
export function editDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  let previous = Array.from({ length: cols }, (_value, index) => index);
  let current = new Array<number>(cols);
  for (let row = 1; row < rows; row++) {
    current[0] = row;
    for (let col = 1; col < cols; col++) {
      const cost = a[row - 1] === b[col - 1] ? 0 : 1;
      current[col] = Math.min(previous[col] + 1, current[col - 1] + 1, previous[col - 1] + cost);
    }
    [previous, current] = [current, previous];
  }
  return previous[cols - 1];
}

function nearestNames(target: string, candidates: readonly string[], limit = 3): string[] {
  return candidates
    .map((name) => ({ name, distance: editDistance(target, name) }))
    .filter((entry) => entry.distance > 0 && entry.distance <= Math.max(2, Math.floor(entry.name.length / 3)))
    .sort((left, right) => left.distance - right.distance || left.name.localeCompare(right.name))
    .slice(0, limit)
    .map((entry) => entry.name);
}

function unknownAttributeFixes(
  diagnostic: DiagnosticLike,
  index: number,
  text: string,
  catalog: CatalogIndex,
): QuickFix[] {
  const raw = text.slice(diagnostic.start, diagnostic.end).toLowerCase();
  const prefix = raw.startsWith("data-") ? "data-" : "";
  const canonical = prefix === "" ? raw : raw.slice(prefix.length);
  const names = catalog.data.attributes.map((attribute) => attribute.name);
  return nearestNames(canonical, names).map((name, position) => ({
    title: `Replace with '${prefix}${name}'`,
    diagnosticIndex: index,
    edits: [{ start: diagnostic.start, end: diagnostic.end, newText: `${prefix}${name}` }],
    isPreferred: position === 0,
  }));
}

function deprecatedAttributeFixes(diagnostic: DiagnosticLike, index: number): QuickFix[] {
  const successor = /\buse\s+(hx-[a-z0-9-]+)/i.exec(diagnostic.message);
  if (successor === null) {
    return [];
  }
  return [
    {
      title: `Replace with '${successor[1]}'`,
      diagnosticIndex: index,
      edits: [{ start: diagnostic.start, end: diagnostic.end, newText: successor[1] }],
      isPreferred: true,
    },
  ];
}

function invalidValueFixes(
  diagnostic: DiagnosticLike,
  index: number,
  catalog: CatalogIndex,
  scan: ScanResult,
): QuickFix[] {
  const attribute = scan.attributes.find(
    (candidate) => candidate.valueStart === diagnostic.start && candidate.valueEnd === diagnostic.end,
  );
  if (attribute === undefined) {
    return [];
  }
  const values = catalog.resolve(attribute.name)?.attribute?.values ?? [];
  return values.map((value) => ({
    title: `Replace with '${value.name}'`,
    diagnosticIndex: index,
    edits: [{ start: diagnostic.start, end: diagnostic.end, newText: value.name }],
    isPreferred: values.length === 1,
  }));
}

function unknownPartialFixes(
  diagnostic: DiagnosticLike,
  index: number,
  text: string,
  scan: ScanResult,
): QuickFix[] {
  const name = text.slice(diagnostic.start, diagnostic.end);
  const definitions = scan.partialDefinitions.map((definition) => definition.name);
  const fixes: QuickFix[] = nearestNames(name, definitions).map((candidate, position) => ({
    title: `Replace with '${candidate}'`,
    diagnosticIndex: index,
    edits: [{ start: diagnostic.start, end: diagnostic.end, newText: candidate }],
    isPreferred: position === 0,
  }));
  const trailingNewline = text.endsWith("\n") ? "" : "\n";
  fixes.push({
    title: `Create '{% partialdef ${name} %}'`,
    diagnosticIndex: index,
    edits: [
      {
        start: text.length,
        end: text.length,
        newText: `${trailingNewline}{% partialdef ${name} %}\n\n{% endpartialdef %}\n`,
      },
    ],
  });
  return fixes;
}

/**
 * Produce quick-fix descriptors for the extension's own diagnostics. Kept free of the
 * `vscode` API so the mapping logic can be unit tested; `extension.ts` adapts the
 * descriptors into `vscode.CodeAction`s.
 */
export function computeQuickFixes(
  text: string,
  diagnostics: readonly DiagnosticLike[],
  catalog: CatalogIndex,
  scan: ScanResult,
): QuickFix[] {
  const fixes: QuickFix[] = [];
  diagnostics.forEach((diagnostic, index) => {
    switch (diagnostic.code) {
      case "unknown-attribute":
        fixes.push(...unknownAttributeFixes(diagnostic, index, text, catalog));
        break;
      case "deprecated-attribute":
        fixes.push(...deprecatedAttributeFixes(diagnostic, index));
        break;
      case "invalid-value":
        fixes.push(...invalidValueFixes(diagnostic, index, catalog, scan));
        break;
      case "unknown-partial":
        fixes.push(...unknownPartialFixes(diagnostic, index, text, scan));
        break;
      default:
        break;
    }
  });
  return fixes;
}
