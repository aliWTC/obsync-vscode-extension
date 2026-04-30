export function buildCacheKey(scope: string, name: string): string {
  return `${scope}:${name}`.toLowerCase();
}

export function ttlSeconds(minutes: number): number {
  return Math.max(60, Math.floor(minutes * 60));
}

export function shouldRefreshCache(ageSeconds: number, ttl: number): boolean {
  return ageSeconds >= ttl;
}

export class InMemoryCache {
  private readonly values = new Map<string, { value: string; createdAt: number }>();

  public set(key: string, value: string): void {
    this.values.set(key, { value, createdAt: Date.now() });
  }

  public get(key: string): string | null {
    const entry = this.values.get(key);
    return entry ? entry.value : null;
  }

  public ageSeconds(key: string): number {
    const entry = this.values.get(key);
    if (!entry) {
      return Number.POSITIVE_INFINITY;
    }
    return Math.floor((Date.now() - entry.createdAt) / 1000);
  }
}
