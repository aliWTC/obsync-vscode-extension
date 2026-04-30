import { createTwoFilesPatch, diffLines } from "diff";
import { IDiffResult } from "./types";

export function computeDiff(
  filename: string,
  previousContents: string,
  currentContents: string,
): IDiffResult {
  const unifiedDiff = createTwoFilesPatch(
    `${filename} (previous)`,
    `${filename} (current)`,
    previousContents,
    currentContents,
    "",
    "",
    { context: 3 },
  );

  const previousLines = countDocumentLines(previousContents);
  const currentLines = countDocumentLines(currentContents);
  const lineChanges = diffLines(previousContents, currentContents);
  const linesAdded = countChangedLines(lineChanges, "added");
  const linesRemoved = countChangedLines(lineChanges, "removed");
  const totalLines = currentLines;
  const fileSizeKb = Number((Buffer.byteLength(currentContents, "utf8") / 1024).toFixed(2));
  const denominator = Math.max(previousLines, 1);
  const changePercent = Number((((linesAdded + linesRemoved) / denominator) * 100).toFixed(2));

  return {
    unifiedDiff,
    stats: {
      linesAdded,
      linesRemoved,
      totalLines,
      fileSizeKb,
      changePercent,
    },
  };
}

function countDocumentLines(contents: string): number {
  if (!contents) {
    return 0;
  }
  return contents.split(/\r?\n/).length;
}

function countChangedLines(
  changes: Array<{ value: string; added?: boolean; removed?: boolean }>,
  type: "added" | "removed",
): number {
  let count = 0;
  for (const change of changes) {
    if (type === "added" && !change.added) {
      continue;
    }
    if (type === "removed" && !change.removed) {
      continue;
    }
    count += countPatchLines(change.value);
  }
  return count;
}

function countPatchLines(value: string): number {
  if (!value) {
    return 0;
  }
  const normalized = value.replace(/\r\n/g, "\n");
  const rawSegments = normalized.split("\n");
  if (normalized.endsWith("\n")) {
    rawSegments.pop();
  }
  return rawSegments.length;
}
