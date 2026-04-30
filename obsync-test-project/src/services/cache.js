function buildCacheKey(scope, name) {
  return `${scope}:${name}`.toLowerCase();
}

function shouldRefreshCache(ageSeconds, ttlSeconds) {
  return ageSeconds >= ttlSeconds;
}

module.exports = {
  buildCacheKey,
  shouldRefreshCache,
};
