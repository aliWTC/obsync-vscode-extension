export interface IAppConfig {
  appName: string;
  environment: "dev" | "staging" | "prod";
  metricSpikeThreshold: number;
  cacheTtlSeconds: number;
}

export interface IWorkflowResult {
  ok: boolean;
  summary: string;
  warnings: string[];
}
