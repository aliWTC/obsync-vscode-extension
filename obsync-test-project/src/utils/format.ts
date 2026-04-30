export function formatSummary(label: string, value: string | number): string {
  return `${label}=${value}`;
}

export function csv(values: Array<string | number>): string {
  return values.map((value) => String(value)).join(",");
}
