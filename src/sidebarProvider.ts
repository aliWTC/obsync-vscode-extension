import * as fs from "node:fs/promises";
import * as vscode from "vscode";
import { ITrackedFileVersion } from "./types";

interface ISidebarStatus {
  lastSync: string | null;
  lastResult: string | null;
  files: ITrackedFileVersion[];
  vaultPath: string;
  hasVaultPath: boolean;
  workspaceName: string | null;
  syncFunctionsEnabled: boolean;
}

export class SidebarProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = "codesync.sidebar";
  private view: vscode.WebviewView | undefined;
  private latestStatus: ISidebarStatus | undefined;

  public constructor(private readonly extensionUri: vscode.Uri) {}

  public resolveWebviewView(webviewView: vscode.WebviewView): void | Thenable<void> {
    this.view = webviewView;
    const nonce = getNonce();
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "media")],
    };

    this.loadHtml(webviewView.webview, nonce).then((html) => {
      webviewView.webview.html = html;
      if (this.latestStatus) {
        this.postStatus(this.latestStatus);
      }
    });

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.type) {
        case "syncFile":
          await vscode.commands.executeCommand("codesync.syncFile");
          break;
        case "syncProject":
          await vscode.commands.executeCommand("codesync.syncProject");
          break;
        case "setVaultPath":
          await vscode.commands.executeCommand("codesync.setVaultPath");
          break;
        case "copyVaultPath":
          if (typeof message.value === "string" && message.value.trim().length > 0) {
            await vscode.env.clipboard.writeText(message.value.trim());
            void vscode.window.setStatusBarMessage("CodeSync: Vault path copied", 1800);
          }
          break;
        case "setSyncFunctions":
          await vscode.commands.executeCommand(
            "codesync.setSyncFunctions",
            Boolean(message.value),
          );
          break;
        default:
          break;
      }
    });
  }

  public postStatus(status: ISidebarStatus): void {
    this.latestStatus = status;
    if (!this.view) {
      return;
    }
    this.view.webview.postMessage({
      type: "status",
      lastSync: status.lastSync,
      lastResult: status.lastResult,
      vaultPath: status.vaultPath,
      hasVaultPath: status.hasVaultPath,
      workspaceName: status.workspaceName,
      syncFunctionsEnabled: status.syncFunctionsEnabled,
      files: status.files,
    });
  }

  private async loadHtml(_webview: vscode.Webview, nonce: string): Promise<string> {
    const htmlUri = vscode.Uri.joinPath(this.extensionUri, "media", "sidebar.html");
    const htmlPath = htmlUri.fsPath;
    const rawHtml = await fs.readFile(htmlPath, "utf8");
    return rawHtml.replace("{{nonce}}", nonce);
  }
}

function getNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let i = 0; i < 16; i += 1) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
