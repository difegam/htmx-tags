import type { ExtensionContext } from "vscode";

/**
 * The extension is declarative: HTML custom data is loaded via package.json.
 * Keep activate/deactivate light to reduce maintenance burden.
 */
export function activate(_context: ExtensionContext): void {
  // No-op by design.
}

export function deactivate(): void {
  // No-op by design.
}
