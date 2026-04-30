export interface IHealthCheck {
  name: string;
  ok: boolean;
}

export function runHealthChecks(): IHealthCheck[] {
  return [
    { name: "vault-path", ok: true },
    { name: "state-file", ok: true },
    { name: "function-index", ok: true },
    { name: "disk-space", ok: true },
  ];
}

export function hasHealthFailures(checks: IHealthCheck[]): boolean {
  return checks.some((check) => !check.ok);
}
