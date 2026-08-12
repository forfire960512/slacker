import { existsSync } from "node:fs";
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// `cap sync` for the Electron platform has proven unreliable in this repo:
// it reports success ("copy web in Nms") without actually copying anything
// into electron/app, even after fixing electron/capacitor.config.ts's
// webDir (which `cap add` copies in without adjusting for the extra
// directory level, so it silently points at a nonexistent path — fixed,
// but sync still didn't pick up changes). This bypasses cap sync entirely
// with a plain recursive copy instead.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const webDist = path.resolve(root, "../web/dist");
const electronApp = path.resolve(root, "electron/app");

if (!existsSync(webDist)) {
  throw new Error(`apps/web/dist not found — run \`pnpm --filter web build\` first (looked in ${webDist})`);
}

await rm(electronApp, { recursive: true, force: true });
await mkdir(electronApp, { recursive: true });
await cp(webDist, electronApp, { recursive: true });

console.log(`copied ${path.relative(root, webDist)} -> ${path.relative(root, electronApp)}`);
