import type { NextApiRequest, NextApiResponse } from 'next';
import { parseIntent } from '../../lib/intentParser';
import { searchFlights } from '../../lib/flightSearch';
import { searchHotels } from '../../lib/hotelSearch';
import { buildPackages } from '../../lib/packageBuilder';
import { rankPackages } from '../../lib/ranker';
import { HotelOption, RankedResult } from '../../lib/types';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RankedResult | { error: string }>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { query } = req.body;
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Missing query' });
  }

  try {
    // Step 1: Parse natural language intent into structured params
    console.log('[search] Parsing intent for:', query);
    const intent = await parseIntent(query);
    console.log('[search] Parsed intent:', intent);

    // Step 2: Fetch flights across all weekends in the range (parallel)
    console.log('[search] Fetching flights...');
    const flights = await searchFlights(intent);
    console.log(`[search] Found ${flights.length} flight options`);

    if (flights.length === 0) {
      return res.status(200).json({
        packages: [],
        recommendation: 'No flights found for this route and date range. Try adjusting your dates or origin city.',
        tradeoffs: '',
      });
    }

    // Step 3: For each flight weekend, fetch hotels in parallel
    console.log('[search] Fetching hotels for each weekend...');
    const hotelsByWeekend = new Map<string, HotelOption[]>();

    await Promise.all(
      flights.slice(0, 6).map(async (flight) => {
        // Derive checkin/checkout from flight dates
        // Friday outbound → checkin Friday, checkout Sunday
        const checkin = flight.outbound.departure.split('T')[0];
        const checkout = flight.inbound.departure.split('T')[0];

        const hotels = await searchHotels(intent, checkin, checkout);
        hotelsByWeekend.set(flight.weekendLabel, hotels);
      })
    );

    // Step 4: Combine flights + hotels into ranked packages
    const packages = buildPackages(flights, hotelsByWeekend);
    console.log(`[search] Built ${packages.length} packages`);

    // Step 5: Ask Claude to rank and explain the top options
    const result = await rankPackages(packages, intent, query);

    return res.status(200).json(result);
  } catch (err) {
    console.error('[search] Error:', err);
    return res.status(500).json({
      error: 'Search failed. Please try again.',
    });
  }
}
