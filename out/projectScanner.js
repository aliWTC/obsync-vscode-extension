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
exports.syncProject = syncProject;
const fs = __importStar(require("node:fs/promises"));
const path = __importStar(require("node:path"));
const vscode = __importStar(require("vscode"));
const functionGraph_1 = require("./functionGraph");
const fileWriter_1 = require("./fileWriter");
const noteNaming_1 = require("./noteNaming");
const syncer_1 = require("./syncer");
const versionTracker_1 = require("./versionTracker");
async function syncProject(vaultPaths, output, options) {
    const workspaceFolder = options?.workspaceFolderOverride ?? vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        throw new Error("No workspace folder is open.");
    }
    const config = vscode.workspace.getConfiguration("codesync");
    const ignoredExtensions = new Set((config.get("ignoredExtensions", []) || []).map((ext) => ext.toLowerCase()));
    const ignoredFolders = new Set((config.get("ignoredFolders", []) || []).map((folder) => folder.toLowerCase()));
    const fileUris = await scanFiles(workspaceFolder.uri.fsPath, ignoredExtensions, ignoredFolders);
    const sortedFileUris = [...fileUris].sort((a, b) => path
        .relative(workspaceFolder.uri.fsPath, a.fsPath)
        .localeCompare(path.relative(workspaceFolder.uri.fsPath, b.fsPath)));
    const candidateRelativePaths = new Set(sortedFileUris.map((fileUri) => path.relative(workspaceFolder.uri.fsPath, fileUri.fsPath)));
    const changedFiles = [];
    const previousStateMap = await (0, versionTracker_1.readStateMap)(vaultPaths.stateFile);
    const noteBaseByRelativePath = (0, noteNaming_1.buildNoteBaseMap)(sortedFileUris.map((fileUri) => path.relative(workspaceFolder.uri.fsPath, fileUri.fsPath)), previousStateMap);
    const duplicateNoteBases = collectDuplicateBasenames(sortedFileUris.map((fileUri) => path.relative(workspaceFolder.uri.fsPath, fileUri.fsPath)));
    for (const fileUri of sortedFileUris) {
        const relativePath = path.relative(workspaceFolder.uri.fsPath, fileUri.fsPath);
        const basename = path.basename(relativePath);
        if (duplicateNoteBases.has(basename)) {
            output.appendLine(`[info] Duplicate basename "${basename}" detected; syncing ${relativePath} as ${noteBaseByRelativePath[relativePath]}.md`);
        }
        const result = await (0, syncer_1.syncFileUri)(fileUri, vaultPaths, output, {
            suppressNoChangesNotification: true,
            syncFunctions: options?.syncFunctions,
            workspaceFolderOverride: workspaceFolder,
            noteBaseOverride: noteBaseByRelativePath[relativePath],
            forceWriteNodes: true,
        });
        if (result.changed) {
            changedFiles.push(result);
        }
    }
    const stateMap = await (0, versionTracker_1.readStateMap)(vaultPaths.stateFile);
    const { nextStateMap, removedPaths } = (0, versionTracker_1.pruneStateMap)(stateMap, candidateRelativePaths);
    if (removedPaths.length > 0) {
        await (0, versionTracker_1.writeStateMap)(vaultPaths.stateFile, nextStateMap);
        for (const removedPath of removedPaths) {
            output.appendLine(`[info] Removed stale tracked file from state/index: ${removedPath}`);
        }
    }
    await cleanupRemovedArtifacts(vaultPaths, stateMap, removedPaths, output);
    await cleanupOrphanedArtifacts(vaultPaths, nextStateMap, output);
    if (options?.syncFunctions) {
        const functionIndex = await (0, versionTracker_1.readFunctionIndex)(vaultPaths.functionIndexFile);
        const prunedFunctionIndex = (0, functionGraph_1.pruneFunctionGraph)(functionIndex, candidateRelativePaths);
        await (0, versionTracker_1.writeFunctionIndex)(vaultPaths.functionIndexFile, prunedFunctionIndex);
        const activeNoteBaseMap = Object.fromEntries(Object.entries(nextStateMap).map(([relativePath, state]) => [
            relativePath,
            state.noteBase?.trim() || path.basename(relativePath),
        ]));
        await (0, fileWriter_1.writeFunctionNodes)(vaultPaths, prunedFunctionIndex, activeNoteBaseMap);
    }
    else {
        const clearedFunctionIndex = (0, versionTracker_1.emptyFunctionIndex)();
        await (0, versionTracker_1.writeFunctionIndex)(vaultPaths.functionIndexFile, clearedFunctionIndex);
        await (0, fileWriter_1.writeFunctionNodes)(vaultPaths, clearedFunctionIndex, {});
        output.appendLine("[info] Function sync disabled: removed function nodes and reset function index.");
    }
    const trackedFiles = Object.entries(nextStateMap).map(([relativePath, state]) => ({
        relativePath,
        displayName: path.basename(relativePath),
        noteBase: state.noteBase?.trim() || path.basename(relativePath),
        version: state.version,
    }));
    const syncedAt = new Date().toISOString();
    await (0, fileWriter_1.writeIndexNode)(vaultPaths, vaultPaths.projectName, syncedAt, trackedFiles);
    return {
        syncedAt,
        changedFiles,
    };
}
function collectDuplicateBasenames(relativePaths) {
    const counts = new Map();
    for (const relativePath of relativePaths) {
        const basename = path.basename(relativePath);
        counts.set(basename, (counts.get(basename) ?? 0) + 1);
    }
    return new Set(Array.from(counts.entries())
        .filter(([, count]) => count > 1)
        .map(([basename]) => basename));
}
async function cleanupRemovedArtifacts(vaultPaths, previousStateMap, removedPaths, output) {
    for (const removedPath of removedPaths) {
        const removedState = previousStateMap[removedPath];
        if (!removedState) {
            continue;
        }
        const noteBase = removedState.noteBase?.trim() || path.basename(removedPath);
        const mainNodePath = path.join(vaultPaths.projectRoot, `${noteBase}.md`);
        await unlinkIfExists(mainNodePath, output, "main");
        for (let version = 1; version <= removedState.version; version += 1) {
            const versionPath = path.join(vaultPaths.versionsDir, `${(0, noteNaming_1.versionNodeName)(noteBase, version)}.md`);
            await unlinkIfExists(versionPath, output, "version");
        }
    }
}
async function unlinkIfExists(targetPath, output, kind) {
    try {
        await fs.unlink(targetPath);
        output.appendLine(`[info] Deleted stale ${kind} node: ${path.basename(targetPath)}`);
    }
    catch (error) {
        const code = error.code;
        if (code !== "ENOENT") {
            throw error;
        }
    }
}
async function cleanupOrphanedArtifacts(vaultPaths, stateMap, output) {
    const trackedVersionsByNoteBase = new Map();
    for (const [relativePath, state] of Object.entries(stateMap)) {
        const noteBase = state.noteBase?.trim() || path.basename(relativePath);
        const current = trackedVersionsByNoteBase.get(noteBase) ?? 0;
        if (state.version > current) {
            trackedVersionsByNoteBase.set(noteBase, state.version);
        }
    }
    const staleVersionBases = new Set();
    const versionEntries = await fs.readdir(vaultPaths.versionsDir, { withFileTypes: true });
    const versionPattern = /^(.*)_v(\d+)\.md$/;
    for (const entry of versionEntries) {
        if (!entry.isFile()) {
            continue;
        }
        const match = entry.name.match(versionPattern);
        if (!match) {
            continue;
        }
        const noteBase = match[1];
        const version = Number(match[2]);
        const trackedVersion = trackedVersionsByNoteBase.get(noteBase) ?? 0;
        if (trackedVersion === 0 || version > trackedVersion) {
            staleVersionBases.add(noteBase);
            await unlinkIfExists(path.join(vaultPaths.versionsDir, entry.name), output, "version");
        }
    }
    const mainEntries = await fs.readdir(vaultPaths.projectRoot, { withFileTypes: true });
    for (const entry of mainEntries) {
        if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== ".md") {
            continue;
        }
        if (entry.name === path.basename(vaultPaths.indexFile)) {
            continue;
        }
        const noteBase = path.basename(entry.name, ".md");
        if (trackedVersionsByNoteBase.has(noteBase)) {
            continue;
        }
        if (!staleVersionBases.has(noteBase)) {
            continue;
        }
        await unlinkIfExists(path.join(vaultPaths.projectRoot, entry.name), output, "main");
    }
}
async function scanFiles(rootPath, ignoredExtensions, ignoredFolders) {
    const results = [];
    await walkDirectory(rootPath, ignoredExtensions, ignoredFolders, results);
    return results;
}
async function walkDirectory(currentDir, ignoredExtensions, ignoredFolders, results) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
            if (ignoredFolders.has(entry.name.toLowerCase())) {
                continue;
            }
            await walkDirectory(fullPath, ignoredExtensions, ignoredFolders, results);
            continue;
        }
        if (!entry.isFile()) {
            continue;
        }
        const ext = path.extname(entry.name).toLowerCase();
        const lowerName = entry.name.toLowerCase();
        const isIgnoredByName = ignoredExtensions.has(lowerName);
        const isIgnoredByExtension = ext.length > 0 && ignoredExtensions.has(ext);
        if (isIgnoredByName || isIgnoredByExtension || ext === ".md") {
            continue;
        }
        results.push(vscode.Uri.file(fullPath));
    }
}
//# sourceMappingURL=projectScanner.js.map