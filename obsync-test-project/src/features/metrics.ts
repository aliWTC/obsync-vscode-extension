export interface IMetricSummary {
  min: number;
  max: number;
  avg: number;
  p95: number;
  sampleCount: number;
}

export function summarizeMetrics(samples: number[]): IMetricSummary {
  if (samples.length === 0) {
    return { min: 0, max: 0, avg: 0, p95: 0, sampleCount: 0 };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  const p95Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: Number((total / sorted.length).toFixed(2)),
    p95: sorted[p95Index],
    sampleCount: sorted.length,
  };
}

export function hasSpike(summary: IMetricSummary, threshold: number): boolean {
  return summary.p95 >= threshold;
}

export function metricSpread(summary: IMetricSummary): number {
  return summary.max - summary.min;
}
