import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  downloadAndUnzipVSCode,
  resolveCliArgsFromVSCodeExecutablePath,
  runTests,
} from "@vscode/test-electron";

const ROOT = path.resolve(__dirname, "../..");
const STATE_FILE = path.join(ROOT, ".vscode-test", "screenshot-state");
const PORT = 9222;
const STATES = ["completion", "hover", "diagnostics", "partials"] as const;

interface DebugTarget {
  type: string;
  url: string;
  webSocketDebuggerUrl?: string;
}

class CdpClient {
  private readonly socket: WebSocket;
  private nextId = 1;
  private readonly pending = new Map<number, (value: unknown) => void>();

  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as { id?: number; result?: unknown };
      if (message.id !== undefined) {
        this.pending.get(message.id)?.(message.result);
        this.pending.delete(message.id);
      }
    });
  }

  static async connect(url: string): Promise<CdpClient> {
    const socket = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener("error", () => reject(new Error("Unable to connect to VS Code debugger")), {
        once: true,
      });
    });
    return new CdpClient(socket);
  }

  async send<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const id = this.nextId++;
    const result = new Promise<T>((resolve) => this.pending.set(id, (value) => resolve(value as T)));
    this.socket.send(JSON.stringify({ id, method, params }));
    return result;
  }

  close(): void {
    this.socket.close();
  }
}

async function waitForWorkbench(): Promise<CdpClient> {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const targets = (await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()) as DebugTarget[];
      const target = targets.find(
        (candidate) =>
          candidate.type === "page" &&
          candidate.webSocketDebuggerUrl !== undefined &&
          candidate.url.includes("workbench"),
      );
      if (target?.webSocketDebuggerUrl !== undefined) {
        return CdpClient.connect(target.webSocketDebuggerUrl);
      }
    } catch {
      // The renderer has not opened its debugger endpoint yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("VS Code workbench debugger did not become available");
}

async function captureStates(): Promise<void> {
  const client = await waitForWorkbench();
  await client.send("Page.enable");
  mkdirSync(path.join(ROOT, "images"), { recursive: true });

  for (const state of STATES) {
    for (let attempt = 0; attempt < 200; attempt++) {
      try {
        if (readFileSync(STATE_FILE, "utf8") === state) {
          break;
        }
      } catch {
        // The extension test has not prepared this state yet.
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const result = await client.send<{ data: string }>("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
    });
    writeFileSync(path.join(ROOT, "images", `${state}.png`), Buffer.from(result.data, "base64"));
    writeFileSync(`${STATE_FILE}.${state}.ack`, "captured");
  }
  client.close();
}

async function main(): Promise<void> {
  mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  rmSync(STATE_FILE, { force: true });
  for (const state of STATES) {
    rmSync(`${STATE_FILE}.${state}.ack`, { force: true });
  }

  const vscodeExecutablePath = await downloadAndUnzipVSCode("1.90.2");
  const [cliPath, ...cliArgs] = resolveCliArgsFromVSCodeExecutablePath(vscodeExecutablePath);
  const install = spawnSync(
    cliPath,
    [...cliArgs, "--install-extension", "batisteo.vscode-django", "--force"],
    { stdio: "inherit" },
  );
  if (install.status !== 0) {
    throw new Error("Unable to install the Django extension into the screenshot runtime");
  }

  const testRun = runTests({
    vscodeExecutablePath,
    extensionDevelopmentPath: ROOT,
    extensionTestsPath: path.resolve(__dirname, "suite/screenshots"),
    launchArgs: [`--remote-debugging-port=${PORT}`, "--disable-workspace-trust"],
  });
  await Promise.all([testRun, captureStates()]);
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
