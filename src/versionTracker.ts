import * as fs from "node:fs/promises";
import { IFileState, IFunctionGraphIndex, IStateMap } from "./types";

export async function readStateMap(stateFilePath: string): Promise<IStateMap> {
  try {
    const raw = await fs.readFile(stateFilePath, "utf8");
    const parsed = JSON.parse(raw) as IStateMap;
    return normalizeStateMap(parsed);
  } catch {
    return {};
  }
}

export async function writeStateMap(stateFilePath: string, stateMap: IStateMap): Promise<void> {
  const payload = JSON.stringify(stateMap, null, 2);
  await fs.writeFile(stateFilePath, `${payload}\n`, "utf8");
}

export function getFileState(stateMap: IStateMap, relativePath: string): IFileState | undefined {
  return stateMap[relativePath];
}

export function upsertFileState(
  stateMap: IStateMap,
  relativePath: string,
  state: IFileState,
): IStateMap {
  return {
    ...stateMap,
    [relativePath]: state,
  };
}

export function pruneStateMap(
  stateMap: IStateMap,
  keepRelativePaths: Set<string>,
): { nextStateMap: IStateMap; removedPaths: string[] } {
  const nextStateMap: IStateMap = {};
  const removedPaths: string[] = [];
  for (const [relativePath, state] of Object.entries(stateMap)) {
    if (keepRelativePaths.has(relativePath)) {
      nextStateMap[relativePath] = state;
      continue;
    }
    removedPaths.push(relativePath);
  }
  return { nextStateMap, removedPaths };
}

export async function readFunctionIndex(indexPath: string): Promise<IFunctionGraphIndex> {
  try {
    const raw = await fs.readFile(indexPath, "utf8");
    const parsed = JSON.parse(raw) as IFunctionGraphIndex;
    return normalizeFunctionIndex(parsed);
  } catch {
    return emptyFunctionIndex();
  }
}

export async function writeFunctionIndex(
  indexPath: string,
  index: IFunctionGraphIndex,
): Promise<void> {
  const payload = JSON.stringify(index, null, 2);
  await fs.writeFile(indexPath, `${payload}\n`, "utf8");
}

export function emptyFunctionIndex(): IFunctionGraphIndex {
  return {
    functionsById: {},
    fileFunctionIds: {},
    fileCalls: {},
    updatedAt: new Date().toISOString(),
  };
}

function normalizeFunctionIndex(input: IFunctionGraphIndex | null | undefined): IFunctionGraphIndex {
  if (!input || typeof input !== "object") {
    return emptyFunctionIndex();
  }
  const normalized = emptyFunctionIndex();

  const rawFileFunctionIds = sanitizeStringArrayMap(input.fileFunctionIds);
  normalized.fileCalls = sanitizeStringArrayMap(input.fileCalls);
  normalized.updatedAt = typeof input.updatedAt === "string" ? input.updatedAt : new Date().toISOString();

  const canonicalById: Record<string, IFunctionGraphIndex["functionsById"][string]> = {};

  const rawFunctions = input.functionsById ?? {};
  for (const [rawId, raw] of Object.entries(rawFunctions)) {
    if (!raw || typeof raw !== "object") {
      continue;
    }
    const candidate = raw as {
      id?: string;
      name?: string;
      callers?: string[];
      updatedAt?: string;
      definitions?: Array<{
        relativePath?: string;
        kind?: "function" | "method" | "arrow" | "functionExpr";
        lineStart?: number;
        introducedVersion?: number;
        code?: string;
      }>;
      relativePath?: string;
      kind?: "function" | "method" | "arrow" | "functionExpr";
      lineStart?: number;
      introducedVersion?: number;
    };

    const definitions =
      Array.isArray(candidate.definitions) && candidate.definitions.length > 0
        ? candidate.definitions
            .map((item) => ({
              relativePath: String(item.relativePath ?? "").trim(),
              kind: item.kind ?? "function",
              lineStart: Number(item.lineStart ?? 1),
              introducedVersion: Number(item.introducedVersion ?? 1),
              code: String(item.code ?? ""),
            }))
            .filter((item) => item.relativePath.length > 0)
        : candidate.relativePath
          ? [
              {
                relativePath: String(candidate.relativePath),
                kind: candidate.kind ?? "function",
                lineStart: Number(candidate.lineStart ?? 1),
                introducedVersion: Number(candidate.introducedVersion ?? 1),
                code: "",
              },
            ]
          : [];
    if (definitions.length === 0) {
      continue;
    }

    const canonicalId = canonicalFunctionId(candidate.name ?? candidate.id ?? rawId);
    const existing = canonicalById[canonicalId];
    const mergedDefinitions = [
      ...(existing?.definitions ?? []),
      ...definitions,
    ].filter((item) => item.relativePath.length > 0);
    const mergedCallers = [
      ...(existing?.callers ?? []),
      ...(Array.isArray(candidate.callers) ? candidate.callers.map((item) => String(item)) : []),
    ];

    canonicalById[canonicalId] = {
      id: canonicalId,
      name: canonicalId.replace(/\(\)$/, ""),
      definitions: dedupeDefinitions(mergedDefinitions),
      callers: Array.from(new Set(mergedCallers)).sort((a, b) => a.localeCompare(b)),
      updatedAt:
        typeof candidate.updatedAt === "string"
          ? candidate.updatedAt
          : new Date().toISOString(),
    };
  }

  normalized.functionsById = canonicalById;
  normalized.fileFunctionIds = {};
  for (const [relativePath, functionIds] of Object.entries(rawFileFunctionIds)) {
    const canonicalIds = functionIds.map((id) => canonicalFunctionId(id));
    normalized.fileFunctionIds[relativePath] = Array.from(new Set(canonicalIds)).sort((a, b) =>
      a.localeCompare(b),
    );
  }

  return normalized;
}

function sanitizeStringArrayMap(value: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!value || typeof value !== "object") {
    return out;
  }
  for (const [key, items] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(items)) {
      continue;
    }
    out[key] = items.map((item) => String(item));
  }
  return out;
}

function canonicalFunctionId(value: string): string {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "anonymous()";
  }
  const fromLegacy = raw.includes("::")
    ? raw.split("::")[1] ?? raw
    : raw;
  const noParens = fromLegacy.replace(/\(\)$/, "");
  const fromScoped = noParens.includes(".") ? noParens.split(".").pop() ?? noParens : noParens;
  return `${fromScoped}()`;
}

function dedupeDefinitions(
  definitions: Array<{
    relativePath: string;
    kind: "function" | "method" | "arrow" | "functionExpr";
    lineStart: number;
    introducedVersion: number;
    code: string;
  }>,
) {
  const byKey = new Map<string, (typeof definitions)[number]>();
  for (const definition of definitions) {
    const key = `${definition.relativePath}:${definition.kind}:${definition.lineStart}`;
    const existing = byKey.get(key);
    if (!existing || definition.introducedVersion < existing.introducedVersion) {
      byKey.set(key, definition);
      continue;
    }
    if (!existing.code && definition.code) {
      byKey.set(key, {
        ...existing,
        code: definition.code,
      });
    }
  }
  return Array.from(byKey.values()).sort((a, b) =>
    `${a.relativePath}:${a.lineStart}`.localeCompare(`${b.relativePath}:${b.lineStart}`),
  );
}

function normalizeStateMap(input: IStateMap | null | undefined): IStateMap {
  if (!input || typeof input !== "object") {
    return {};
  }
  const normalized: IStateMap = {};
  for (const [relativePath, rawState] of Object.entries(input)) {
    if (!rawState || typeof rawState !== "object") {
      continue;
    }
    const version = Number(rawState.version ?? 0);
    const contents = String(rawState.contents ?? "");
    const noteBase =
      typeof rawState.noteBase === "string" && rawState.noteBase.trim().length > 0
        ? rawState.noteBase.trim()
        : undefined;
    normalized[relativePath] = {
      version: Number.isFinite(version) && version > 0 ? version : 1,
      contents,
      ...(noteBase ? { noteBase } : {}),
    };
  }
  return normalized;
}
