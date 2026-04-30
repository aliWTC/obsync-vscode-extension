import * as path from "node:path";
import * as vscode from "vscode";
import { syncProject } from "./projectScanner";
import { SidebarProvider } from "./sidebarProvider";
import { syncSingleFile } from "./syncer";
import { ITrackedFileVersion } from "./types";
import { readStateMap } from "./versionTracker";
import {
  ensureVaultRootExists,
  getConfiguredVaultPath,
  getVaultPathsForWorkspace,
  normalizeProjectName,
  setConfiguredVaultPath,
} from "./vaultManager";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel("CodeSync");
  context.subscriptions.push(output);
  const syncProjectStatusButton = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  syncProjectStatusButton.name = "CodeSync Sync Entire Project";
  syncProjectStatusButton.text = "$(sync) CodeSync Sync Project";
  syncProjectStatusButton.tooltip = "CodeSync: Sync Entire Project";
  syncProjectStatusButton.command = "codesync.syncProject";
  syncProjectStatusButton.show();
  context.subscriptions.push(syncProjectStatusButton);

  const sidebar = new SidebarProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SidebarProvider.viewId, sidebar),
  );

  let lastSync: string | null = null;
  let lastResult: string | null = null;
  let selectedWorkspaceFolder: vscode.WorkspaceFolder | undefined;

  const refreshSidebar = async (): Promise<void> => {
    const workspaceFolder = await resolveWorkspaceFolder(false, selectedWorkspaceFolder);
    const files = await getTrackedFiles(workspaceFolder);
    const vaultPath = getConfiguredVaultPath();
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
      ? "$(sync) CodeSync Sync Project"
      : "$(circle-slash) CodeSync No Workspace";
    syncProjectStatusButton.command = workspaceFolder ? "codesync.syncProject" : undefined;
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("codesync.syncFile", async () => {
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
        const vaultPaths = await getVaultPathsForWorkspace(workspaceFolder);
        const result = await syncSingleFile(editor.document, vaultPaths, output, {
          syncFunctions: getSyncFunctionsEnabled(),
        });
        if (result.changed) {
          lastSync = result.syncedAt;
          lastResult = `Synced ${result.relativePath} to v${result.version}`;
          vscode.window.showInformationMessage(`Synced ${result.relativePath} to v${result.version}`);
        } else {
          lastResult = `No changes for ${result.relativePath}`;
        }
        await refreshSidebar();
      } catch (error) {
        handleError(error, output);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("codesync.syncProject", async () => {
      try {
        const workspaceFolder = await resolveWorkspaceFolder(true, selectedWorkspaceFolder);
        if (!workspaceFolder) {
          return;
        }
        selectedWorkspaceFolder = workspaceFolder;
        const vaultPaths = await getVaultPathsForWorkspace(workspaceFolder);
        const result = await syncProject(vaultPaths, output, {
          syncFunctions: getSyncFunctionsEnabled(),
          workspaceFolderOverride: workspaceFolder,
        });
        lastSync = result.syncedAt;
        lastResult = `Project sync complete: ${result.changedFiles.length} changed file(s).`;
        vscode.window.showInformationMessage(
          `Project sync complete: ${result.changedFiles.length} changed file(s).`,
        );
        await refreshSidebar();
      } catch (error) {
        handleError(error, output);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("codesync.setVaultPath", async () => {
      try {
        const selectedPath = await pickVaultPath();
        if (!selectedPath) {
          return;
        }
        lastResult = `Vault path set: ${selectedPath}`;
        await refreshSidebar();
      } catch (error) {
        handleError(error, output);
      }
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("codesync.changeVaultPath", async () => {
      try {
        const selectedPath = await pickVaultPath();
        if (!selectedPath) {
          return;
        }
        lastResult = `Vault path changed: ${selectedPath}`;
        await refreshSidebar();
      } catch (error) {
        handleError(error, output);
      }
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("codesync.setSyncFunctions", async (enabled?: boolean) => {
      await vscode.workspace
        .getConfiguration("codesync")
        .update("syncFunctions", Boolean(enabled), vscode.ConfigurationTarget.Workspace);
      lastResult = `Function sync ${enabled ? "enabled" : "disabled"}.`;
      await refreshSidebar();
    }),
  );

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (document) => {
      const autoSync = vscode.workspace
        .getConfiguration("codesync")
        .get<boolean>("autoSyncOnSave", false);
      if (!autoSync) {
        return;
      }
      try {
        const workspaceFolder = await resolveWorkspaceFolder(false, selectedWorkspaceFolder);
        if (!workspaceFolder) {
          return;
        }
        selectedWorkspaceFolder = workspaceFolder;
        const vaultPaths = await getVaultPathsForWorkspace(workspaceFolder);
        const result = await syncSingleFile(document, vaultPaths, output, {
          suppressNoChangesNotification: true,
          syncFunctions: getSyncFunctionsEnabled(),
        });
        if (result.changed) {
          lastSync = result.syncedAt;
          lastResult = `Auto-synced ${result.relativePath} to v${result.version}`;
        } else {
          lastResult = `No changes for ${result.relativePath}`;
        }
        await refreshSidebar();
      } catch (error) {
        handleError(error, output);
      }
    }),
  );
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (event.affectsConfiguration("codesync")) {
        await refreshSidebar();
      }
    }),
  );
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(async () => {
      selectedWorkspaceFolder = undefined;
      await refreshSidebar();
    }),
  );

  await refreshSidebar();
}

export function deactivate(): void {}

async function getTrackedFiles(
  workspaceFolder?: vscode.WorkspaceFolder,
): Promise<ITrackedFileVersion[]> {
  const configuredVaultPath = getConfiguredVaultPath();
  if (!configuredVaultPath || !workspaceFolder) {
    return [];
  }

  const projectName = normalizeProjectName(workspaceFolder.name);
  const statePath = path.join(configuredVaultPath, "CodeSync", projectName, ".state.json");
  const stateMap = await readStateMap(statePath);
  return Object.entries(stateMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([relativePath, state]) => ({
      relativePath,
      displayName: path.basename(relativePath),
      noteBase: state.noteBase?.trim() || path.basename(relativePath),
      version: state.version,
    }));
}

function handleError(error: unknown, output: vscode.OutputChannel): void {
  const message = error instanceof Error ? error.message : String(error);
  output.appendLine(`[error] ${message}`);
  vscode.window.showErrorMessage(message);
}

async function resolveWorkspaceFolder(
  interactive: boolean,
  preferredFolder?: vscode.WorkspaceFolder,
): Promise<vscode.WorkspaceFolder | undefined> {
  const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
  if (workspaceFolders.length === 0) {
    if (interactive) {
      vscode.window.showErrorMessage("Open a project folder to use CodeSync.");
    }
    return undefined;
  }
  if (workspaceFolders.length === 1) {
    return Promise.resolve(workspaceFolders[0]);
  }
  if (!interactive) {
    if (preferredFolder) {
      const matched = workspaceFolders.find(
        (folder) => folder.uri.toString() === preferredFolder.uri.toString(),
      );
      if (matched) {
        return Promise.resolve(matched);
      }
    }
    return Promise.resolve(workspaceFolders[0]);
  }

  const selected = await vscode.window.showQuickPick(
    workspaceFolders.map((folder) => ({
      label: folder.name,
      description: folder.uri.fsPath,
      folder,
    })),
    {
      title: "Choose workspace folder for CodeSync",
      placeHolder: "Select one workspace to sync",
    },
  );
  return selected?.folder;
}

async function pickVaultPath(): Promise<string | undefined> {
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
  await ensureVaultRootExists(selectedPath);
  await setConfiguredVaultPath(selectedPath);
  vscode.window.showInformationMessage(`CodeSync vault path set to: ${selectedPath}`);
  return selectedPath;
}

function getSyncFunctionsEnabled(): boolean {
  return vscode.workspace
    .getConfiguration("codesync")
    .get<boolean>("syncFunctions", false);
}
