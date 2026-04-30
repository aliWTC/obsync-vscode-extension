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
exports.getVaultPaths = getVaultPaths;
exports.getVaultPathsForWorkspace = getVaultPathsForWorkspace;
exports.getConfiguredVaultPath = getConfiguredVaultPath;
exports.setConfiguredVaultPath = setConfiguredVaultPath;
exports.ensureVaultRootExists = ensureVaultRootExists;
exports.normalizeProjectName = normalizeProjectName;
const fs = __importStar(require("node:fs/promises"));
const path = __importStar(require("node:path"));
const vscode = __importStar(require("vscode"));
const CODE_SYNC_DIR = "CodeSync";
const VERSIONS_DIR = "versions";
const FUNCTIONS_DIR = "functions";
async function getVaultPaths() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        throw new Error("No workspace folder is open.");
    }
    return getVaultPathsForWorkspace(workspaceFolder);
}
async function getVaultPathsForWorkspace(workspaceFolder) {
    const configuredVaultPath = getConfiguredVaultPath();
    if (!configuredVaultPath) {
        const action = "Open Settings";
        const choice = await vscode.window.showErrorMessage("CodeSync vault path is not configured.", action);
        if (choice === action) {
            await vscode.commands.executeCommand("workbench.action.openSettings", "codesync.vaultPath");
        }
        throw new Error("codesync.vaultPath is not set.");
    }
    const vaultRoot = path.resolve(configuredVaultPath);
    const vaultStat = await safeStat(vaultRoot);
    if (!vaultStat || !vaultStat.isDirectory()) {
        vscode.window.showErrorMessage(`CodeSync vault path does not exist: ${vaultRoot}`);
        throw new Error(`Invalid vault path: ${vaultRoot}`);
    }
    const projectName = normalizeProjectName(workspaceFolder.name);
    const codeSyncRoot = path.join(vaultRoot, CODE_SYNC_DIR);
    const projectRoot = path.join(codeSyncRoot, projectName);
    const versionsDir = path.join(projectRoot, VERSIONS_DIR);
    const functionsDir = path.join(projectRoot, FUNCTIONS_DIR);
    await fs.mkdir(versionsDir, { recursive: true });
    await fs.mkdir(functionsDir, { recursive: true });
    return {
        vaultRoot,
        codeSyncRoot,
        projectRoot,
        versionsDir,
        functionsDir,
        indexFile: path.join(projectRoot, "_index.md"),
        stateFile: path.join(projectRoot, ".state.json"),
        functionIndexFile: path.join(projectRoot, ".functions.json"),
        projectName,
    };
}
function getConfiguredVaultPath() {
    const config = vscode.workspace.getConfiguration("codesync");
    return String(config.get("vaultPath", "")).trim();
}
async function setConfiguredVaultPath(vaultPath) {
    const config = vscode.workspace.getConfiguration("codesync");
    await config.update("vaultPath", vaultPath, vscode.ConfigurationTarget.Global);
}
async function ensureVaultRootExists(vaultPath) {
    const resolvedPath = path.resolve(vaultPath);
    const vaultStat = await safeStat(resolvedPath);
    if (vaultStat?.isDirectory()) {
        return;
    }
    const createAction = "Create Folder";
    const choice = await vscode.window.showWarningMessage(`Selected folder does not exist: ${resolvedPath}`, createAction);
    if (choice !== createAction) {
        throw new Error("Vault folder creation was cancelled.");
    }
    await fs.mkdir(resolvedPath, { recursive: true });
}
function normalizeProjectName(name) {
    return String(name).trim().toLowerCase().replace(/\s+/g, "-");
}
async function safeStat(targetPath) {
    try {
        return await fs.stat(targetPath);
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=vaultManager.js.map