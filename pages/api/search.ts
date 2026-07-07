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
    console.log('[search] Parsing intent for:', query);
    const intent = await parseIntent(query);
    console.log('[search] Parsed intent:', intent);

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

    // Fetch hotels for top 3 cheapest weekends sequentially to respect rate limits
    console.log('[search] Fetching hotels for each weekend...');
    const hotelsByWeekend = new Map<string, HotelOption[]>();

    const topFlights = flights.slice(0, 3);
    for (const flight of topFlights) {
      const checkin = flight.outbound.departure.split('T')[0];
      const checkout = flight.inbound.departure.split('T')[0];
      console.log(`[search] Fetching hotels for ${flight.weekendLabel} (${checkin} - ${checkout})`);
      const hotels = await searchHotels(intent, checkin, checkout);
      console.log(`[search] Got ${hotels.length} hotels for ${flight.weekendLabel}`);
      hotelsByWeekend.set(flight.weekendLabel, hotels);
      // Wait between requests to respect LiteAPI sandbox rate limits
      await new Promise(resolve => setTimeout(resolve, 1500));
    }

    const packages = buildPackages(flights, hotelsByWeekend);
    console.log(`[search] Built ${packages.length} packages`);

    const result = await rankPackages(packages, intent, query);

    return res.status(200).json(result);
  } catch (err) {
    console.error('[search] Error:', err);
    return res.status(500).json({
      error: 'Search failed. Please try again.',
    });
  }
}
