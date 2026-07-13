import { HotelOption } from './types';

/**
 * Turns a free-text hotel name ("nhow Amsterdam RAI") into a concrete inventory
 * match — and, crucially, tells you HOW confident that match is so the app can
 * behave differently for a solid hit, an "did you mean", and a genuine miss.
 *
 * Matching is token-based (order-independent) and strips the city name so that a
 * low-information token like "amsterdam" can't inflate every candidate's score.
 */

// Generic words that shouldn't count toward a match.
const STOPWORDS = new Set(['hotel', 'the', 'by', 'and', 'de', 'la', 'le', 'a', 'an']);

export type MatchStatus = 'exact' | 'fuzzy' | 'not_found';

export interface HotelMatch {
  status: MatchStatus;
  hotel: HotelOption | null; // best candidate; null only when nothing plausible
  score: number; // 0..1, fraction of query tokens found in the candidate
  alternatives: HotelOption[]; // next-best, for "did you mean" / fallback lists
}

function tokenize(s: string, extraStop: Set<string>): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0 && !STOPWORDS.has(t) && !extraStop.has(t));
}

export function resolveHotel(
  query: string,
  candidates: HotelOption[],
  cityName?: string,
): HotelMatch {
  // Strip the city so "amsterdam" doesn't count as a match signal.
  const extraStop = new Set<string>(
    cityName ? cityName.toLowerCase().split(/\s+/).filter(Boolean) : [],
  );
  const qTokens = tokenize(query, extraStop);

  if (qTokens.length === 0 || candidates.length === 0) {
    return {
      status: 'not_found',
      hotel: null,
      score: 0,
      alternatives: candidates.slice(0, 3),
    };
  }

  const scored = candidates
    .map((h) => {
      const cTokens = new Set(tokenize(h.name, extraStop));
      const matched = qTokens.filter((t) => cTokens.has(t)).length;
      return { hotel: h, score: matched / qTokens.length };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  const alternatives = scored.slice(1, 4).map((s) => s.hotel);

  // Thresholds are deliberately explicit and legible. Medium confidence does NOT
  // silently pick — it returns 'fuzzy' so the app can confirm with the user.
  let status: MatchStatus;
  if (best.score >= 0.8) status = 'exact';
  else if (best.score >= 0.4) status = 'fuzzy';
  else status = 'not_found';

  return {
    status,
    hotel: status === 'not_found' ? null : best.hotel,
    score: best.score,
    alternatives,
  };
}
