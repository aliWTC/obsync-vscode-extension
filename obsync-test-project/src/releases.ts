export interface IReleaseInfo {
  version: string;
  channel: "alpha" | "beta" | "stable";
  notes: string;
}

export function getLatestRelease(): IReleaseInfo {
  return {
    version: "0.2.0",
    channel: "beta",
    notes: "Expanded feature coverage and mixed-language test files",
  };
}

export function isStableRelease(release: IReleaseInfo): boolean {
  return release.channel === "stable";
}
