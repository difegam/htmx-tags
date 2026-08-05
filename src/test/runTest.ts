import path from "node:path";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

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
  const workspacePath = mkdtempSync(path.join(tmpdir(), "htmx-tags-test-"));
  const templateA = path.join(workspacePath, "apps/a/templates/shared");
  const templateB = path.join(workspacePath, "apps/b/templates/shared");
  mkdirSync(templateA, { recursive: true });
  mkdirSync(templateB, { recursive: true });
  writeFileSync(
    path.join(templateA, "cards.html"),
    "{% partialdef card inline %}<article>A</article>{% endpartialdef %}\n{% partialdef row %}A{% endpartialdef %}\n",
  );
  writeFileSync(
    path.join(templateB, "cards.html"),
    "{% partialdef card %}<article>B</article>{% endpartialdef %}\n",
  );
  writeFileSync(path.join(workspacePath, "include.html"), '{% include "shared/cards.html#card" %}\n');
  writeFileSync(
    path.join(workspacePath, "views.py"),
    [
      'render(request, "shared/cards.html#card")',
      'django.shortcuts.render(request, template_name="shared/cards.html#card")',
      'render_to_string(template_name="shared/cards.html#card")',
      'get_template("shared/cards.html#card")',
      'select_template(["shared/cards.html#card"])',
      'TemplateResponse(request, template="shared/cards.html#card")',
      "",
    ].join("\n"),
  );
  try {
    await runTests({
      extensionDevelopmentPath,
      extensionTestsPath,
      vscodeExecutablePath,
      launchArgs: [workspacePath],
    });
  } finally {
    rmSync(workspacePath, { recursive: true, force: true });
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
