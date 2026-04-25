import type { ExtensionContext } from "vscode";

/**
 * Declares the extension activation entry point; intentionally performs no runtime actions.
 *
 * The extension is declarative: HTML custom data and behavior are provided via package.json,
 * so activation logic is a no-op to minimize maintenance.
 */
export function activate(_context: ExtensionContext): void {
  // No-op by design.
}

/**
 * Lifecycle deactivation hook for the extension.
 *
 * Performs no teardown; intentionally left as an explicit no-op.
 */
export function deactivate(): void {
  // No-op by design.
}
