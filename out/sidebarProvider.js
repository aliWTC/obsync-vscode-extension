"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SidebarProvider = void 0;
const fs = __importStar(require("node:fs/promises"));
const vscode = __importStar(require("vscode"));
class SidebarProvider {
    extensionUri;
    static viewId = "codesync.sidebar";
    view;
    latestStatus;
    constructor(extensionUri) {
        this.extensionUri = extensionUri;
    }
    resolveWebviewView(webviewView) {
        this.view = webviewView;
        const nonce = getNonce();
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "media")],
        };
        this.loadHtml(webviewView.webview, nonce)
            .then((html) => {
            webviewView.webview.html = html;
            if (this.latestStatus) {
                this.postStatus(this.latestStatus);
            }
        })
            .catch((error) => {
            const message = error instanceof Error ? error.message : String(error);
            webviewView.webview.html = this.errorHtml(message);
            void vscode.window.showErrorMessage(`Obsync sidebar failed to load: ${message}`);
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
                        void vscode.window.setStatusBarMessage("Obsync: Vault path copied", 1800);
                    }
                    break;
                case "setSyncFunctions":
                    await vscode.commands.executeCommand("codesync.setSyncFunctions", Boolean(message.value));
                    break;
                default:
                    break;
            }
        });
    }
    postStatus(status) {
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
    async loadHtml(_webview, nonce) {
        const htmlUri = vscode.Uri.joinPath(this.extensionUri, "media", "sidebar.html");
        const htmlPath = htmlUri.fsPath;
        const rawHtml = await fs.readFile(htmlPath, "utf8");
        return rawHtml.replace("{{nonce}}", nonce);
    }
    errorHtml(message) {
        const escaped = message
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
        return `<!DOCTYPE html>
<html lang="en">
  <body style="font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 12px;">
    <h3>Obsync failed to load</h3>
    <p>${escaped}</p>
    <p>Try reinstalling the VSIX after rebuilding.</p>
  </body>
</html>`;
    }
}
exports.SidebarProvider = SidebarProvider;
function getNonce() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let nonce = "";
    for (let i = 0; i < 16; i += 1) {
        nonce += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return nonce;
}
//# sourceMappingURL=sidebarProvider.js.map