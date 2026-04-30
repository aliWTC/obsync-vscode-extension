import { IAppConfig } from "./types";

export function getAppConfig(): IAppConfig {
  return {
    appName: "obsync-test-project",
    environment: "dev",
    metricSpikeThreshold: 180,
    cacheTtlSeconds: 300,
  };
}
