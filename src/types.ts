export interface IVaultPaths {
  vaultRoot: string;
  codeSyncRoot: string;
  projectRoot: string;
  versionsDir: string;
  functionsDir: string;
  indexFile: string;
  stateFile: string;
  functionIndexFile: string;
  projectName: string;
}

export interface IFileState {
  version: number;
  contents: string;
  noteBase?: string;
}

export interface IStateMap {
  [relativePath: string]: IFileState;
}

export interface IDiffStats {
  linesAdded: number;
  linesRemoved: number;
  totalLines: number;
  fileSizeKb: number;
  changePercent: number;
}

export interface IDiffResult {
  unifiedDiff: string;
  stats: IDiffStats;
}

export interface ITrackedFileVersion {
  relativePath: string;
  displayName: string;
  noteBase: string;
  version: number;
}

export interface IFileSyncResult {
  relativePath: string;
  filename: string;
  noteBase: string;
  version: number;
  changed: boolean;
  syncedAt: string;
}

export interface IProjectSyncResult {
  syncedAt: string;
  changedFiles: IFileSyncResult[];
}

export interface IFunctionDef {
  id: string;
  name: string;
  kind: "function" | "method" | "arrow" | "functionExpr";
  relativePath: string;
  lineStart: number;
  code: string;
}

export interface ICallSite {
  relativePath: string;
  line: number;
  calleeName: string;
  rawCalleeName?: string;
}

export interface IFileFunctionAnalysis {
  definitions: IFunctionDef[];
  calls: ICallSite[];
}

export interface IFunctionNodeRecord {
  id: string;
  name: string;
  definitions: Array<{
    relativePath: string;
    kind: IFunctionDef["kind"];
    lineStart: number;
    introducedVersion: number;
    code: string;
  }>;
  callers: string[];
  updatedAt: string;
}

export interface IFunctionGraphIndex {
  functionsById: Record<string, IFunctionNodeRecord>;
  fileFunctionIds: Record<string, string[]>;
  fileCalls: Record<string, string[]>;
  updatedAt: string;
}
