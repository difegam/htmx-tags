import path from "node:path";
import { spawnSync } from "node:child_process";

import {
  downloadAndUnzipVSCode,
  resolveCliArgsFromVSCodeExecutablePath,
  runTests,
} from "@vscode/test-electron";

async function main(): Promise<void> {
  const extensionDevelopmentPath = path.resolve(__dirname, "../..");
  const extensionTestsPath = path.resolve(__dirname, "suite/index");
  const vscodeExecutablePath = await downloadAndUnzipVSCode("1.90.2");
  const [cliPath, ...cliArgs] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);
  const install = spawnSync(
    cliPath,
    [...cliArgs, "--install-extension", "batisteo.vscode-django", "--force"],
    { stdio: "inherit" },
  );
  if (install.status !== 0) {
    throw new Error("Unable to install the Django extension into the VS Code test runtime");
  }
  await runTests({ extensionDevelopmentPath, extensionTestsPath, vscodeExecutablePath });
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
