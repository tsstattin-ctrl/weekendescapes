import { SearchPlan, DestinationPlan } from './planner';
import { searchFlights } from './flightSearch';
import { searchHotels } from './hotelSearch';
import { buildPackages } from './packageBuilder';
import { WeekendPackage, FlightOption, HotelOption, ParsedIntent } from './types';

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

// STRATEGY: Package search (default)
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
    await new Promise(resolve => setTimeout(resolve, 1200));
  }

  return buildPackages(flights, hotelsByWeekend);
}

// STRATEGY: Hotel-led search (fix hotel, find cheapest weekend)
async function executeHotelLedStrategy(
  plan: SearchPlan,
  destination: DestinationPlan
): Promise<WeekendPackage[]> {
  const intent = planToIntent(plan, destination);
  const specificHotel = plan.constraints.specificHotel;

  console.log(`[orchestrator] Hotel-led search for: ${specificHotel}`);

  // Get all weekends in range
  const weekends = getWeekends(plan.dateRangeStart, plan.dateRangeEnd, plan.weekendsToCheck);

  // Fetch flights and hotel rates for each weekend
  const packages: WeekendPackage[] = [];

  // Get flights for all weekends first
  const allFlights = await searchFlights(intent);
  const flightByWeekend = new Map<string, FlightOption>();
  for (const f of allFlights) {
    flightByWeekend.set(f.weekendLabel, f);
  }

  // For each weekend, get hotel rates and pair with flight
  for (const weekend of weekends) {
    console.log(`[orchestrator] Hotel-led: checking ${weekend.label}`);

    // Search hotels with specificHotel in the intent
    const hotels = await searchHotels(intent, weekend.friday, weekend.sunday);

    // Find the specific hotel if possible, otherwise use cheapest
    const targetHotel = specificHotel
      ? hotels.find(h => h.name.toLowerCase().includes(specificHotel.toLowerCase())) || hotels[0]
      : hotels[0];

    const flight = flightByWeekend.get(weekend.label);

    if (targetHotel && flight) {
      const totalCost = flight.totalPrice + targetHotel.totalPrice;
      packages.push({
        id: `${weekend.label}-${targetHotel.name}`.replace(/\s/g, '-').toLowerCase(),
        weekendLabel: weekend.label,
        flight,
        hotel: targetHotel,
        totalCost,
      });
    }

    await new Promise(resolve => setTimeout(resolve, 1200));
  }

  // Calculate savings vs average
  if (packages.length > 1) {
    const avgCost = packages.reduce((sum, p) => sum + p.totalCost, 0) / packages.length;
    for (const pkg of packages) {
      pkg.savingVsAverage = Math.round(avgCost - pkg.totalCost);
    }
  }

  return packages.sort((a, b) => a.totalCost - b.totalCost);
}

// STRATEGY: Multi-destination (search multiple cities, find best overall)
async function executeMultiDestinationStrategy(
  plan: SearchPlan
): Promise<WeekendPackage[]> {
  console.log(`[orchestrator] Multi-destination search across ${plan.destinations.length} cities`);

  // Run package searches for all destinations in parallel
  const allResults = await Promise.all(
    plan.destinations.map(dest => executePackageStrategy(plan, dest))
  );

  // Pool all packages and tag with destination
  const pooled: WeekendPackage[] = allResults.flat();

  // Sort by total cost
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
