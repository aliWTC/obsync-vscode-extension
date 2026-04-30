import { getAppConfig } from "../config";
import { hasSpike, metricSpread, summarizeMetrics } from "../features/metrics";
import { getActiveReleaseWindows, getReleaseWindows } from "../features/releases";
import { getOpenTodos, groupTodosByPriority, summarizeTodos } from "../features/todos";
import { getLatestRelease, isStableRelease } from "../releases";
import { hasHealthFailures, runHealthChecks } from "../services/health";
import { retry } from "../services/retry";
import { IWorkflowResult } from "../types";
import { csv, formatSummary } from "../utils/format";

export async function runSyncWorkflow(): Promise<IWorkflowResult> {
  const config = getAppConfig();
  const openTodos = getOpenTodos();
  const groupedTodos = groupTodosByPriority(openTodos);
  const metrics = summarizeMetrics([120, 95, 140, 110, 205, 175]);
  const spread = metricSpread(metrics);
  const release = getLatestRelease();
  const activeWindows = getActiveReleaseWindows(getReleaseWindows());
  const checks = runHealthChecks();

  const summaryParts = [
    formatSummary("openTodos", openTodos.length),
    formatSummary("todoSummary", summarizeTodos(openTodos)),
    formatSummary("highPriorityTodos", groupedTodos.high),
    formatSummary("metricAvg", metrics.avg),
    formatSummary("metricP95", metrics.p95),
    formatSummary("metricSpread", spread),
    formatSummary("metricSampleCount", metrics.sampleCount),
    formatSummary("hasSpike", hasSpike(metrics, config.metricSpikeThreshold)),
    formatSummary("releaseVersion", release.version),
    formatSummary("activeReleaseWindows", activeWindows.length),
    formatSummary("releaseStable", isStableRelease(release)),
  ];

  const warnings: string[] = [];
  if (hasHealthFailures(checks)) {
    warnings.push("One or more health checks failed.");
  }
  if (groupedTodos.high > 1) {
    warnings.push("High priority todo count is elevated.");
  }
  if (hasSpike(metrics, config.metricSpikeThreshold)) {
    warnings.push("Metric spike threshold exceeded.");
  }
  if (activeWindows.length === 0) {
    warnings.push("No active release windows configured.");
  }

  await retry(async () => "workflow-ok", 2);

  return {
    ok: warnings.length === 0,
    summary: csv(summaryParts),
    warnings,
  };
}
