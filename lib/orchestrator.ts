import { SearchPlan, DestinationPlan } from './planner';
import { searchFlights } from './flightSearch';
import { searchHotels } from './hotelSearch';
import { buildPackages } from './packageBuilder';
import { resolveHotel, HotelMatch } from './hotelResolver';
import { WeekendPackage, FlightOption, HotelOption, ParsedIntent } from './types';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Stable identity for a hotel: prefer a real ID, fall back to normalised name.
// TODO: if HotelOption exposes a LiteAPI hotelId, use it directly and drop the cast.
function hotelKey(h: HotelOption): string {
  const id = (h as any).id ?? (h as any).hotelId;
  return id ? String(id) : h.name.toLowerCase().trim();
}

function dedupeByKey(hotels: HotelOption[]): HotelOption[] {
  const seen = new Map<string, HotelOption>();
  for (const h of hotels) {
    const k = hotelKey(h);
    if (!seen.has(k)) seen.set(k, h);
  }
  return Array.from(seen.values());
}

interface PackageMeta {
  isRequestedHotel: boolean;
  resolutionStatus: HotelMatch['status'];
  resolutionQuery: string | null;
}

function makePackage(
  weekend: { label: string },
  flight: FlightOption,
  hotel: HotelOption,
  meta: PackageMeta,
): WeekendPackage {
  return {
    id: `${weekend.label}-${hotel.name}`.replace(/\s/g, '-').toLowerCase(),
    weekendLabel: weekend.label,
    flight,
    hotel,
    totalCost: flight.totalPrice + hotel.totalPrice,
    ...meta,
  };
}

// Convert a SearchPlan into a ParsedIntent-compatible object for existing search functions
function planToIntent(plan: SearchPlan, destination: DestinationPlan): ParsedIntent {
  return {
    origin: plan.origin,
    originCity: plan.originCity,
    destination: destination.iata,
    destinationCity: destination.cityName,
    dateRangeStart: plan.dateRangeStart,
    dateRangeEnd: plan.dateRangeEnd,
    budgetSignal: (plan.constraints.budgetSignal as any) || 'unspecified',
    hotelPreferences: {
      neighbourhood: plan.constraints.neighbourhood || null,
      stars: plan.constraints.minStars || null,
      specificHotel: plan.constraints.specificHotel || null,
      amenities: [],
      pricePerNightMax: plan.constraints.pricePerNightMax || null,
      freeText: '',
      pointOfInterest: plan.constraints.pointOfInterest || null,
      maxWalkingMinutes: plan.constraints.maxWalkingMinutes || null,
    },
    flightPreferences: {
      preferredAirlines: plan.constraints.airline ? [plan.constraints.airline] : [],
      maxStops: plan.constraints.maxStops || null,
      preferredDepartureTime: null,
      maxDurationHours: null,
    },
    flexibility: 'any_weekend',
    searchMode: plan.strategy === 'hotel_led' ? 'hotel_led' : 'package',
    sources: ['booking'],
    rawQuery: plan.rawQuery,
  };
}

// Extract just the date part from datetime strings
function extractDate(datetime: string): string {
  return datetime.split('T')[0].split(' ')[0];
}

// Add N days to a YYYY-MM-DD date string
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

// Get weekends in a date range
function getWeekends(startDate: string, endDate: string, maxCount: number): Array<{ friday: string; sunday: string; label: string }> {
  const weekends = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  const current = new Date(start);

  while (current.getDay() !== 5) {
    current.setDate(current.getDate() + 1);
  }

  while (current <= end && weekends.length < maxCount) {
    const friday = current.toISOString().split('T')[0];
    const sunday = new Date(current);
    sunday.setDate(sunday.getDate() + 2);
    const sundayStr = sunday.toISOString().split('T')[0];

    if (sunday <= end) {
      const label = `${current.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}–${sunday.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
      weekends.push({ friday, sunday: sundayStr, label });
    }

    current.setDate(current.getDate() + 7);
  }

  return weekends;
}

// STRATEGY: Package search (default) — unchanged
async function executePackageStrategy(
  plan: SearchPlan,
  destination: DestinationPlan
): Promise<WeekendPackage[]> {
  const intent = planToIntent(plan, destination);

  console.log(`[orchestrator] Package search: ${plan.origin} → ${destination.iata}`);
  const flights = await searchFlights(intent);
  if (flights.length === 0) return [];

  const hotelsByWeekend = new Map<string, HotelOption[]>();
  const topFlights = flights.slice(0, plan.weekendsToCheck);

  for (const flight of topFlights) {
    const checkin = extractDate(flight.outbound.departure);
    const checkout = addDays(checkin, 2);
    console.log(`[orchestrator] Hotels for ${flight.weekendLabel} (${checkin} - ${checkout})`);
    const hotels = await searchHotels(intent, checkin, checkout);
    hotelsByWeekend.set(flight.weekendLabel, hotels);
    await sleep(1200);
  }

  return buildPackages(flights, hotelsByWeekend);
}

// STRATEGY: Hotel-led search (fix hotel, find cheapest weekend)
// Resolve the hotel ONCE, then hold that identity constant across every weekend.
async function executeHotelLedStrategy(
  plan: SearchPlan,
  destination: DestinationPlan
): Promise<WeekendPackage[]> {
  const intent = planToIntent(plan, destination);
  const query = plan.constraints.specificHotel || null;

  console.log(`[orchestrator] Hotel-led search for: ${query}`);

  const weekends = getWeekends(plan.dateRangeStart, plan.dateRangeEnd, plan.weekendsToCheck);

  // Flights for all weekends, keyed by label (same join as before).
  const allFlights = await searchFlights(intent);
  const flightByWeekend = new Map<string, FlightOption>();
  for (const f of allFlights) flightByWeekend.set(f.weekendLabel, f);

  // Phase 1 — gather hotel inventory per weekend once, and cache it (no extra calls).
  const inventory = new Map<string, HotelOption[]>();
  for (const weekend of weekends) {
    console.log(`[orchestrator] Hotel-led: inventory for ${weekend.label}`);
    inventory.set(weekend.label, await searchHotels(intent, weekend.friday, weekend.sunday));
    await sleep(1200);
  }

  // Phase 2 — resolve the requested hotel ONCE, against the union of all inventory.
  // (Resolving against every weekend avoids a mis-resolve when the hotel is sold
  // out on the first weekend we happen to look at.)
  const allCandidates = dedupeByKey(Array.from(inventory.values()).flat());
  const match: HotelMatch = query
    ? resolveHotel(query, allCandidates, destination.cityName)
    : { status: 'exact', hotel: allCandidates[0] ?? null, score: 1, alternatives: [] };

  console.log(
    `[orchestrator] Resolution: "${query}" → ${match.status} ` +
    `(${match.hotel?.name ?? 'none'}, score ${match.score.toFixed(2)})`,
  );

  const packages: WeekendPackage[] = [];

  // Phase 3a — genuine miss: DON'T pretend. Return the best available stays,
  // explicitly tagged as NOT the requested hotel so the UI can say
  // "We couldn't find '<query>' — here are the best-value stays instead."
  if (match.status === 'not_found' || !match.hotel) {
    for (const weekend of weekends) {
      const flight = flightByWeekend.get(weekend.label);
      const hotels = (inventory.get(weekend.label) ?? []).slice().sort((a, b) => a.totalPrice - b.totalPrice);
      const alt = hotels[0];
      if (flight && alt) {
        packages.push(makePackage(weekend, flight, alt, {
          isRequestedHotel: false,
          resolutionStatus: 'not_found',
          resolutionQuery: query,
        }));
      }
    }
    return packages.sort((a, b) => a.totalCost - b.totalCost);
  }

  // Phase 3b — hold the hotel constant. For each weekend, find the SAME hotel by
  // stable key. If it's unavailable that weekend, skip — never swap in a different one.
  const targetKey = hotelKey(match.hotel);
  for (const weekend of weekends) {
    const flight = flightByWeekend.get(weekend.label);
    if (!flight) continue;

    const hotels = inventory.get(weekend.label) ?? [];
    const sameHotel = hotels.find((h) => hotelKey(h) === targetKey);
    if (!sameHotel) {
      console.log(`[orchestrator] ${match.hotel.name} unavailable for ${weekend.label} — skipping (no silent swap)`);
      continue;
    }

    packages.push(makePackage(weekend, flight, sameHotel, {
      isRequestedHotel: true,
      resolutionStatus: match.status, // 'exact' | 'fuzzy'
      resolutionQuery: query,
    }));
  }

  // Savings vs average — now meaningful, because every package is the same hotel.
  if (packages.length > 1) {
    const avgCost = packages.reduce((sum, p) => sum + p.totalCost, 0) / packages.length;
    for (const pkg of packages) {
      pkg.savingVsAverage = Math.round(avgCost - pkg.totalCost);
    }
  }

  return packages.sort((a, b) => a.totalCost - b.totalCost);
}

// STRATEGY: Multi-destination (search multiple cities, find best overall) — unchanged
async function executeMultiDestinationStrategy(
  plan: SearchPlan
): Promise<WeekendPackage[]> {
  console.log(`[orchestrator] Multi-destination search across ${plan.destinations.length} cities`);

  const allResults = await Promise.all(
    plan.destinations.map(dest => executePackageStrategy(plan, dest))
  );

  const pooled: WeekendPackage[] = allResults.flat();
  return pooled.sort((a, b) => a.totalCost - b.totalCost);
}

// Main orchestrator entry point
export async function executeSearchPlan(plan: SearchPlan): Promise<WeekendPackage[]> {
  console.log(`[orchestrator] Executing strategy: ${plan.strategy}`);

  switch (plan.strategy) {
    case 'hotel_led':
      return executeHotelLedStrategy(plan, plan.destinations[0]);

    case 'multi_destination':
      return executeMultiDestinationStrategy(plan);

    case 'flight_led':
    case 'package':
    default:
      return executePackageStrategy(plan, plan.destinations[0]);
  }
}
