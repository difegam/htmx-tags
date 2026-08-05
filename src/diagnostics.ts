import type { CatalogIndex, HtmxVersionMode } from "./catalog.js";
import { scanDocument, type ScanResult } from "./scanner.js";

export type IssueSeverity = "warning" | "hint";

export interface AnalysisIssue {
  start: number;
  end: number;
  message: string;
  severity: IssueSeverity;
  code: string;
}

function containsTemplateExpression(value: string | undefined): boolean {
  return value?.includes("{{") === true || value?.includes("{%") === true;
}

export function analyzeDocument(
  text: string,
  languageId: string,
  catalog: CatalogIndex,
  mode: HtmxVersionMode,
  scan: ScanResult = scanDocument(text),
): AnalysisIssue[] {
  const issues: AnalysisIssue[] = [];

  for (const attribute of scan.attributes) {
    const lowerName = attribute.name.toLowerCase();
    if (!lowerName.startsWith("hx-") && !lowerName.startsWith("data-hx-")) {
      continue;
    }
    if (lowerName === "hx-" || lowerName === "data-hx-") {
      continue;
    }

    const resolved = catalog.resolve(lowerName);
    if (resolved === undefined) {
      issues.push({
        start: attribute.nameStart,
        end: attribute.nameEnd,
        message: `Unknown HTMX attribute '${attribute.name}'.`,
        severity: "warning",
        code: "unknown-attribute",
      });
      continue;
    }

    if (mode !== "compatible" && !resolved.versions.includes(mode)) {
      issues.push({
        start: attribute.nameStart,
        end: attribute.nameEnd,
        message: `'${attribute.name}' is available in HTMX ${resolved.versions.join("/")}, not HTMX ${mode}.`,
        severity: "hint",
        code: "version-mismatch",
      });
    } else if (mode !== "compatible" && resolved.attribute?.deprecated !== undefined) {
      issues.push({
        start: attribute.nameStart,
        end: attribute.nameEnd,
        message: resolved.attribute.deprecated,
        severity: "hint",
        code: "deprecated-attribute",
      });
    }

    const entry = resolved.attribute;
    if (
      entry?.strictValues === true &&
      attribute.value !== undefined &&
      attribute.valueClosed === true &&
      attribute.value.trim() !== "" &&
      !containsTemplateExpression(attribute.value)
    ) {
      const allowed = new Set(entry.values?.map((value) => value.name.toLowerCase()));
      if (!allowed.has(attribute.value.trim().toLowerCase())) {
        issues.push({
          start: attribute.valueStart ?? attribute.nameStart,
          end: attribute.valueEnd ?? attribute.nameEnd,
          message: `Invalid value for '${attribute.name}'. Expected ${[...allowed].join(", ")}.`,
          severity: "warning",
          code: "invalid-value",
        });
      }
    }
  }

  if (languageId === "django-html") {
    const definitions = new Map<string, number>();
    for (const definition of scan.partialDefinitions) {
      if (definitions.has(definition.name)) {
        issues.push({
          start: definition.nameStart,
          end: definition.nameEnd,
          message: `Duplicate Django partial '${definition.name}'.`,
          severity: "warning",
          code: "duplicate-partial",
        });
      } else {
        definitions.set(definition.name, definition.nameStart);
      }
    }
    for (const reference of scan.partialReferences) {
      if (!definitions.has(reference.name)) {
        issues.push({
          start: reference.nameStart,
          end: reference.nameEnd,
          message: `Unknown same-file Django partial '${reference.name}'.`,
          severity: "warning",
          code: "unknown-partial",
        });
      }
    }
  }

  return issues;
}
