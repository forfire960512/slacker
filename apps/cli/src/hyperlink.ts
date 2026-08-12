// String.fromCharCode avoids embedding raw control bytes in this source
// file (which tooling/diffs tend to mangle) — 27 is ESC, 7 is BEL.
const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);

/**
 * Wraps `label` in an OSC 8 hyperlink escape so modern terminals (Windows
 * Terminal, iTerm2, VS Code's integrated terminal, …) render it as a
 * clickable link — the terminal-specific answer to apps/web's <a> tags,
 * per docs/ARCHITECTURE.md.
 */
export function hyperlink(url: string, label: string = url): string {
  return `${ESC}]8;;${url}${BEL}${label}${ESC}]8;;${BEL}`;
}
