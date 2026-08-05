import { readFileSync } from "node:fs";

export type HtmxVersionMode = "compatible" | "2" | "4";
export type HtmxMajor = "2" | "4";
export type CatalogValueKind = "value" | "strategy" | "event" | "modifier" | "extension" | "attribute";
export type CatalogCategories = Partial<Record<HtmxMajor, string>>;

export interface CatalogValue {
  name: string;
  description: string;
  insertText?: string;
  versions?: HtmxMajor[];
  kind?: CatalogValueKind;
  documentation?: string;
}

export interface CatalogAttribute {
  name: string;
  description: string;
  versions: HtmxMajor[];
  documentation: Partial<Record<HtmxMajor, string>>;
  categories: CatalogCategories;
  values?: CatalogValue[];
  strictValues?: boolean;
  modifiers?: string[];
  deprecated?: string;
  examples?: Partial<Record<HtmxMajor, string>>;
}

export interface CatalogPattern {
  name: string;
  pattern: string;
  description: string;
  versions: HtmxMajor[];
  documentation: Partial<Record<HtmxMajor, string>>;
  categories?: CatalogCategories;
  examples?: Partial<Record<HtmxMajor, string>>;
}

export interface CatalogData {
  schemaVersion: number;
  generatedFrom: { htmx2: string; htmx4: string };
  attributes: CatalogAttribute[];
  patterns: CatalogPattern[];
}

export interface ResolvedAttribute {
  canonicalName: string;
  displayName: string;
  versions: HtmxMajor[];
  description: string;
  documentation: Partial<Record<HtmxMajor, string>>;
  categories?: CatalogCategories;
  examples?: Partial<Record<HtmxMajor, string>>;
  attribute?: CatalogAttribute;
  modifier?: string;
  pattern?: CatalogPattern;
}

export function normalizeAttributeName(name: string): string {
  const lower = name.toLowerCase();
  return lower.startsWith("data-hx-") ? lower.slice(5) : lower;
}

export class CatalogIndex {
  readonly data: CatalogData;
  private readonly attributes: Map<string, CatalogAttribute>;
  private readonly patterns: Array<{ entry: CatalogPattern; regex: RegExp }>;
  private readonly listsByMode = new Map<HtmxVersionMode, CatalogAttribute[]>();
  private readonly disinheritByMode = new Map<HtmxVersionMode, CatalogValue[]>();

  constructor(data: CatalogData) {
    if (data.schemaVersion !== 2 || !Array.isArray(data.attributes) || !Array.isArray(data.patterns)) {
      throw new Error("Unsupported HTMX catalog format");
    }
    this.data = data;
    this.attributes = new Map(data.attributes.map((entry) => [entry.name, entry]));
    this.patterns = data.patterns.map((entry) => ({ entry, regex: new RegExp(entry.pattern, "i") }));
  }

  resolve(rawName: string): ResolvedAttribute | undefined {
    const canonicalName = normalizeAttributeName(rawName);
    const exact = this.attributes.get(canonicalName);
    if (exact !== undefined) {
      return this.fromAttribute(rawName, canonicalName, exact);
    }

    for (const { entry, regex } of this.patterns) {
      if (regex.test(canonicalName)) {
        return {
          canonicalName,
          displayName: rawName,
          versions: entry.versions,
          description: entry.description,
          documentation: entry.documentation,
          categories: entry.categories,
          examples: entry.examples,
          pattern: entry,
        };
      }
    }

    const separator = canonicalName.lastIndexOf(":");
    if (separator > 2) {
      const baseName = canonicalName.slice(0, separator);
      const modifier = canonicalName.slice(separator + 1);
      const base = this.attributes.get(baseName);
      if (base?.modifiers?.includes(modifier) === true) {
        return {
          ...this.fromAttribute(rawName, baseName, base),
          canonicalName,
          modifier,
        };
      }
    }
    return undefined;
  }

  list(mode: HtmxVersionMode): CatalogAttribute[] {
    const cached = this.listsByMode.get(mode);
    if (cached !== undefined) {
      return cached;
    }
    const result =
      mode === "compatible"
        ? this.data.attributes
        : this.data.attributes.filter((entry) => entry.versions.includes(mode));
    this.listsByMode.set(mode, result);
    return result;
  }

  /**
   * Synthesized {@link CatalogValue} entries for `hx-disinherit` completions: each
   * catalog attribute becomes a disinheritable suggestion. Precomputed per mode
   * because the catalog never changes after load and `valueCompletionItems` runs
   * on nearly every keystroke.
   */
  disinheritCandidates(mode: HtmxVersionMode): CatalogValue[] {
    const cached = this.disinheritByMode.get(mode);
    if (cached !== undefined) {
      return cached;
    }
    const result: CatalogValue[] = this.list(mode).map((candidate) => ({
      name: candidate.name,
      description: `Disable inheritance of ${candidate.name}`,
      versions: candidate.versions,
      kind: "attribute",
    }));
    this.disinheritByMode.set(mode, result);
    return result;
  }

  private fromAttribute(
    displayName: string,
    canonicalName: string,
    attribute: CatalogAttribute,
  ): ResolvedAttribute {
    return {
      canonicalName,
      displayName,
      versions: attribute.versions,
      description: attribute.description,
      documentation: attribute.documentation,
      categories: attribute.categories,
      examples: attribute.examples,
      attribute,
    };
  }
}

export function loadCatalog(path: string): CatalogIndex {
  return new CatalogIndex(JSON.parse(readFileSync(path, "utf8")) as CatalogData);
}
