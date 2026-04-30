import { formatName, toSlug } from "./utils/formatter";
import { runHealthCheck } from "./services/health";
import { buildTodoSummary, getOpenTodos, groupTodosByPriority } from "./features/todos";
import { calculateLatencyMetrics } from "./features/metrics";
import { buildCacheKey, InMemoryCache, shouldRefreshCache, ttlSeconds } from "./services/cache";
import { buildWorkflowSnapshot, buildWorkflowSnapshotSafe } from "./features/workflows";
import { assertNonEmpty, isFiniteNumber } from "./utils/guards";
import { retry } from "./services/retry";
import { getLatestRelease, isStableRelease } from "./features/releases";
import { sourceUtilityValue } from "./utils/index";

async function main(): Promise<void> {
  const rawName = assertNonEmpty("CodeSync Test App!!!", "rawName");
  const appName = formatName(rawName);
  const slug = toSlug(rawName);
  const health = runHealthCheck();
  const todos = getOpenTodos();
  const todoSummary = buildTodoSummary(todos);
  const latency = calculateLatencyMetrics([120, 130, 90, 110, 180, 220, 260]);
  const cacheKey = buildCacheKey("session", slug);
  const ttl = ttlSeconds(5);
  const cache = new InMemoryCache();
  cache.set(cacheKey, "cached-value");
  const shouldRefresh = shouldRefreshCache(cache.ageSeconds(cacheKey), ttl);
  const groupedTodos = groupTodosByPriority(todos);
  const release = getLatestRelease();
  const workflow = buildWorkflowSnapshot(todos, latency, release);
  const workflowSafe = await buildWorkflowSnapshotSafe(todos, latency, release);
  const stableRelease = isStableRelease(release);
  const retriedValue = await retry(async () => "ok", 2);
  const utilityStamp = sourceUtilityValue();

  console.log(`app=${appName} slug=${slug}`);
  console.log(`cacheKey=${cacheKey}`);
  console.log(`cacheValue=${cache.get(cacheKey)}`);
  console.log(`status=${health.status}`);
  console.log(`passed=${health.passedChecks.join(",")}`);
  console.log(`failed=${health.failedChecks.join(",")}`);
  console.log(`todoSummary=${todoSummary}`);
  console.log(`highPriorityTodos=${groupedTodos.high}`);
  console.log(`latencyP95=${latency.p95}`);
  console.log(`latencyP99=${latency.p99}`);
  console.log(`latencyStdDev=${latency.stdDev}`);
  console.log(`latencyHasFiniteStdDev=${isFiniteNumber(latency.stdDev)}`);
  console.log(`cacheRefreshNeeded=${shouldRefresh}`);
  console.log(`workflow=${workflow.summary}`);
  console.log(`workflowSafe=${workflowSafe.summary}`);
  console.log(`release=${release.version}:${release.slug}:${release.stable}`);
  console.log(`stableRelease=${stableRelease}`);
  console.log(`utilityStamp=${utilityStamp}`);
  console.log(`retryResult=${retriedValue}`);
}

void main();
