import { formatName, toSlug } from "../utils/formatter";

export interface IReleaseNote {
  version: string;
  summary: string;
  stable: boolean;
  slug: string;
}

export function getLatestRelease(): IReleaseNote {
  const summary = formatName("improved sidebar controls and sync visibility");
  return {
    version: "0.2.0",
    summary,
    stable: true,
    slug: toSlug(summary),
  };
}

export function isStableRelease(note: IReleaseNote): boolean {
  return note.stable && note.version.startsWith("0.");
}
