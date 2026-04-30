import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { IVaultPaths } from "./types";

const CODE_SYNC_DIR = "CodeSync";
const VERSIONS_DIR = "versions";
const FUNCTIONS_DIR = "functions";

export async function getVaultPaths(): Promise<IVaultPaths> {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  if (!workspaceFolder) {
    throw new Error("No workspace folder is open.");
  }
  return getVaultPathsForWorkspace(workspaceFolder);
}

export async function getVaultPathsForWorkspace(
  workspaceFolder: vscode.WorkspaceFolder,
): Promise<IVaultPaths> {
  const configuredVaultPath = getConfiguredVaultPath();
  if (!configuredVaultPath) {
    const action = "Open Settings";
    const choice = await vscode.window.showErrorMessage(
      "CodeSync vault path is not configured.",
      action,
    );
    if (choice === action) {
      await vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "codesync.vaultPath",
      );
    }
    throw new Error("codesync.vaultPath is not set.");
  }

  const vaultRoot = path.resolve(configuredVaultPath);
  const vaultStat = await safeStat(vaultRoot);
  if (!vaultStat || !vaultStat.isDirectory()) {
    vscode.window.showErrorMessage(
      `CodeSync vault path does not exist: ${vaultRoot}`,
    );
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

export function getConfiguredVaultPath(): string {
  const config = vscode.workspace.getConfiguration("codesync");
  return String(config.get<string>("vaultPath", "")).trim();
}

export async function setConfiguredVaultPath(vaultPath: string): Promise<void> {
  const config = vscode.workspace.getConfiguration("codesync");
  await config.update("vaultPath", vaultPath, vscode.ConfigurationTarget.Global);
}

export async function ensureVaultRootExists(vaultPath: string): Promise<void> {
  const resolvedPath = path.resolve(vaultPath);
  const vaultStat = await safeStat(resolvedPath);
  if (vaultStat?.isDirectory()) {
    return;
  }

  const createAction = "Create Folder";
  const choice = await vscode.window.showWarningMessage(
    `Selected folder does not exist: ${resolvedPath}`,
    createAction,
  );
  if (choice !== createAction) {
    throw new Error("Vault folder creation was cancelled.");
  }

  await fs.mkdir(resolvedPath, { recursive: true });
}

export function normalizeProjectName(name: string): string {
  return String(name).trim().toLowerCase().replace(/\s+/g, "-");
}

async function safeStat(targetPath: string): Promise<Awaited<ReturnType<typeof fs.stat>> | null> {
  try {
    return await fs.stat(targetPath);
  } catch {
    return null;
  }
}
