process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import { FlightOption, ParsedIntent } from './types';
import { buildCacheKey, getCached, setCache } from './cache';

const SERPAPI_BASE = 'https://serpapi.com/search';

// Get all weekends in the date range
function getWeekends(startDate: string, endDate: string): Array<{ friday: string; sunday: string; label: string }> {
  const weekends = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  const current = new Date(start);

  // Advance to first Friday
  while (current.getDay() !== 5) {
    current.setDate(current.getDate() + 1);
  }

  while (current <= end) {
    const friday = current.toISOString().split('T')[0];
    const sunday = new Date(current);
    sunday.setDate(sunday.getDate() + 2);
    const sundayStr = sunday.toISOString().split('T')[0];

    if (sunday <= end) {
      const label = `${current.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}–${sunday.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
      weekends.push({ friday, sunday: sundayStr, label });
    }

    // Advance to next Friday
    current.setDate(current.getDate() + 7);
  }

  return weekends;
}

async function fetchFlightPrice(
  origin: string,
  destination: string,
  outboundDate: string,
  returnDate: string
): Promise<FlightOption | null> {
  const cacheKey = buildCacheKey({ origin, destination, outboundDate, returnDate });
  const cached = getCached<FlightOption>(cacheKey);
  if (cached) return cached;

  const params = new URLSearchParams({
    engine: 'google_flights',
    departure_id: origin,
    arrival_id: destination,
    outbound_date: outboundDate,
    return_date: returnDate,
    currency: 'EUR',
    hl: 'en',
    api_key: process.env.SERPAPI_KEY || '',
  });

  const response = await fetch(`${SERPAPI_BASE}?${params}`);
  if (!response.ok) return null;

  const data = await response.json();
  const bestFlight = data.best_flights?.[0] || data.other_flights?.[0];
  if (!bestFlight) return null;

  const result: FlightOption = {
    outbound: {
      departure: bestFlight.flights?.[0]?.departure_airport?.time || outboundDate,
      arrival: bestFlight.flights?.[0]?.arrival_airport?.time || outboundDate,
      airline: bestFlight.flights?.[0]?.airline || 'Unknown',
      flightNumber: bestFlight.flights?.[0]?.flight_number || '',
      duration: `${Math.floor(bestFlight.total_duration / 60)}h ${bestFlight.total_duration % 60}m`,
    },
    inbound: {
      departure: bestFlight.flights?.[bestFlight.flights.length - 1]?.departure_airport?.time || returnDate,
      arrival: bestFlight.flights?.[bestFlight.flights.length - 1]?.arrival_airport?.time || returnDate,
      airline: bestFlight.flights?.[bestFlight.flights.length - 1]?.airline || 'Unknown',
      flightNumber: bestFlight.flights?.[bestFlight.flights.length - 1]?.flight_number || '',
      duration: `${Math.floor(bestFlight.total_duration / 60)}h ${bestFlight.total_duration % 60}m`,
    },
    totalPrice: bestFlight.price || 0,
    currency: 'EUR',
    weekendLabel: '',
    bookingUrl: `https://www.google.com/flights?q=flights+${origin}+to+${destination}`,
  };

  setCache(cacheKey, result);
  return result;
}

export async function searchFlights(intent: ParsedIntent): Promise<FlightOption[]> {
  const weekends = getWeekends(intent.dateRangeStart, intent.dateRangeEnd);

  // Fetch up to 8 weekends in parallel
  const results = await Promise.all(
    weekends.slice(0, 8).map(async (weekend) => {
      const flight = await fetchFlightPrice(
        intent.origin,
        intent.destination,
        weekend.friday,
        weekend.sunday
      );
      if (flight) {
        flight.weekendLabel = weekend.label;
      }
      return flight;
    })
  );

  return results
    .filter((f): f is FlightOption => f !== null)
    .sort((a, b) => a.totalPrice - b.totalPrice);
}
