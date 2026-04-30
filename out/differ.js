"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeDiff = computeDiff;
const diff_1 = require("diff");
function computeDiff(filename, previousContents, currentContents) {
    const unifiedDiff = (0, diff_1.createTwoFilesPatch)(`${filename} (previous)`, `${filename} (current)`, previousContents, currentContents, "", "", { context: 3 });
    const previousLines = countDocumentLines(previousContents);
    const currentLines = countDocumentLines(currentContents);
    const lineChanges = (0, diff_1.diffLines)(previousContents, currentContents);
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
function countDocumentLines(contents) {
    if (!contents) {
        return 0;
    }
    return contents.split(/\r?\n/).length;
}
function countChangedLines(changes, type) {
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
function countPatchLines(value) {
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
//# sourceMappingURL=differ.js.map