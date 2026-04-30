import { IFileFunctionAnalysis, IFunctionGraphIndex, IFunctionNodeRecord } from "./types";

export function updateFunctionGraphForFile(
  index: IFunctionGraphIndex,
  analysis: IFileFunctionAnalysis,
  relativePath: string,
  version: number,
): IFunctionGraphIndex {
  const next = cloneIndex(index);

  const previousIds = new Set(next.fileFunctionIds[relativePath] ?? []);
  const nextIds: string[] = [];

  for (const def of analysis.definitions) {
    const functionId = canonicalFunctionId(def.name);
    nextIds.push(functionId);
    previousIds.delete(functionId);

    const existingRecord = next.functionsById[functionId];
    const definitions = existingRecord?.definitions ?? [];
    const existingDefinition = definitions.find(
      (item) =>
        item.relativePath === relativePath &&
        item.kind === def.kind &&
        item.lineStart === def.lineStart,
    );
    const nextDefinition = {
      relativePath,
      kind: def.kind,
      lineStart: def.lineStart,
      introducedVersion: existingDefinition?.introducedVersion ?? version,
      code: def.code,
    };

    const filteredDefinitions = definitions.filter(
      (item) => !(item.relativePath === relativePath && item.kind === def.kind && item.lineStart === def.lineStart),
    );

    const record: IFunctionNodeRecord = {
      id: functionId,
      name: functionNameFromId(functionId),
      definitions: [...filteredDefinitions, nextDefinition].sort((a, b) =>
        `${a.relativePath}:${a.lineStart}`.localeCompare(`${b.relativePath}:${b.lineStart}`),
      ),
      callers: existingRecord?.callers ?? [],
      updatedAt: new Date().toISOString(),
    };
    next.functionsById[functionId] = record;
  }

  for (const staleId of previousIds) {
    const stale = next.functionsById[staleId];
    if (!stale) {
      continue;
    }
    const remainingDefinitions = stale.definitions.filter(
      (item) => item.relativePath !== relativePath,
    );
    if (remainingDefinitions.length === 0) {
      delete next.functionsById[staleId];
    } else {
      next.functionsById[staleId] = {
        ...stale,
        definitions: remainingDefinitions,
        updatedAt: new Date().toISOString(),
      };
    }
  }

  next.fileFunctionIds[relativePath] = Array.from(new Set(nextIds)).sort((a, b) =>
    a.localeCompare(b),
  );
  next.fileCalls[relativePath] = Array.from(
    new Set(analysis.calls.map((call) => call.calleeName).filter(Boolean)),
  );

  return recalculateCallers(next);
}

export function pruneFunctionGraph(
  index: IFunctionGraphIndex,
  keepRelativePaths: Set<string>,
): IFunctionGraphIndex {
  const next = cloneIndex(index);
  next.fileFunctionIds = {};
  next.fileCalls = {};

  for (const [relativePath, functionIds] of Object.entries(index.fileFunctionIds)) {
    if (keepRelativePaths.has(relativePath)) {
      next.fileFunctionIds[relativePath] = functionIds;
      continue;
    }
  }
  for (const [functionId, record] of Object.entries(next.functionsById)) {
    const remainingDefinitions = record.definitions.filter((item) =>
      keepRelativePaths.has(item.relativePath),
    );
    if (remainingDefinitions.length === 0) {
      delete next.functionsById[functionId];
      continue;
    }
    next.functionsById[functionId] = {
      ...record,
      definitions: remainingDefinitions,
      updatedAt: new Date().toISOString(),
    };
  }
  for (const [relativePath, calls] of Object.entries(index.fileCalls)) {
    if (keepRelativePaths.has(relativePath)) {
      next.fileCalls[relativePath] = calls;
    }
  }

  return recalculateCallers(next);
}

export function recalculateCallers(index: IFunctionGraphIndex): IFunctionGraphIndex {
  const next = cloneIndex(index);
  next.functionsById = {};

  const defsByName = new Map<string, string[]>();
  for (const functionRecord of Object.values(index.functionsById)) {
    const records = defsByName.get(functionRecord.id) ?? [];
    records.push(functionRecord.id);
    defsByName.set(functionRecord.id, records);
    next.functionsById[functionRecord.id] = {
      ...functionRecord,
      callers: [],
      updatedAt: new Date().toISOString(),
    };
  }

  for (const [callerPath, callNames] of Object.entries(index.fileCalls)) {
    for (const calleeName of callNames) {
      const targetIds = defsByName.get(canonicalFunctionId(calleeName)) ?? [];
      for (const targetId of targetIds) {
        const target = next.functionsById[targetId];
        if (!target) {
          continue;
        }
        if (!target.callers.includes(callerPath)) {
          target.callers.push(callerPath);
        }
      }
    }
  }

  for (const record of Object.values(next.functionsById)) {
    record.callers.sort((a, b) => a.localeCompare(b));
  }
  return next;
}

function cloneIndex(index: IFunctionGraphIndex): IFunctionGraphIndex {
  return {
    functionsById: { ...index.functionsById },
    fileFunctionIds: { ...index.fileFunctionIds },
    fileCalls: { ...index.fileCalls },
    updatedAt: new Date().toISOString(),
  };
}

function canonicalFunctionId(name: string): string {
  const trimmed = String(name || "").trim().replace(/\(\)$/, "");
  const normalized = trimmed.includes(".") ? trimmed.split(".").pop() ?? trimmed : trimmed;
  return `${normalized}()`;
}

function functionNameFromId(id: string): string {
  return String(id).replace(/\(\)$/, "");
}
