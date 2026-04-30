import { hasLatencyRegression, ILatencyMetrics } from "./metrics";
import { isStableRelease, IReleaseNote } from "./releases";
import { groupTodosByPriority, ITodoItem } from "./todos";
import { withTimeout } from "../services/retry";
import { sourceUtilityValue } from "../utils/index";

export interface IWorkflowSnapshot {
  todoRisk: "low" | "medium" | "high";
  latencyRisk: "low" | "high";
  releaseRisk: "low" | "high";
  summary: string;
}

export function buildWorkflowSnapshot(
  todos: ITodoItem[],
  metrics: ILatencyMetrics,
  release: IReleaseNote,
): IWorkflowSnapshot {
  const byPriority = groupTodosByPriority(todos);
  const todoRisk = byPriority.high > 0 ? "high" : byPriority.medium > 1 ? "medium" : "low";
  const latencyRisk = hasLatencyRegression(metrics, 150) ? "high" : "low";
  const releaseRisk = isStableRelease(release) ? "low" : "high";
  const utilityStamp = sourceUtilityValue();

  return {
    todoRisk,
    latencyRisk,
    releaseRisk,
    summary: `todoRisk=${todoRisk};latencyRisk=${latencyRisk};releaseRisk=${releaseRisk};utility=${utilityStamp}`,
  };
}

export async function buildWorkflowSnapshotSafe(
  todos: ITodoItem[],
  metrics: ILatencyMetrics,
  release: IReleaseNote,
): Promise<IWorkflowSnapshot> {
  return withTimeout(async () => buildWorkflowSnapshot(todos, metrics, release), 250);
}
