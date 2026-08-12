import { render } from "ink";
import { App } from "./App.js";

// ink-text-input needs stdin raw mode, which only a real interactive
// terminal provides — fail with a clear message instead of Ink's raw
// mode stack trace when run from a pipe/non-TTY context (e.g. CI).
if (!process.stdin.isTTY) {
  console.error("slacker cli requires an interactive terminal (stdin is not a TTY).");
  process.exit(1);
}

render(<App />);
