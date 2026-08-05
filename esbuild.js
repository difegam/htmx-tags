const esbuild = require("esbuild");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

/** Reports bundling errors in a format the VS Code problem matcher understands. */
const esbuildProblemMatcherPlugin = {
  name: "esbuild-problem-matcher",
  setup(build) {
    build.onStart(() => {
      console.log("[esbuild] build started");
    });
    build.onEnd((result) => {
      for (const { text, location } of result.errors) {
        console.error(`✘ [ERROR] ${text}`);
        if (location !== null) {
          console.error(`    ${location.file}:${location.line}:${location.column}:`);
        }
      }
      console.log("[esbuild] build finished");
    });
  },
};

async function main() {
  const context = await esbuild.context({
    entryPoints: ["src/extension.ts"],
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "node20",
    outfile: "dist/extension.js",
    external: ["vscode"],
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    logLevel: "silent",
    plugins: [esbuildProblemMatcherPlugin],
  });
  if (watch) {
    await context.watch();
  } else {
    await context.rebuild();
    await context.dispose();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
