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
exports.readStateMap = readStateMap;
exports.writeStateMap = writeStateMap;
exports.getFileState = getFileState;
exports.upsertFileState = upsertFileState;
exports.pruneStateMap = pruneStateMap;
exports.readFunctionIndex = readFunctionIndex;
exports.writeFunctionIndex = writeFunctionIndex;
exports.emptyFunctionIndex = emptyFunctionIndex;
const fs = __importStar(require("node:fs/promises"));
async function readStateMap(stateFilePath) {
    try {
        const raw = await fs.readFile(stateFilePath, "utf8");
        const parsed = JSON.parse(raw);
        return normalizeStateMap(parsed);
    }
    catch {
        return {};
    }
}
async function writeStateMap(stateFilePath, stateMap) {
    const payload = JSON.stringify(stateMap, null, 2);
    await fs.writeFile(stateFilePath, `${payload}\n`, "utf8");
}
function getFileState(stateMap, relativePath) {
    return stateMap[relativePath];
}
function upsertFileState(stateMap, relativePath, state) {
    return {
        ...stateMap,
        [relativePath]: state,
    };
}
function pruneStateMap(stateMap, keepRelativePaths) {
    const nextStateMap = {};
    const removedPaths = [];
    for (const [relativePath, state] of Object.entries(stateMap)) {
        if (keepRelativePaths.has(relativePath)) {
            nextStateMap[relativePath] = state;
            continue;
        }
        removedPaths.push(relativePath);
    }
    return { nextStateMap, removedPaths };
}
async function readFunctionIndex(indexPath) {
    try {
        const raw = await fs.readFile(indexPath, "utf8");
        const parsed = JSON.parse(raw);
        return normalizeFunctionIndex(parsed);
    }
    catch {
        return emptyFunctionIndex();
    }
}
async function writeFunctionIndex(indexPath, index) {
    const payload = JSON.stringify(index, null, 2);
    await fs.writeFile(indexPath, `${payload}\n`, "utf8");
}
function emptyFunctionIndex() {
    return {
        functionsById: {},
        fileFunctionIds: {},
        fileCalls: {},
        updatedAt: new Date().toISOString(),
    };
}
function normalizeFunctionIndex(input) {
    if (!input || typeof input !== "object") {
        return emptyFunctionIndex();
    }
    const normalized = emptyFunctionIndex();
    const rawFileFunctionIds = sanitizeStringArrayMap(input.fileFunctionIds);
    normalized.fileCalls = sanitizeStringArrayMap(input.fileCalls);
    normalized.updatedAt = typeof input.updatedAt === "string" ? input.updatedAt : new Date().toISOString();
    const canonicalById = {};
    const rawFunctions = input.functionsById ?? {};
    for (const [rawId, raw] of Object.entries(rawFunctions)) {
        if (!raw || typeof raw !== "object") {
            continue;
        }
        const candidate = raw;
        const definitions = Array.isArray(candidate.definitions) && candidate.definitions.length > 0
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
            updatedAt: typeof candidate.updatedAt === "string"
                ? candidate.updatedAt
                : new Date().toISOString(),
        };
    }
    normalized.functionsById = canonicalById;
    normalized.fileFunctionIds = {};
    for (const [relativePath, functionIds] of Object.entries(rawFileFunctionIds)) {
        const canonicalIds = functionIds.map((id) => canonicalFunctionId(id));
        normalized.fileFunctionIds[relativePath] = Array.from(new Set(canonicalIds)).sort((a, b) => a.localeCompare(b));
    }
    return normalized;
}
function sanitizeStringArrayMap(value) {
    const out = {};
    if (!value || typeof value !== "object") {
        return out;
    }
    for (const [key, items] of Object.entries(value)) {
        if (!Array.isArray(items)) {
            continue;
        }
        out[key] = items.map((item) => String(item));
    }
    return out;
}
function canonicalFunctionId(value) {
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
function dedupeDefinitions(definitions) {
    const byKey = new Map();
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
    return Array.from(byKey.values()).sort((a, b) => `${a.relativePath}:${a.lineStart}`.localeCompare(`${b.relativePath}:${b.lineStart}`));
}
function normalizeStateMap(input) {
    if (!input || typeof input !== "object") {
        return {};
    }
    const normalized = {};
    for (const [relativePath, rawState] of Object.entries(input)) {
        if (!rawState || typeof rawState !== "object") {
            continue;
        }
        const version = Number(rawState.version ?? 0);
        const contents = String(rawState.contents ?? "");
        const noteBase = typeof rawState.noteBase === "string" && rawState.noteBase.trim().length > 0
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
//# sourceMappingURL=versionTracker.js.map