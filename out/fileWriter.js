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
exports.writeMainNode = writeMainNode;
exports.writeVersionNode = writeVersionNode;
exports.writeIndexNode = writeIndexNode;
exports.writeFunctionNodes = writeFunctionNodes;
const fs = __importStar(require("node:fs/promises"));
const path = __importStar(require("node:path"));
const noteNaming_1 = require("./noteNaming");
async function writeMainNode(vaultPaths, input) {
    const mainNodePath = path.join(vaultPaths.projectRoot, `${input.filename}.md`);
    const historyRows = [];
    for (let i = 1; i <= input.version; i += 1) {
        historyRows.push(`- [[${(0, noteNaming_1.versionNodeName)(input.filename, i)}]]`);
    }
    const markdown = [
        `# ${input.filename}`,
        "",
        `**Language:** ${input.language}`,
        `**Path:** ${input.relativePath}`,
        `**Last Synced:** ${input.syncedAt}`,
        `**Current Version:** [[${(0, noteNaming_1.versionNodeName)(input.filename, input.version)}]]`,
        `**Total Versions:** ${input.version}`,
        "",
        "## Version History",
        ...historyRows,
        "",
        "## Code",
        `\`\`\`${input.language}`,
        input.code,
        "```",
        "",
        "#feature",
        "",
    ].join("\n");
    await fs.writeFile(mainNodePath, markdown, "utf8");
}
async function writeVersionNode(vaultPaths, input) {
    const versionNodePath = path.join(vaultPaths.versionsDir, `${(0, noteNaming_1.versionNodeName)(input.filename, input.version)}.md`);
    const previousRef = input.previousVersion === null
        ? "none"
        : `[[${(0, noteNaming_1.versionNodeName)(input.filename, input.previousVersion)}]]`;
    const markdown = [
        `# ${input.filename} - v${input.version}`,
        "",
        `**File:** [[${input.filename}]]`,
        `**Synced At:** ${input.syncedAt}`,
        `**Version:** v${input.version}`,
        `**Previous Version:** ${previousRef}`,
        "",
        "## Stats",
        "| Metric | Value |",
        "|---|---|",
        `| Lines Added | +${input.diff.stats.linesAdded} |`,
        `| Lines Removed | -${input.diff.stats.linesRemoved} |`,
        `| Total Lines | ${input.diff.stats.totalLines} |`,
        `| File Size | ${input.diff.stats.fileSizeKb} KB |`,
        `| Change | ${input.diff.stats.changePercent}% from previous |`,
        "",
        "## Diff",
        "```diff",
        input.diff.unifiedDiff,
        "```",
        "",
        "#version",
        "",
    ].join("\n");
    await fs.writeFile(versionNodePath, markdown, "utf8");
}
async function writeIndexNode(vaultPaths, projectName, syncedAt, trackedFiles) {
    const rows = trackedFiles
        .sort((a, b) => a.relativePath.localeCompare(b.relativePath))
        .map((entry) => `- [[${entry.noteBase}|${entry.relativePath}]] (v${entry.version})`);
    const markdown = [
        `# ${projectName} - CodeSync Index`,
        "",
        `**Last Synced:** ${syncedAt}`,
        `**Tracked Files:** ${trackedFiles.length}`,
        "",
        "## Files",
        ...(rows.length > 0 ? rows : ["- none"]),
        "",
    ].join("\n");
    await fs.writeFile(vaultPaths.indexFile, markdown, "utf8");
}
async function writeFunctionNodes(vaultPaths, functionIndex, noteBaseByRelativePath = {}) {
    const records = Object.values(functionIndex.functionsById).sort((a, b) => a.id.localeCompare(b.id));
    const keepFilenames = new Set();
    for (const record of records) {
        const filename = functionFileName(record);
        keepFilenames.add(filename);
        const targetPath = path.join(vaultPaths.functionsDir, filename);
        const definedInLinks = dedupeLinks(record.definitions.map((item) => `[[${resolveNoteBase(noteBaseByRelativePath, item.relativePath)}|${item.relativePath}]]`));
        const introducedInLinks = dedupeLinks(record.definitions.map((item) => `[[${(0, noteNaming_1.versionNodeName)(resolveNoteBase(noteBaseByRelativePath, item.relativePath), item.introducedVersion)}]]`));
        const lineValues = dedupeLinks(record.definitions.map((item) => String(item.lineStart)));
        const kindValues = dedupeLinks(record.definitions.map((item) => item.kind));
        const callSiteLinks = dedupeLinks(record.callers.map((relativePath) => `[[${resolveNoteBase(noteBaseByRelativePath, relativePath)}|${relativePath}]]`));
        const frontmatter = [
            "---",
            `id: ${yamlString(record.id)}`,
            "type: function",
            "tags:",
            "  - codesync",
            "  - codesync/function",
            "status: active",
            "defined_in:",
            ...yamlList(definedInLinks),
            "introduced_in:",
            ...yamlList(introducedInLinks),
            "kind:",
            ...yamlList(kindValues),
            "line:",
            ...yamlList(lineValues),
            `caller_count: ${record.callers.length}`,
            "callers:",
            ...yamlList(callSiteLinks),
            `updated_at: ${yamlString(record.updatedAt)}`,
            "---",
            "",
        ].join("\n");
        const markdown = [
            frontmatter,
            `# ${record.id}`,
            "",
            "## Summary",
            `- Canonical function node for \`${record.id}\`.`,
            `- Definitions: ${record.definitions.length}`,
            `- Callers: ${record.callers.length}`,
            "",
            "## Call Sites",
            ...(callSiteLinks.length > 0 ? callSiteLinks.map((item) => `- ${item}`) : ["- none"]),
            "",
            "## Definitions",
            ...(record.definitions.length > 0
                ? record.definitions.map((item) => `- [[${resolveNoteBase(noteBaseByRelativePath, item.relativePath)}|${item.relativePath}]] @ line ${item.lineStart} (${item.kind})`)
                : ["- none"]),
            "",
            "## Function Code",
            ...(record.definitions.length > 0
                ? record.definitions.flatMap((item, index) => {
                    const language = languageFromRelativePath(item.relativePath);
                    const header = record.definitions.length > 1
                        ? [
                            `### Definition ${index + 1}`,
                            `[[${resolveNoteBase(noteBaseByRelativePath, item.relativePath)}|${item.relativePath}]] @ line ${item.lineStart}`,
                        ]
                        : [];
                    return [
                        ...header,
                        `\`\`\`${language}`,
                        item.code || "// function body unavailable",
                        "```",
                        "",
                    ];
                })
                : ["- none", ""]),
            "",
            "#function",
            "",
        ].join("\n");
        await fs.writeFile(targetPath, markdown, "utf8");
    }
    const existingEntries = await fs.readdir(vaultPaths.functionsDir, { withFileTypes: true });
    for (const entry of existingEntries) {
        if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== ".md") {
            continue;
        }
        if (keepFilenames.has(entry.name)) {
            continue;
        }
        await fs.unlink(path.join(vaultPaths.functionsDir, entry.name));
    }
}
function resolveNoteBase(noteBaseByRelativePath, relativePath) {
    return noteBaseByRelativePath[relativePath] || path.basename(relativePath);
}
function languageFromRelativePath(relativePath) {
    const ext = path.extname(relativePath).toLowerCase();
    switch (ext) {
        case ".ts":
            return "ts";
        case ".tsx":
            return "tsx";
        case ".js":
            return "js";
        case ".jsx":
            return "jsx";
        case ".mjs":
            return "js";
        case ".cjs":
            return "js";
        case ".py":
            return "python";
        default:
            return "text";
    }
}
function functionFileName(record) {
    const normalizedName = String(record.name || "anonymous")
        .replace(/[\\/:*?"<>|]/g, "_")
        .trim();
    const withParens = normalizedName.endsWith("()")
        ? normalizedName
        : `${normalizedName}()`;
    return `${withParens}.md`;
}
function dedupeLinks(values) {
    return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}
function yamlList(values) {
    if (values.length === 0) {
        return ["  - none"];
    }
    return values.map((value) => `  - ${yamlString(value)}`);
}
function yamlString(value) {
    const escaped = String(value).replace(/"/g, '\\"');
    return `"${escaped}"`;
}
//# sourceMappingURL=fileWriter.js.map