export interface IReleaseWindow {
  windowId: string;
  active: boolean;
  plannedVersion: string;
}

export function getReleaseWindows(): IReleaseWindow[] {
  return [
    { windowId: "RW-1", active: true, plannedVersion: "0.3.0" },
    { windowId: "RW-2", active: false, plannedVersion: "0.3.1" },
    { windowId: "RW-3", active: true, plannedVersion: "0.4.0" },
  ];
}

export function getActiveReleaseWindows(windows: IReleaseWindow[]): IReleaseWindow[] {
  return windows.filter((window) => window.active);
}
