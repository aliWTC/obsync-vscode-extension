<<<<<<< HEAD
# obsync-vscode-extension
Local-first VS Code extension for syncing project files, version history, and function call lineage to Obsidian Markdown notes.
=======
# CodeSync VS Code Extension

CodeSync is a local-first VS Code extension that writes structured Markdown snapshots into an Obsidian vault.

No backend, no Obsidian plugin, and no external sync service are required.

## What It Does

- Syncs the active file or full project.
- Computes a diff against last known file state.
- Writes a main node markdown file that always reflects latest code.
- Writes versioned snapshot files with unified diff + stats.
- Maintains `.state.json` per project to track versions and prior contents.
- Adds inline tags to generated notes (`#feature` for main nodes, `#version` for version nodes).
- Optional function-level sync generates canonical function nodes (one per function name) linked to owning file nodes, introducing version nodes, and caller file nodes.

## Basename Collision Handling

- Vault note filenames stay clean by default (for example `index.ts.md`).
- When multiple files share the same basename across different folders, CodeSync syncs all of them and automatically applies a deterministic path-derived suffix only to the colliding files (for example `index__src.ts.md`, `index__app_features.ts.md`).
- Version notes follow the resolved note name and remain deterministic.
- During project sync, stale markdown artifacts for files no longer tracked in state/index are cleaned up from the project and `versions/` folders.

## Vault Output

Given `codesync.vaultPath = /MyVault` and workspace name `my-app`, CodeSync writes:

```text
/MyVault/CodeSync/my-app/
  _index.md
  .state.json
  .functions.json
  index.ts.md
  functions/
    formatName().md
  versions/
    index.ts_v1.md
    index.ts_v2.md
```

## Commands

- `CodeSync: Sync Current File` (`codesync.syncFile`)
- `CodeSync: Sync Entire Project` (`codesync.syncProject`)
- `CodeSync: Set Vault Path` (`codesync.setVaultPath`)
- `CodeSync: Change Vault Path` (`codesync.changeVaultPath`)

## UI Surfaces

- Status bar quick action: `CodeSync Sync Project`
- CodeSync view toolbar actions: Sync file, sync project, and vault path management
- CodeSync left panel webview: primary project sync button, current vault path display, one-click set/change vault path

## Settings

- `codesync.vaultPath` (required)
- `codesync.ignoredExtensions` (default: `.json`, `.lock`, `.env`, `.gitignore`)
- `codesync.ignoredFolders` (default: `node_modules`, `.git`, `dist`, `build`, `.next`)
- `codesync.autoSyncOnSave` (default: `false`)
- `codesync.syncFunctions` (default: `false`)

## Development

```bash
npm install
npm run compile
```
>>>>>>> 18cc300 (Initial Obsync extension)
