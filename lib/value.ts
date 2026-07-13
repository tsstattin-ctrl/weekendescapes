import { WeekendPackage } from './types';

/**
 * Value scoring for weekend packages.
 *
 * The ranking key is an "effective cost": the sticker price adjusted for travel
 * time. On a 2-night trip, hours in transit are hours you don't spend at the
 * destination, so a long/connecting flight is a real (hidden) cost. We express
 * that cost in euros so it sits on the same axis as price and stays explainable.
 */

export interface ValueConfig {
  /** One-way flight hours you accept before the travel-time penalty starts. */
  freeFlightHours: number;
  /** € of "lost weekend value" charged per one-way hour beyond the free allowance. */
  penaltyPerHour: number;
  /** € credited per review-score point above baseline. 0 disables quality tilt. */
  qualityWeight: number;
  /** Review score treated as neutral (no credit, no penalty). */
  qualityBaseline: number;
}

// Default: pure time-adjusted cost. This is what "best value" should use.
export const DEFAULT_VALUE_CONFIG: ValueConfig = {
  freeFlightHours: 2.5,
  penaltyPerHour: 25,
  qualityWeight: 0,
  qualityBaseline: 8.0,
};

// For queries that ask for a "nice"/"good" hotel: same time penalty, plus a
// credit for hotel quality so a meaningfully better hotel can win on value.
export const QUALITY_VALUE_CONFIG: ValueConfig = {
  ...DEFAULT_VALUE_CONFIG,
  qualityWeight: 40,
};

/** "6h 45m" -> 6.75. A raw number is treated as minutes (typical API storage). */
export function parseFlightHours(duration: string | number | undefined | null): number {
  if (duration == null) return 0;
  if (typeof duration === 'number') return duration > 24 ? duration / 60 : duration;
  const h = duration.match(/(\d+)\s*h/);
  const m = duration.match(/(\d+)\s*m/);
  return (h ? parseInt(h[1], 10) : 0) + (m ? parseInt(m[1], 10) : 0) / 60;
}

/**
 * Round-trip flight hours. Uses a real return leg if your Flight type carries
 * one; otherwise assumes the return is symmetric to the outbound.
 * TODO: if your Flight type has an `inbound` leg, drop the `as any` cast.
 */
export function roundTripHours(pkg: WeekendPackage): number {
  const out = parseFlightHours(pkg.flight.outbound?.duration);
  const inbound = (pkg.flight as any).inbound?.duration;
  return out + (inbound ? parseFlightHours(inbound) : out);
}

export interface ScoredPackage {
  pkg: WeekendPackage;
  effectiveCost: number; // ranking key
  travelPenalty: number; // € added for travel time (for display/prose)
  rtHours: number;       // round-trip flight hours (for display/prose)
}

export function scorePackage(
  pkg: WeekendPackage,
  config: ValueConfig = DEFAULT_VALUE_CONFIG,
): ScoredPackage {
  const rtHours = roundTripHours(pkg);
  const oneWay = rtHours / 2;
  const billableHours = Math.max(0, oneWay - config.freeFlightHours);
  const travelPenalty = Math.round(billableHours * config.penaltyPerHour * 2); // ×2 = round trip

  const qualityCredit =
    config.qualityWeight > 0
      ? Math.max(0, pkg.hotel.reviewScore - config.qualityBaseline) * config.qualityWeight
      : 0;

  const effectiveCost = pkg.totalCost + travelPenalty - qualityCredit;
  return { pkg, effectiveCost, travelPenalty, rtHours };
}

/** Rank best-to-worst by effective cost (ascending). Deterministic. */
export function rankByValue(
  packages: WeekendPackage[],
  config: ValueConfig = DEFAULT_VALUE_CONFIG,
): ScoredPackage[] {
  return packages
    .map((p) => scorePackage(p, config))
    .sort((a, b) => a.effectiveCost - b.effectiveCost);
}
