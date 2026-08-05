import { scanDocument, type ScanResult } from "./scanner.js";

/**
 * Minimal shape of the parts of `vscode.TextDocument` the cache relies on, so the
 * cache can be unit tested without a VS Code runtime.
 */
export interface CacheableDocument {
  uri: { toString(): string };
  version: number;
  getText(): string;
}

const cache = new Map<string, { version: number; scan: ScanResult }>();

/**
 * Return a `ScanResult` for the document, reusing the cached scan while the document
 * version is unchanged. Providers run on nearly every keystroke, so avoiding a full
 * re-scan for hover, completion, and diagnostics on the same revision is a meaningful
 * saving on large templates.
 */
export function getScan(document: CacheableDocument): ScanResult {
  const key = document.uri.toString();
  const cached = cache.get(key);
  if (cached !== undefined && cached.version === document.version) {
    return cached.scan;
  }
  const scan = scanDocument(document.getText());
  cache.set(key, { version: document.version, scan });
  return scan;
}

export function evictScan(document: { uri: { toString(): string } }): void {
  cache.delete(document.uri.toString());
}

export function clearScanCache(): void {
  cache.clear();
}
