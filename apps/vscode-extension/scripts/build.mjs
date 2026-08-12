import { build } from "esbuild";
import { existsSync } from "node:fs";
import { cp, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Bundles the extension host code (CJS, "vscode" externalized — provided
// by the VS Code runtime) and copies apps/web's production build in
// alongside it, so the packaged extension can load the Webview content
// from disk without depending on the monorepo layout at runtime.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const webDist = path.resolve(root, "../web/dist");
const outDir = path.resolve(root, "dist");

if (!existsSync(webDist)) {
  throw new Error(`apps/web/dist not found — run \`pnpm --filter web build\` first (looked in ${webDist})`);
}

await rm(outDir, { recursive: true, force: true });

await build({
  entryPoints: [path.join(root, "src/extension.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  external: ["vscode"],
  outfile: path.join(outDir, "extension.js"),
  sourcemap: true,
});

await cp(webDist, path.join(outDir, "webview"), { recursive: true });

console.log(`built ${path.relative(root, outDir)}/extension.js and copied web build into ${path.relative(root, outDir)}/webview`);
