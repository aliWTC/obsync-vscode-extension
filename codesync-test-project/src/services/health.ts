export interface IHealthCheckResult {
  status: "ok" | "degraded";
  passedChecks: string[];
  failedChecks: string[];
}

export function runHealthCheck(): IHealthCheckResult {
  const checks = collectChecks();

  const passedChecks = checks.filter((check) => check.ok).map((check) => check.name);
  const failedChecks = checks.filter((check) => !check.ok).map((check) => check.name);

  return {
    status: failedChecks.length === 0 ? "ok" : "degraded",
    passedChecks,
    failedChecks
  };
}

function collectChecks(): Array<{ name: string; ok: boolean }> {
  return [
    { name: "disk", ok: true },
    { name: "memory", ok: true },
    { name: "network", ok: false },
    { name: "vault-path", ok: true },
    { name: "function-index", ok: true }
  ];
}
