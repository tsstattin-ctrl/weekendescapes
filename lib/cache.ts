import NodeCache from 'node-cache';

// Cache lives in memory on the server process
// TTL defaults to 2 hours — flight prices don't change minute-to-minute
const cache = new NodeCache({
  stdTTL: parseInt(process.env.CACHE_TTL || '7200'),
  checkperiod: 600,
});

export function getCached<T>(key: string): T | undefined {
  return cache.get<T>(key);
}

export function setCache<T>(key: string, value: T): void {
  cache.set(key, value);
}

// Build a deterministic cache key from search parameters
export function buildCacheKey(params: Record<string, string>): string {
  return Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}:${v}`)
    .join('|');
}
