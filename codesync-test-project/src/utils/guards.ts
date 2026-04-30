export function assertNonEmpty(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${name} must not be empty`);
  }
  return normalized;
}

export function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value);
}
