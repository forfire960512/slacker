import { execSync } from "node:child_process";
import { render } from "ink";
import { App } from "./App.js";

// Windows consoles (PowerShell, cmd) default to a legacy codepage that
// mangles Korean/CJK text — fix how the console displays it before
// rendering any UI. No-op (and harmless) on other platforms.
if (process.platform === "win32") {
  try {
    execSync("chcp 65001", { stdio: "ignore" });
  } catch {
    // Best-effort — a console rendering glitch isn't worth failing startup over.
  }
}

// ink-text-input needs stdin raw mode, which only a real interactive
// terminal provides — fail with a clear message instead of Ink's raw
// mode stack trace when run from a pipe/non-TTY context (e.g. CI).
if (!process.stdin.isTTY) {
  console.error("slacker cli requires an interactive terminal (stdin is not a TTY).");
  process.exit(1);
}

render(<App />);
