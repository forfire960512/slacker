import * as vscode from "vscode";

/**
 * Extension entry point — scaffolding only. TODO: register
 * `slacker.openChat` to open a Webview panel loading the apps/web
 * production build (see docs/ARCHITECTURE.md — reuses that build as-is,
 * just needs `webview.asWebviewUri` + CSP/nonce wiring, and a bundler
 * step here since VS Code can't load raw workspace-linked ESM sources
 * the way Vite dev/apps/cli's tsx can).
 */
export function activate(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand("slacker.openChat", () => {
    vscode.window.showInformationMessage("Slacker: chat webview not implemented yet.");
  });
  context.subscriptions.push(disposable);
}

export function deactivate(): void {}
