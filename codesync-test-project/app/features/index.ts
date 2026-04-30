export function appFeatureFlagSummary(): string {
  const flags = ["syncSidebar", "autoSync", "versionTags"];
  return flags.join(",");
}
