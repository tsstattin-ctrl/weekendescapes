import { HotelOption, ParsedIntent } from './types';
import { buildCacheKey, getCached, setCache } from './cache';

const LITEAPI_BASE = 'https://api.liteapi.travel/v3.0';

// Map destination IATA codes to country/city for LiteAPI
const CITY_MAP: Record<string, { countryCode: string; cityName: string }> = {
  AMS: { countryCode: 'NL', cityName: 'Amsterdam' },
  LON: { countryCode: 'GB', cityName: 'London' },
  PAR: { countryCode: 'FR', cityName: 'Paris' },
  BCN: { countryCode: 'ES', cityName: 'Barcelona' },
  CPH: { countryCode: 'DK', cityName: 'Copenhagen' },
  BER: { countryCode: 'DE', cityName: 'Berlin' },
  ROM: { countryCode: 'IT', cityName: 'Rome' },
  PRG: { countryCode: 'CZ', cityName: 'Prague' },
  VIE: { countryCode: 'AT', cityName: 'Vienna' },
  LIS: { countryCode: 'PT', cityName: 'Lisbon' },
  DUB: { countryCode: 'IE', cityName: 'Dublin' },
  ATH: { countryCode: 'GR', cityName: 'Athens' },
  MAD: { countryCode: 'ES', cityName: 'Madrid' },
  MIL: { countryCode: 'IT', cityName: 'Milan' },
  BUD: { countryCode: 'HU', cityName: 'Budapest' },
};

function buildBookingUrl(hotelId: string, checkin: string, checkout: string, affiliateId: string): string {
  const params = new URLSearchParams({
    aid: affiliateId,
    checkin,
    checkout,
    label: 'weekendescapes',
  });
  return `https://www.booking.com/hotel/search.html?${params}&ss=${hotelId}`;
}

export async function searchHotels(
  intent: ParsedIntent,
  checkin: string,
  checkout: string
): Promise<HotelOption[]> {
  const cacheKey = buildCacheKey({
    dest: intent.destination,
    checkin,
    checkout,
    budget: intent.budgetSignal,
    stars: String(intent.hotelPreferences?.stars || ''),
  });

  const cached = getCached<HotelOption[]>(cacheKey);
  if (cached) return cached;

  const cityInfo = CITY_MAP[intent.destination];
  if (!cityInfo) {
    console.warn(`No city mapping for ${intent.destination}`);
    return [];
  }

  const apiKey = process.env.LITEAPI_KEY || '';
  const affiliateId = process.env.BOOKING_AFFILIATE_ID || '';

  // Build star rating filter from intent
  const hotelPrefs = intent.hotelPreferences;
  const minStars = hotelPrefs?.stars || null;

  try {
    // Step 1: Get hotel rates for the city and dates
    const ratesBody: Record<string, any> = {
      checkin,
      checkout,
      currency: 'EUR',
      guestNationality: 'SE', // Swedish guests as default Nordic nationality
      occupancies: [{ adults: 2 }],
      countryCode: cityInfo.countryCode,
      cityName: cityInfo.cityName,
      limit: 20,
      timeout: 10,
    };

    // Add star filter if specified
    if (minStars) {
      ratesBody.starRating = [minStars];
    }

    // Add neighbourhood/area as natural language search if specified
    if (hotelPrefs?.neighbourhood) {
      ratesBody.aiSearch = `hotels in ${hotelPrefs.neighbourhood} area`;
    }

    const ratesResponse = await fetch(`${LITEAPI_BASE}/hotels/rates`, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'content-type': 'application/json',
        'X-API-Key': apiKey,
      },
      body: JSON.stringify(ratesBody),
    });

    if (!ratesResponse.ok) {
      console.error('LiteAPI rates error:', ratesResponse.status, await ratesResponse.text());
      return [];
    }

    const ratesData = await ratesResponse.json();
    const hotels = ratesData.data || [];

    if (hotels.length === 0) {
      console.warn('LiteAPI returned no hotels for', cityInfo.cityName);
      return [];
    }

    // Calculate number of nights
    const nights = Math.round(
      (new Date(checkout).getTime() - new Date(checkin).getTime()) / (1000 * 60 * 60 * 24)
    );

    // Map LiteAPI response to our HotelOption format
    const results: HotelOption[] = hotels
      .slice(0, 8)
      .map((h: any) => {
        const cheapestRate = h.roomTypes?.[0]?.rates?.[0];
        const pricePerNight = cheapestRate
          ? Math.round(cheapestRate.retailRate?.total?.[0]?.amount / nights) || 0
          : 0;
        const totalPrice = cheapestRate
          ? Math.round(cheapestRate.retailRate?.total?.[0]?.amount) || 0
          : 0;

        return {
          name: h.name || 'Unknown Hotel',
          stars: h.starRating || 0,
          reviewScore: h.guestScore ? parseFloat(h.guestScore) : 0,
          reviewCount: h.reviewCount || 0,
          pricePerNight,
          totalPrice,
          location: cityInfo.cityName,
          distanceFromCenter: h.distanceFromCityCenter
            ? `${h.distanceFromCityCenter} km from centre`
            : '',
          thumbnailUrl: h.mainPhoto || h.thumbnail || '',
          affiliateUrl: buildBookingUrl(h.hotelId || '', checkin, checkout, affiliateId),
        };
      })
      .filter((h: HotelOption) => h.totalPrice > 0);

    // Apply budget filter
    const budgetMax: Record<string, number> = {
      budget: 100,
      mid: 200,
      comfort: 350,
      luxury: 99999,
      unspecified: 99999,
    };
    const maxPerNight = budgetMax[intent.budgetSignal] || 99999;
    const filtered = results.filter(h => h.pricePerNight <= maxPerNight);

    const final = filtered.length > 0 ? filtered : results;
    setCache(cacheKey, final);
    return final;

  } catch (err) {
    console.error('LiteAPI hotel search failed:', err);
    return [];
  }
}
