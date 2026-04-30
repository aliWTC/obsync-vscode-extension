import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { pruneFunctionGraph } from "./functionGraph";
import { writeFunctionNodes, writeIndexNode } from "./fileWriter";
import { buildNoteBaseMap, versionNodeName } from "./noteNaming";
import { syncFileUri } from "./syncer";
import { IProjectSyncResult, ITrackedFileVersion, IVaultPaths } from "./types";
import {
  emptyFunctionIndex,
  pruneStateMap,
  readFunctionIndex,
  readStateMap,
  writeFunctionIndex,
  writeStateMap,
} from "./versionTracker";

export async function syncProject(
  vaultPaths: IVaultPaths,
  output: vscode.OutputChannel,
  options?: { syncFunctions?: boolean; workspaceFolderOverride?: vscode.WorkspaceFolder },
): Promise<IProjectSyncResult> {
  const workspaceFolder =
    options?.workspaceFolderOverride ?? vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    throw new Error("No workspace folder is open.");
  }

  const config = vscode.workspace.getConfiguration("codesync");
  const ignoredExtensions = new Set(
    (config.get<string[]>("ignoredExtensions", []) || []).map((ext) => ext.toLowerCase()),
  );
  const ignoredFolders = new Set(
    (config.get<string[]>("ignoredFolders", []) || []).map((folder) => folder.toLowerCase()),
  );

  const fileUris = await scanFiles(workspaceFolder.uri.fsPath, ignoredExtensions, ignoredFolders);
  const sortedFileUris = [...fileUris].sort((a, b) =>
    path
      .relative(workspaceFolder.uri.fsPath, a.fsPath)
      .localeCompare(path.relative(workspaceFolder.uri.fsPath, b.fsPath)),
  );
  const candidateRelativePaths = new Set(
    sortedFileUris.map((fileUri) =>
      path.relative(workspaceFolder.uri.fsPath, fileUri.fsPath),
    ),
  );
  const changedFiles: IProjectSyncResult["changedFiles"] = [];
  const previousStateMap = await readStateMap(vaultPaths.stateFile);
  const noteBaseByRelativePath = buildNoteBaseMap(
    sortedFileUris.map((fileUri) =>
      path.relative(workspaceFolder.uri.fsPath, fileUri.fsPath),
    ),
    previousStateMap,
  );
  const duplicateNoteBases = collectDuplicateBasenames(
    sortedFileUris.map((fileUri) =>
      path.relative(workspaceFolder.uri.fsPath, fileUri.fsPath),
    ),
  );

  for (const fileUri of sortedFileUris) {
    const relativePath = path.relative(workspaceFolder.uri.fsPath, fileUri.fsPath);
    const basename = path.basename(relativePath);
    if (duplicateNoteBases.has(basename)) {
      output.appendLine(
        `[info] Duplicate basename "${basename}" detected; syncing ${relativePath} as ${noteBaseByRelativePath[relativePath]}.md`,
      );
    }
    const result = await syncFileUri(fileUri, vaultPaths, output, {
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

  const stateMap = await readStateMap(vaultPaths.stateFile);
  const { nextStateMap, removedPaths } = pruneStateMap(
    stateMap,
    candidateRelativePaths,
  );
  if (removedPaths.length > 0) {
    await writeStateMap(vaultPaths.stateFile, nextStateMap);
    for (const removedPath of removedPaths) {
      output.appendLine(
        `[info] Removed stale tracked file from state/index: ${removedPath}`,
      );
    }
  }
  await cleanupRemovedArtifacts(vaultPaths, stateMap, removedPaths, output);
  await cleanupOrphanedArtifacts(vaultPaths, nextStateMap, output);
  if (options?.syncFunctions) {
    const functionIndex = await readFunctionIndex(vaultPaths.functionIndexFile);
    const prunedFunctionIndex = pruneFunctionGraph(functionIndex, candidateRelativePaths);
    await writeFunctionIndex(vaultPaths.functionIndexFile, prunedFunctionIndex);
    const activeNoteBaseMap = Object.fromEntries(
      Object.entries(nextStateMap).map(([relativePath, state]) => [
        relativePath,
        state.noteBase?.trim() || path.basename(relativePath),
      ]),
    );
    await writeFunctionNodes(vaultPaths, prunedFunctionIndex, activeNoteBaseMap);
  } else {
    const clearedFunctionIndex = emptyFunctionIndex();
    await writeFunctionIndex(vaultPaths.functionIndexFile, clearedFunctionIndex);
    await writeFunctionNodes(vaultPaths, clearedFunctionIndex, {});
    output.appendLine("[info] Function sync disabled: removed function nodes and reset function index.");
  }
  const trackedFiles: ITrackedFileVersion[] = Object.entries(nextStateMap).map(
    ([relativePath, state]) => ({
      relativePath,
      displayName: path.basename(relativePath),
      noteBase: state.noteBase?.trim() || path.basename(relativePath),
      version: state.version,
    }),
  );
  const syncedAt = new Date().toISOString();
  await writeIndexNode(vaultPaths, vaultPaths.projectName, syncedAt, trackedFiles);

  return {
    syncedAt,
    changedFiles,
  };
}

function collectDuplicateBasenames(relativePaths: string[]): Set<string> {
  const counts = new Map<string, number>();
  for (const relativePath of relativePaths) {
    const basename = path.basename(relativePath);
    counts.set(basename, (counts.get(basename) ?? 0) + 1);
  }
  return new Set(
    Array.from(counts.entries())
      .filter(([, count]) => count > 1)
      .map(([basename]) => basename),
  );
}

async function cleanupRemovedArtifacts(
  vaultPaths: IVaultPaths,
  previousStateMap: Record<string, { version: number; noteBase?: string }>,
  removedPaths: string[],
  output: vscode.OutputChannel,
): Promise<void> {
  for (const removedPath of removedPaths) {
    const removedState = previousStateMap[removedPath];
    if (!removedState) {
      continue;
    }
    const noteBase = removedState.noteBase?.trim() || path.basename(removedPath);
    const mainNodePath = path.join(vaultPaths.projectRoot, `${noteBase}.md`);
    await unlinkIfExists(mainNodePath, output, "main");
    for (let version = 1; version <= removedState.version; version += 1) {
      const versionPath = path.join(
        vaultPaths.versionsDir,
        `${versionNodeName(noteBase, version)}.md`,
      );
      await unlinkIfExists(versionPath, output, "version");
    }
  }
}

async function unlinkIfExists(
  targetPath: string,
  output: vscode.OutputChannel,
  kind: "main" | "version",
): Promise<void> {
  try {
    await fs.unlink(targetPath);
    output.appendLine(`[info] Deleted stale ${kind} node: ${path.basename(targetPath)}`);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      throw error;
    }
  }
}

async function cleanupOrphanedArtifacts(
  vaultPaths: IVaultPaths,
  stateMap: Record<string, { version: number; noteBase?: string }>,
  output: vscode.OutputChannel,
): Promise<void> {
  const trackedVersionsByNoteBase = new Map<string, number>();
  for (const [relativePath, state] of Object.entries(stateMap)) {
    const noteBase = state.noteBase?.trim() || path.basename(relativePath);
    const current = trackedVersionsByNoteBase.get(noteBase) ?? 0;
    if (state.version > current) {
      trackedVersionsByNoteBase.set(noteBase, state.version);
    }
  }

  const staleVersionBases = new Set<string>();
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
      await unlinkIfExists(
        path.join(vaultPaths.versionsDir, entry.name),
        output,
        "version",
      );
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
    await unlinkIfExists(
      path.join(vaultPaths.projectRoot, entry.name),
      output,
      "main",
    );
  }
}

async function scanFiles(
  rootPath: string,
  ignoredExtensions: Set<string>,
  ignoredFolders: Set<string>,
): Promise<vscode.Uri[]> {
  const results: vscode.Uri[] = [];
  await walkDirectory(rootPath, ignoredExtensions, ignoredFolders, results);
  return results;
}

async function walkDirectory(
  currentDir: string,
  ignoredExtensions: Set<string>,
  ignoredFolders: Set<string>,
  results: vscode.Uri[],
): Promise<void> {
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
