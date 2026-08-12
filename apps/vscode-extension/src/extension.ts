import * as fs from "node:fs";
import * as vscode from "vscode";

/**
 * Extension entry point: registers `slacker.openChat`, which opens a
 * Webview panel loading apps/web's production build (copied into
 * dist/webview by scripts/build.mjs — see docs/ARCHITECTURE.md's note
 * that VS Code Webviews need asWebviewUri + CSP/nonce wiring on top of a
 * plain static build, same pattern GitLens/Copilot Chat use).
 *
 * No postMessage bridge to the extension host yet — apps/web doesn't need
 * any VS Code-specific API (filesystem, settings, etc.) today, it just
 * connects to a chat server URL like it does in a plain browser tab.
 */

let panel: vscode.WebviewPanel | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand("slacker.openChat", () => {
    openChatPanel(context);
  });
  context.subscriptions.push(disposable);
}

function openChatPanel(context: vscode.ExtensionContext): void {
  if (panel) {
    panel.reveal(vscode.ViewColumn.One);
    return;
  }

  const webviewDistUri = vscode.Uri.joinPath(context.extensionUri, "dist", "webview");

  panel = vscode.window.createWebviewPanel("slackerChat", "Slacker", vscode.ViewColumn.One, {
    enableScripts: true,
    retainContextWhenHidden: true,
    localResourceRoots: [webviewDistUri],
  });

  try {
    panel.webview.html = renderHtml(panel.webview, webviewDistUri);
  } catch (err) {
    panel.dispose();
    panel = undefined;
    vscode.window.showErrorMessage(`Slacker: failed to load chat webview — ${(err as Error).message}`);
    return;
  }

  panel.onDidDispose(() => {
    panel = undefined;
  });
}

/**
 * Rewrites the built index.html's root-relative asset paths (Vite emits
 * e.g. `src="/assets/…"`) into webview-safe `asWebviewUri` URLs, and
 * injects a nonce-based CSP so the page is allowed to run at all under
 * the Webview's default-deny policy.
 */
export function renderHtml(webview: vscode.Webview, webviewDistUri: vscode.Uri): string {
  const indexPath = vscode.Uri.joinPath(webviewDistUri, "index.html").fsPath;
  let html = fs.readFileSync(indexPath, "utf-8");

  const nonce = getNonce();

  html = html.replace(/(src|href)="\/(.*?)"/g, (_match, attr: string, assetPath: string) => {
    const assetUri = webview.asWebviewUri(vscode.Uri.joinPath(webviewDistUri, assetPath));
    return `${attr}="${assetUri.toString()}"`;
  });
  html = html.replace(/<script /g, `<script nonce="${nonce}" `);

  const csp = [
    `default-src 'none'`,
    `img-src ${webview.cspSource} https: data:`,
    `style-src ${webview.cspSource} 'unsafe-inline'`,
    `script-src 'nonce-${nonce}'`,
    // Dev-only: allows connecting to a local chat server over ws(s)/http(s).
    // TODO: narrow this once the server has a real deployed origin.
    `connect-src ${webview.cspSource} ws: wss: http: https:`,
  ].join("; ");

  html = html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${csp}">`);

  return html;
}

function getNonce(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let text = "";
  for (let i = 0; i < 32; i++) {
    text += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return text;
}

export function deactivate(): void {
  panel?.dispose();
}
