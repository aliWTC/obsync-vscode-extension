import * as path from "node:path";
import { IStateMap } from "./types";

interface IStateWithPath {
  relativePath: string;
  noteBase?: string;
}

export function buildNoteBaseMap(
  relativePaths: string[],
  stateMap?: IStateMap,
): Record<string, string> {
  const sortedPaths = Array.from(new Set(relativePaths)).sort((a, b) => a.localeCompare(b));
  const entriesByBase = new Map<string, string[]>();
  for (const relativePath of sortedPaths) {
    const basename = path.basename(relativePath);
    const existing = entriesByBase.get(basename) ?? [];
    existing.push(relativePath);
    entriesByBase.set(basename, existing);
  }

  const out: Record<string, string> = {};
  for (const [basename, paths] of entriesByBase.entries()) {
    if (paths.length === 1) {
      out[paths[0]] = getExistingOrDefault(paths[0], basename, stateMap);
      continue;
    }

    const states: IStateWithPath[] = paths.map((relativePath) => ({
      relativePath,
      noteBase: stateMap?.[relativePath]?.noteBase,
    }));
    const withExistingBase = states.filter((item) => item.noteBase === basename);
    const reserved = new Set<string>();
    if (withExistingBase.length > 0) {
      const winner = withExistingBase
        .map((item) => item.relativePath)
        .sort((a, b) => a.localeCompare(b))[0];
      out[winner] = basename;
      reserved.add(basename);
    } else {
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

export function versionNodeName(noteBase: string, version: number): string {
  return `${noteBase}_v${version}`;
}

function makeUniqueNoteBase(
  basename: string,
  relativePath: string,
  reserved: Set<string>,
): string {
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

function slugify(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_").replace(/_+/g, "_");
}

function getExistingOrDefault(
  relativePath: string,
  basename: string,
  stateMap?: IStateMap,
): string {
  const existing = stateMap?.[relativePath]?.noteBase;
  return existing && existing.trim().length > 0 ? existing : basename;
}
