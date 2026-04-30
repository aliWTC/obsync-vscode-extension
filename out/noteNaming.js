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
exports.buildNoteBaseMap = buildNoteBaseMap;
exports.versionNodeName = versionNodeName;
const path = __importStar(require("node:path"));
function buildNoteBaseMap(relativePaths, stateMap) {
    const sortedPaths = Array.from(new Set(relativePaths)).sort((a, b) => a.localeCompare(b));
    const entriesByBase = new Map();
    for (const relativePath of sortedPaths) {
        const basename = path.basename(relativePath);
        const existing = entriesByBase.get(basename) ?? [];
        existing.push(relativePath);
        entriesByBase.set(basename, existing);
    }
    const out = {};
    for (const [basename, paths] of entriesByBase.entries()) {
        if (paths.length === 1) {
            out[paths[0]] = getExistingOrDefault(paths[0], basename, stateMap);
            continue;
        }
        const states = paths.map((relativePath) => ({
            relativePath,
            noteBase: stateMap?.[relativePath]?.noteBase,
        }));
        const withExistingBase = states.filter((item) => item.noteBase === basename);
        const reserved = new Set();
        if (withExistingBase.length > 0) {
            const winner = withExistingBase
                .map((item) => item.relativePath)
                .sort((a, b) => a.localeCompare(b))[0];
            out[winner] = basename;
            reserved.add(basename);
        }
        else {
            out[paths[0]] = basename;
            reserved.add(basename);
        }
        for (const relativePath of paths) {
            if (out[relativePath]) {
                continue;
            }
            const existing = stateMap?.[relativePath]?.noteBase;
            if (existing && !reserved.has(existing)) {
                out[relativePath] = existing;
                reserved.add(existing);
                continue;
            }
            const generated = makeUniqueNoteBase(basename, relativePath, reserved);
            out[relativePath] = generated;
            reserved.add(generated);
        }
    }
    return out;
}
function versionNodeName(noteBase, version) {
    return `${noteBase}_v${version}`;
}
function makeUniqueNoteBase(basename, relativePath, reserved) {
    const normalizedPath = relativePath.replace(/\\/g, "/");
    const ext = path.extname(basename);
    const stem = ext.length > 0 ? basename.slice(0, -ext.length) : basename;
    const dirPath = path.dirname(normalizedPath);
    const dirSlug = slugify(dirPath === "." ? "root" : dirPath.replace(/\//g, "__"));
    let candidate = `${stem}__${dirSlug}${ext}`;
    if (!reserved.has(candidate)) {
        return candidate;
    }
    const fileSlug = slugify(normalizedPath.replace(/\//g, "__"));
    candidate = `${stem}__${fileSlug}${ext}`;
    if (!reserved.has(candidate)) {
        return candidate;
    }
    let index = 2;
    while (reserved.has(`${candidate}__${index}`)) {
        index += 1;
    }
    return `${candidate}__${index}`;
}
function slugify(value) {
    return value.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_").replace(/_+/g, "_");
}
function getExistingOrDefault(relativePath, basename, stateMap) {
    const existing = stateMap?.[relativePath]?.noteBase;
    return existing && existing.trim().length > 0 ? existing : basename;
}
//# sourceMappingURL=noteNaming.js.map