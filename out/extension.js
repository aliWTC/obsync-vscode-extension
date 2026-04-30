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
exports.activate = activate;
exports.deactivate = deactivate;
const path = __importStar(require("node:path"));
const vscode = __importStar(require("vscode"));
const projectScanner_1 = require("./projectScanner");
const sidebarProvider_1 = require("./sidebarProvider");
const syncer_1 = require("./syncer");
const versionTracker_1 = require("./versionTracker");
const vaultManager_1 = require("./vaultManager");
async function activate(context) {
    const output = vscode.window.createOutputChannel("Obsync");
    context.subscriptions.push(output);
    const syncProjectStatusButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    syncProjectStatusButton.name = "Obsync Sync Entire Project";
    syncProjectStatusButton.text = "$(sync) Obsync Sync Project";
    syncProjectStatusButton.tooltip = "Obsync: Sync Entire Project";
    syncProjectStatusButton.command = "codesync.syncProject";
    syncProjectStatusButton.show();
    context.subscriptions.push(syncProjectStatusButton);
    const sidebar = new sidebarProvider_1.SidebarProvider(context.extensionUri);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(sidebarProvider_1.SidebarProvider.viewId, sidebar));
    let lastSync = null;
    let lastResult = null;
    let selectedWorkspaceFolder;
    const refreshSidebar = async () => {
        const workspaceFolder = await resolveWorkspaceFolder(false, selectedWorkspaceFolder);
        const files = await getTrackedFiles(workspaceFolder);
        const vaultPath = (0, vaultManager_1.getConfiguredVaultPath)();
        await vscode.commands.executeCommand("setContext", "codesync.hasVaultPath", Boolean(vaultPath));
        await vscode.commands.executeCommand("setContext", "codesync.hasWorkspace", Boolean(workspaceFolder));
        sidebar.postStatus({
            lastSync,
            lastResult,
            files,
            vaultPath,
            hasVaultPath: Boolean(vaultPath),
            workspaceName: workspaceFolder?.name ?? null,
            syncFunctionsEnabled: getSyncFunctionsEnabled(),
        });
        syncProjectStatusButton.text = workspaceFolder
            ? "$(sync) Obsync Sync Project"
            : "$(circle-slash) Obsync No Workspace";
        syncProjectStatusButton.command = workspaceFolder ? "codesync.syncProject" : undefined;
    };
    context.subscriptions.push(vscode.commands.registerCommand("codesync.syncFile", async () => {
        try {
            const workspaceFolder = await resolveWorkspaceFolder(true, selectedWorkspaceFolder);
            if (!workspaceFolder) {
                return;
            }
            selectedWorkspaceFolder = workspaceFolder;
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showErrorMessage("No active file to sync.");
                return;
            }
            const vaultPaths = await (0, vaultManager_1.getVaultPathsForWorkspace)(workspaceFolder);
            const result = await (0, syncer_1.syncSingleFile)(editor.document, vaultPaths, output, {
                syncFunctions: getSyncFunctionsEnabled(),
            });
            if (result.changed) {
                lastSync = result.syncedAt;
                lastResult = `Synced ${result.relativePath} to v${result.version}`;
                vscode.window.showInformationMessage(`Synced ${result.relativePath} to v${result.version}`);
            }
            else {
                lastResult = `No changes for ${result.relativePath}`;
            }
            await refreshSidebar();
        }
        catch (error) {
            handleError(error, output);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand("codesync.syncProject", async () => {
        try {
            const workspaceFolder = await resolveWorkspaceFolder(true, selectedWorkspaceFolder);
            if (!workspaceFolder) {
                return;
            }
            selectedWorkspaceFolder = workspaceFolder;
            const vaultPaths = await (0, vaultManager_1.getVaultPathsForWorkspace)(workspaceFolder);
            const result = await (0, projectScanner_1.syncProject)(vaultPaths, output, {
                syncFunctions: getSyncFunctionsEnabled(),
                workspaceFolderOverride: workspaceFolder,
            });
            lastSync = result.syncedAt;
            lastResult = `Project sync complete: ${result.changedFiles.length} changed file(s).`;
            vscode.window.showInformationMessage(`Project sync complete: ${result.changedFiles.length} changed file(s).`);
            await refreshSidebar();
        }
        catch (error) {
            handleError(error, output);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand("codesync.setVaultPath", async () => {
        try {
            const selectedPath = await pickVaultPath();
            if (!selectedPath) {
                return;
            }
            lastResult = `Vault path set: ${selectedPath}`;
            await refreshSidebar();
        }
        catch (error) {
            handleError(error, output);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand("codesync.changeVaultPath", async () => {
        try {
            const selectedPath = await pickVaultPath();
            if (!selectedPath) {
                return;
            }
            lastResult = `Vault path changed: ${selectedPath}`;
            await refreshSidebar();
        }
        catch (error) {
            handleError(error, output);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand("codesync.setSyncFunctions", async (enabled) => {
        await vscode.workspace
            .getConfiguration("codesync")
            .update("syncFunctions", Boolean(enabled), vscode.ConfigurationTarget.Workspace);
        lastResult = `Function sync ${enabled ? "enabled" : "disabled"}.`;
        await refreshSidebar();
    }));
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(async (document) => {
        const autoSync = vscode.workspace
            .getConfiguration("codesync")
            .get("autoSyncOnSave", false);
        if (!autoSync) {
            return;
        }
        try {
            const workspaceFolder = await resolveWorkspaceFolder(false, selectedWorkspaceFolder);
            if (!workspaceFolder) {
                return;
            }
            selectedWorkspaceFolder = workspaceFolder;
            const vaultPaths = await (0, vaultManager_1.getVaultPathsForWorkspace)(workspaceFolder);
            const result = await (0, syncer_1.syncSingleFile)(document, vaultPaths, output, {
                suppressNoChangesNotification: true,
                syncFunctions: getSyncFunctionsEnabled(),
            });
            if (result.changed) {
                lastSync = result.syncedAt;
                lastResult = `Auto-synced ${result.relativePath} to v${result.version}`;
            }
            else {
                lastResult = `No changes for ${result.relativePath}`;
            }
            await refreshSidebar();
        }
        catch (error) {
            handleError(error, output);
        }
    }));
    context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(async (event) => {
        if (event.affectsConfiguration("codesync")) {
            await refreshSidebar();
        }
    }));
    context.subscriptions.push(vscode.workspace.onDidChangeWorkspaceFolders(async () => {
        selectedWorkspaceFolder = undefined;
        await refreshSidebar();
    }));
    await refreshSidebar();
}
function deactivate() { }
async function getTrackedFiles(workspaceFolder) {
    const configuredVaultPath = (0, vaultManager_1.getConfiguredVaultPath)();
    if (!configuredVaultPath || !workspaceFolder) {
        return [];
    }
    const projectName = (0, vaultManager_1.normalizeProjectName)(workspaceFolder.name);
    const statePath = path.join(configuredVaultPath, "CodeSync", projectName, ".state.json");
    const stateMap = await (0, versionTracker_1.readStateMap)(statePath);
    return Object.entries(stateMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([relativePath, state]) => ({
        relativePath,
        displayName: path.basename(relativePath),
        noteBase: state.noteBase?.trim() || path.basename(relativePath),
        version: state.version,
    }));
}
function handleError(error, output) {
    const message = error instanceof Error ? error.message : String(error);
    output.appendLine(`[error] ${message}`);
    vscode.window.showErrorMessage(message);
}
async function resolveWorkspaceFolder(interactive, preferredFolder) {
    const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
    if (workspaceFolders.length === 0) {
        if (interactive) {
            vscode.window.showErrorMessage("Open a project folder to use Obsync.");
        }
        return undefined;
    }
    if (workspaceFolders.length === 1) {
        return Promise.resolve(workspaceFolders[0]);
    }
    if (!interactive) {
        if (preferredFolder) {
            const matched = workspaceFolders.find((folder) => folder.uri.toString() === preferredFolder.uri.toString());
            if (matched) {
                return Promise.resolve(matched);
            }
        }
        return Promise.resolve(workspaceFolders[0]);
    }
    const selected = await vscode.window.showQuickPick(workspaceFolders.map((folder) => ({
        label: folder.name,
        description: folder.uri.fsPath,
        folder,
    })), {
        title: "Choose workspace folder for Obsync",
        placeHolder: "Select one workspace to sync",
    });
    return selected?.folder;
}
async function pickVaultPath() {
    const selected = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: "Select Obsidian Vault Folder",
        title: "Choose your Obsidian vault root",
    });
    if (!selected || selected.length === 0) {
        return undefined;
    }
    const selectedPath = selected[0].fsPath;
    await (0, vaultManager_1.ensureVaultRootExists)(selectedPath);
    await (0, vaultManager_1.setConfiguredVaultPath)(selectedPath);
    vscode.window.showInformationMessage(`Obsync vault path set to: ${selectedPath}`);
    return selectedPath;
}
function getSyncFunctionsEnabled() {
    return vscode.workspace
        .getConfiguration("codesync")
        .get("syncFunctions", false);
}
//# sourceMappingURL=extension.js.map