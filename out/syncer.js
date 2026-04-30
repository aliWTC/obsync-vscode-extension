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
exports.syncSingleFile = syncSingleFile;
exports.syncFileUri = syncFileUri;
const fs = __importStar(require("node:fs/promises"));
const path = __importStar(require("node:path"));
const vscode = __importStar(require("vscode"));
const differ_1 = require("./differ");
const functionAnalyzer_1 = require("./functionAnalyzer");
const functionGraph_1 = require("./functionGraph");
const noteNaming_1 = require("./noteNaming");
const fileWriter_1 = require("./fileWriter");
const versionTracker_1 = require("./versionTracker");
async function syncSingleFile(document, vaultPaths, output, options) {
    if (document.isUntitled) {
        throw new Error("Cannot sync an untitled file.");
    }
    const workspaceFolder = options?.workspaceFolderOverride ?? vscode.workspace.getWorkspaceFolder(document.uri);
    if (!workspaceFolder) {
        throw new Error("File is not part of an open workspace.");
    }
    const relativePath = path.relative(workspaceFolder.uri.fsPath, document.uri.fsPath);
    const filename = path.basename(document.uri.fsPath);
    const stateMap = await (0, versionTracker_1.readStateMap)(vaultPaths.stateFile);
    const existingState = (0, versionTracker_1.getFileState)(stateMap, relativePath);
    const noteBaseFromState = existingState?.noteBase?.trim();
    const noteBase = options?.noteBaseOverride ??
        (noteBaseFromState && noteBaseFromState.length > 0 ? noteBaseFromState : filename);
    const previousContents = existingState?.contents ?? "";
    const currentContents = document.getText();
    const hasChanges = previousContents !== currentContents;
    if (!hasChanges && !options?.forceWriteNodes) {
        if (!options?.suppressNoChangesNotification) {
            vscode.window.showInformationMessage("No changes detected since last sync");
        }
        return {
            relativePath,
            filename,
            noteBase,
            version: existingState?.version ?? 0,
            changed: false,
            syncedAt: new Date().toISOString(),
        };
    }
    const version = hasChanges ? (existingState?.version ?? 0) + 1 : existingState?.version ?? 1;
    const syncedAt = new Date().toISOString();
    const language = document.languageId || "text";
    const diff = hasChanges
        ? (0, differ_1.computeDiff)(relativePath, previousContents, currentContents)
        : (0, differ_1.computeDiff)(relativePath, currentContents, currentContents);
    await (0, fileWriter_1.writeMainNode)(vaultPaths, {
        filename: noteBase,
        relativePath,
        language,
        syncedAt,
        version,
        code: currentContents,
    });
    if (hasChanges) {
        await (0, fileWriter_1.writeVersionNode)(vaultPaths, {
            filename: noteBase,
            syncedAt,
            version,
            previousVersion: existingState?.version ?? null,
            diff,
        });
    }
    if (options?.syncFunctions) {
        const functionAnalysis = (0, functionAnalyzer_1.analyzeFunctions)(relativePath, currentContents);
        const functionIndex = await (0, versionTracker_1.readFunctionIndex)(vaultPaths.functionIndexFile);
        const updatedFunctionIndex = (0, functionGraph_1.updateFunctionGraphForFile)(functionIndex, functionAnalysis, relativePath, version);
        await (0, versionTracker_1.writeFunctionIndex)(vaultPaths.functionIndexFile, updatedFunctionIndex);
        const noteBaseByRelativePath = (0, noteNaming_1.buildNoteBaseMap)(Object.keys({
            ...stateMap,
            [relativePath]: { version, contents: currentContents, noteBase },
        }), {
            ...stateMap,
            [relativePath]: { version, contents: currentContents, noteBase },
        });
        await (0, fileWriter_1.writeFunctionNodes)(vaultPaths, updatedFunctionIndex, noteBaseByRelativePath);
    }
    const nextStateMap = (0, versionTracker_1.upsertFileState)(stateMap, relativePath, {
        version,
        contents: currentContents,
        noteBase,
    });
    await (0, versionTracker_1.writeStateMap)(vaultPaths.stateFile, nextStateMap);
    output.appendLine(`${hasChanges ? "Synced" : "Refreshed"} ${relativePath} -> v${version} (${noteBase}.md)`);
    return {
        relativePath,
        filename,
        noteBase,
        version,
        changed: hasChanges,
        syncedAt,
    };
}
async function syncFileUri(fileUri, vaultPaths, output, options) {
    const bytes = await fs.readFile(fileUri.fsPath, "utf8");
    const language = detectLanguageFromFilename(fileUri.fsPath);
    const workspaceFolder = options?.workspaceFolderOverride ?? vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        throw new Error("No workspace folder is open.");
    }
    const relativePath = path.relative(workspaceFolder.uri.fsPath, fileUri.fsPath);
    const pseudoDoc = {
        isUntitled: false,
        uri: fileUri,
        languageId: language,
        getText: () => bytes,
    };
    return syncSingleFile(pseudoDoc, vaultPaths, output, {
        ...options,
        workspaceFolderOverride: workspaceFolder,
    });
}
function detectLanguageFromFilename(filePath) {
    const ext = path.extname(filePath).replace(".", "").trim();
    return ext || "text";
}
//# sourceMappingURL=syncer.js.map