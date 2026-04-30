import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { computeDiff } from "./differ";
import { analyzeFunctions } from "./functionAnalyzer";
import { updateFunctionGraphForFile } from "./functionGraph";
import { buildNoteBaseMap } from "./noteNaming";
import { writeFunctionNodes, writeMainNode, writeVersionNode } from "./fileWriter";
import { IFileSyncResult, IVaultPaths } from "./types";
import {
  getFileState,
  readFunctionIndex,
  readStateMap,
  upsertFileState,
  writeFunctionIndex,
  writeStateMap,
} from "./versionTracker";

export async function syncSingleFile(
  document: vscode.TextDocument,
  vaultPaths: IVaultPaths,
  output: vscode.OutputChannel,
  options?: {
    suppressNoChangesNotification?: boolean;
    syncFunctions?: boolean;
    workspaceFolderOverride?: vscode.WorkspaceFolder;
    noteBaseOverride?: string;
    forceWriteNodes?: boolean;
  },
): Promise<IFileSyncResult> {
  if (document.isUntitled) {
    throw new Error("Cannot sync an untitled file.");
  }

  const workspaceFolder =
    options?.workspaceFolderOverride ?? vscode.workspace.getWorkspaceFolder(document.uri);
  if (!workspaceFolder) {
    throw new Error("File is not part of an open workspace.");
  }

  const relativePath = path.relative(workspaceFolder.uri.fsPath, document.uri.fsPath);
  const filename = path.basename(document.uri.fsPath);
  const stateMap = await readStateMap(vaultPaths.stateFile);
  const existingState = getFileState(stateMap, relativePath);
  const noteBaseFromState = existingState?.noteBase?.trim();
  const noteBase =
    options?.noteBaseOverride ??
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
    ? computeDiff(relativePath, previousContents, currentContents)
    : computeDiff(relativePath, currentContents, currentContents);

  await writeMainNode(vaultPaths, {
    filename: noteBase,
    relativePath,
    language,
    syncedAt,
    version,
    code: currentContents,
  });
  if (hasChanges) {
    await writeVersionNode(vaultPaths, {
      filename: noteBase,
      syncedAt,
      version,
      previousVersion: existingState?.version ?? null,
      diff,
    });
  }

  if (options?.syncFunctions) {
    const functionAnalysis = analyzeFunctions(relativePath, currentContents);
    const functionIndex = await readFunctionIndex(vaultPaths.functionIndexFile);
    const updatedFunctionIndex = updateFunctionGraphForFile(
      functionIndex,
      functionAnalysis,
      relativePath,
      version,
    );
    await writeFunctionIndex(vaultPaths.functionIndexFile, updatedFunctionIndex);
    const noteBaseByRelativePath = buildNoteBaseMap(
      Object.keys({
        ...stateMap,
        [relativePath]: { version, contents: currentContents, noteBase },
      }),
      {
        ...stateMap,
        [relativePath]: { version, contents: currentContents, noteBase },
      },
    );
    await writeFunctionNodes(vaultPaths, updatedFunctionIndex, noteBaseByRelativePath);
  }

  const nextStateMap = upsertFileState(stateMap, relativePath, {
    version,
    contents: currentContents,
    noteBase,
  });
  await writeStateMap(vaultPaths.stateFile, nextStateMap);

  output.appendLine(
    `${hasChanges ? "Synced" : "Refreshed"} ${relativePath} -> v${version} (${noteBase}.md)`,
  );
  return {
    relativePath,
    filename,
    noteBase,
    version,
    changed: hasChanges,
    syncedAt,
  };
}

export async function syncFileUri(
  fileUri: vscode.Uri,
  vaultPaths: IVaultPaths,
  output: vscode.OutputChannel,
  options?: {
    suppressNoChangesNotification?: boolean;
    syncFunctions?: boolean;
    workspaceFolderOverride?: vscode.WorkspaceFolder;
    noteBaseOverride?: string;
    forceWriteNodes?: boolean;
  },
): Promise<IFileSyncResult> {
  const bytes = await fs.readFile(fileUri.fsPath, "utf8");
  const language = detectLanguageFromFilename(fileUri.fsPath);
  const workspaceFolder =
    options?.workspaceFolderOverride ?? vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    throw new Error("No workspace folder is open.");
  }
  const relativePath = path.relative(workspaceFolder.uri.fsPath, fileUri.fsPath);
  const pseudoDoc = {
    isUntitled: false,
    uri: fileUri,
    languageId: language,
    getText: () => bytes,
  } as vscode.TextDocument;
  return syncSingleFile(pseudoDoc, vaultPaths, output, {
    ...options,
    workspaceFolderOverride: workspaceFolder,
  });
}

function detectLanguageFromFilename(filePath: string): string {
  const ext = path.extname(filePath).replace(".", "").trim();
  return ext || "text";
}
