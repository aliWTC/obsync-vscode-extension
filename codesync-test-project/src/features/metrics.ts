export interface ILatencyMetrics {
  min: number;
  max: number;
  avg: number;
  p95: number;
  p99: number;
  stdDev: number;
}

export function calculateLatencyMetrics(samplesMs: number[]): ILatencyMetrics {
  if (samplesMs.length === 0) {
    return { min: 0, max: 0, avg: 0, p95: 0, p99: 0, stdDev: 0 };
  }

  const sorted = [...samplesMs].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const avg = Number(
    (sorted.reduce((sum, current) => sum + current, 0) / sorted.length).toFixed(2),
  );
  const p95Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  const p95 = sorted[p95Index];
  const p99Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.99) - 1);
  const p99 = sorted[p99Index];
  const variance =
    sorted.reduce((sum, value) => sum + (value - avg) ** 2, 0) / sorted.length;
  const stdDev = Number(Math.sqrt(variance).toFixed(2));

  return { min, max, avg, p95, p99, stdDev };
}

export function hasLatencyRegression(
  current: ILatencyMetrics,
  previousP95: number,
): boolean {
  return current.p95 > previousP95 * 1.15;
}
