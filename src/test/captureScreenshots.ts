import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  downloadAndUnzipVSCode,
  resolveCliArgsFromVSCodeExecutablePath,
  runTests,
} from "@vscode/test-electron";

const ROOT = path.resolve(__dirname, "../..");
const STATE_FILE = path.join(ROOT, ".vscode-test", "screenshot-state");
const FRAME_DIR = path.join(ROOT, ".vscode-test", "demo-frames");
const GIF_ENCODER = path.join(ROOT, ".vscode-test", "create-gif");
const PORT = 9222;
let macGifEncoderReady = false;
const STATES = [
  "attribute-completions-typing",
  "attribute-completions-prefix",
  "attribute-completions-trigger",
  "attribute-completions-ranked",
  "attribute-completions-selected",
  "attribute-completions-details",
  "context-aware-values-empty",
  "context-aware-values-strategies",
  "context-aware-values-strategy-details",
  "context-aware-values-selected",
  "context-aware-values-modifier-prefix",
  "context-aware-values-modifiers",
  "hover-documentation-start",
  "hover-documentation-focus",
  "hover-documentation-rich",
  "hover-documentation-example",
  "hover-documentation-actions",
  "diagnostics",
  "partials",
] as const;

const DEMOS: Record<string, readonly string[]> = {
  "attribute-completions": STATES.slice(0, 6),
  "context-aware-values": STATES.slice(6, 12),
  "hover-documentation": STATES.slice(12, 17),
};

interface DebugTarget {
  type: string;
  url: string;
  webSocketDebuggerUrl?: string;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
}

class CdpClient {
  private readonly socket: WebSocket;
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();

  private constructor(socket: WebSocket) {
    this.socket = socket;
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as { id?: number; result?: unknown };
      if (message.id !== undefined) {
        this.pending.get(message.id)?.resolve(message.result);
        this.pending.delete(message.id);
      }
    });
    const rejectPending = (reason: Error): void => {
      for (const request of this.pending.values()) {
        request.reject(reason);
      }
      this.pending.clear();
    };
    socket.addEventListener("error", () => rejectPending(new Error("VS Code debugger connection errored")));
    socket.addEventListener("close", () => rejectPending(new Error("VS Code debugger connection closed")));
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
    const result = new Promise<T>((resolve, reject) =>
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject }),
    );
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
  try {
    await client.send("Page.enable");
    mkdirSync(path.join(ROOT, "images"), { recursive: true });
    mkdirSync(FRAME_DIR, { recursive: true });

    for (const state of STATES) {
      let ready = false;
      for (let attempt = 0; attempt < 200; attempt++) {
        try {
          if (readFileSync(STATE_FILE, "utf8") === state) {
            ready = true;
            break;
          }
        } catch {
          // The extension test has not prepared this state yet.
        }
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      if (!ready) {
        throw new Error(`Screenshot state '${state}' was never reported by the extension test`);
      }
      const result = await client.send<{ data: string }>("Page.captureScreenshot", {
        format: "png",
        fromSurface: true,
      });
      const frame = Buffer.from(result.data, "base64");
      const demo = Object.entries(DEMOS).find(([, states]) => states.includes(state));
      if (demo !== undefined) {
        const [name, states] = demo;
        writeFileSync(path.join(FRAME_DIR, `${name}-${states.indexOf(state) + 1}.png`), frame);
        if (state === states.at(-1)) {
          createGif(name);
        }
      } else {
        writeFileSync(path.join(ROOT, "images", `${state}.png`), frame);
        copyFileSync(path.join(ROOT, "images", `${state}.png`), path.join(ROOT, "docs/assets/images", `${state}.png`));
      }
      writeFileSync(`${STATE_FILE}.${state}.ack`, "captured");
    }
  } finally {
    client.close();
  }
}

function createGif(name: string): void {
  const output = path.join(ROOT, "images", `${name}.gif`);
  const ffmpeg = spawnSync(
    "ffmpeg",
    [
      "-y",
      "-framerate",
      "1",
      "-i",
      path.join(FRAME_DIR, `${name}-%d.png`),
      "-filter_complex",
      "[0:v]fps=2,scale=1024:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse",
      "-loop",
      "0",
      output,
    ],
    { stdio: "ignore" },
  );
  const result = ffmpeg.status === 0 ? ffmpeg : createGifWithImageIo(
    output,
    name,
  );
  if (result.status !== 0) {
    throw new Error("ffmpeg or macOS ImageIO is required to generate Marketplace demo GIFs");
  }
  copyFileSync(
    output,
    path.join(ROOT, "docs/assets/images", `${name}.gif`),
  );
}

function createGifWithImageIo(output: string, name: string): ReturnType<typeof spawnSync> {
  if (process.platform !== "darwin") {
    throw new Error("ffmpeg is required to generate Marketplace demo GIFs on this platform");
  }
  if (!macGifEncoderReady) {
    const compiler = spawnSync(
      "clang",
      [
        path.join(ROOT, "scripts/create-gif.m"),
        "-framework",
        "AppKit",
        "-framework",
        "ImageIO",
        "-framework",
        "UniformTypeIdentifiers",
        "-o",
        GIF_ENCODER,
      ],
      { stdio: "inherit" },
    );
    if (compiler.status !== 0) {
      throw new Error("macOS ImageIO is required to generate Marketplace demo GIFs");
    }
    macGifEncoderReady = true;
  }
  return spawnSync(
    GIF_ENCODER,
    [
      output,
      ...DEMOS[name].map((_state, index) => path.join(FRAME_DIR, `${name}-${index + 1}.png`)),
    ],
    { stdio: "inherit" },
  );
}

async function main(): Promise<void> {
  mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  rmSync(STATE_FILE, { force: true });
  rmSync(FRAME_DIR, { recursive: true, force: true });
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
    launchArgs: [
      `--remote-debugging-port=${PORT}`,
      "--disable-workspace-trust",
      "--window-size=1200,750",
      "--force-device-scale-factor=1",
    ],
  });
  await Promise.all([testRun, captureStates()]);
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
