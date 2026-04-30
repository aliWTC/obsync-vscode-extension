import * as fs from "node:fs/promises";
import * as path from "node:path";
import { versionNodeName } from "./noteNaming";
import {
  IDiffResult,
  IFunctionGraphIndex,
  IFunctionNodeRecord,
  ITrackedFileVersion,
  IVaultPaths,
} from "./types";

interface IMainNodeInput {
  filename: string;
  relativePath: string;
  language: string;
  syncedAt: string;
  version: number;
  code: string;
}

interface IVersionNodeInput {
  filename: string;
  syncedAt: string;
  version: number;
  previousVersion: number | null;
  diff: IDiffResult;
}

export async function writeMainNode(
  vaultPaths: IVaultPaths,
  input: IMainNodeInput,
): Promise<void> {
  const mainNodePath = path.join(vaultPaths.projectRoot, `${input.filename}.md`);
  const historyRows = [];
  for (let i = 1; i <= input.version; i += 1) {
    historyRows.push(`- [[${versionNodeName(input.filename, i)}]]`);
  }

  const markdown = [
    `# ${input.filename}`,
    "",
    `**Language:** ${input.language}`,
    `**Path:** ${input.relativePath}`,
    `**Last Synced:** ${input.syncedAt}`,
    `**Current Version:** [[${versionNodeName(input.filename, input.version)}]]`,
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

export async function writeVersionNode(
  vaultPaths: IVaultPaths,
  input: IVersionNodeInput,
): Promise<void> {
  const versionNodePath = path.join(
    vaultPaths.versionsDir,
    `${versionNodeName(input.filename, input.version)}.md`,
  );
  const previousRef =
    input.previousVersion === null
      ? "none"
      : `[[${versionNodeName(input.filename, input.previousVersion)}]]`;

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

export async function writeIndexNode(
  vaultPaths: IVaultPaths,
  projectName: string,
  syncedAt: string,
  trackedFiles: ITrackedFileVersion[],
): Promise<void> {
  const rows = trackedFiles
    .sort((a, b) => a.relativePath.localeCompare(b.relativePath))
    .map(
      (entry) =>
        `- [[${entry.noteBase}|${entry.relativePath}]] (v${entry.version})`,
    );

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

export async function writeFunctionNodes(
  vaultPaths: IVaultPaths,
  functionIndex: IFunctionGraphIndex,
  noteBaseByRelativePath: Record<string, string> = {},
): Promise<void> {
  const records = Object.values(functionIndex.functionsById).sort((a, b) =>
    a.id.localeCompare(b.id),
  );
  const keepFilenames = new Set<string>();

  for (const record of records) {
    const filename = functionFileName(record);
    keepFilenames.add(filename);
    const targetPath = path.join(vaultPaths.functionsDir, filename);
    const definedInLinks = dedupeLinks(
      record.definitions.map(
        (item) => `[[${resolveNoteBase(noteBaseByRelativePath, item.relativePath)}|${item.relativePath}]]`,
      ),
    );
    const introducedInLinks = dedupeLinks(
      record.definitions.map((item) =>
        `[[${versionNodeName(resolveNoteBase(noteBaseByRelativePath, item.relativePath), item.introducedVersion)}]]`,
      ),
    );
    const lineValues = dedupeLinks(record.definitions.map((item) => String(item.lineStart)));
    const kindValues = dedupeLinks(record.definitions.map((item) => item.kind));
    const callSiteLinks = dedupeLinks(
      record.callers.map(
        (relativePath) =>
          `[[${resolveNoteBase(noteBaseByRelativePath, relativePath)}|${relativePath}]]`,
      ),
    );

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
        ? record.definitions.map(
            (item) =>
              `- [[${resolveNoteBase(noteBaseByRelativePath, item.relativePath)}|${item.relativePath}]] @ line ${item.lineStart} (${item.kind})`,
          )
        : ["- none"]),
      "",
      "## Function Code",
      ...(record.definitions.length > 0
        ? record.definitions.flatMap((item, index) => {
            const language = languageFromRelativePath(item.relativePath);
            const header =
              record.definitions.length > 1
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

function resolveNoteBase(
  noteBaseByRelativePath: Record<string, string>,
  relativePath: string,
): string {
  return noteBaseByRelativePath[relativePath] || path.basename(relativePath);
}

function languageFromRelativePath(relativePath: string): string {
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

function functionFileName(record: IFunctionNodeRecord): string {
  const normalizedName = String(record.name || "anonymous")
    .replace(/[\\/:*?"<>|]/g, "_")
    .trim();
  const withParens = normalizedName.endsWith("()")
    ? normalizedName
    : `${normalizedName}()`;
  return `${withParens}.md`;
}

function dedupeLinks(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function yamlList(values: string[]): string[] {
  if (values.length === 0) {
    return ["  - none"];
  }
  return values.map((value) => `  - ${yamlString(value)}`);
}

function yamlString(value: string): string {
  const escaped = String(value).replace(/"/g, '\\"');
  return `"${escaped}"`;
}
