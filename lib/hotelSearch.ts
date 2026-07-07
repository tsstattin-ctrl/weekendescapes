import { HotelOption, ParsedIntent } from './types';
import { buildCacheKey, getCached, setCache } from './cache';

const LITEAPI_BASE = 'https://api.liteapi.travel/v3.0';

const CITY_MAP: Record<string, { countryCode: string; cityName: string }> = {
  AMS: { countryCode: 'NL', cityName: 'Amsterdam' },
  LON: { countryCode: 'GB', cityName: 'London' },
  LHR: { countryCode: 'GB', cityName: 'London' },
  PAR: { countryCode: 'FR', cityName: 'Paris' },
  CDG: { countryCode: 'FR', cityName: 'Paris' },
  BCN: { countryCode: 'ES', cityName: 'Barcelona' },
  CPH: { countryCode: 'DK', cityName: 'Copenhagen' },
  BER: { countryCode: 'DE', cityName: 'Berlin' },
  ROM: { countryCode: 'IT', cityName: 'Rome' },
  FCO: { countryCode: 'IT', cityName: 'Rome' },
  PRG: { countryCode: 'CZ', cityName: 'Prague' },
  VIE: { countryCode: 'AT', cityName: 'Vienna' },
  LIS: { countryCode: 'PT', cityName: 'Lisbon' },
  DUB: { countryCode: 'IE', cityName: 'Dublin' },
  ATH: { countryCode: 'GR', cityName: 'Athens' },
  MAD: { countryCode: 'ES', cityName: 'Madrid' },
  MIL: { countryCode: 'IT', cityName: 'Milan' },
  BUD: { countryCode: 'HU', cityName: 'Budapest' },
};

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function buildBookingUrl(checkin: string, checkout: string, cityName: string, affiliateId: string): string {
  const params = new URLSearchParams({
    aid: affiliateId,
    checkin,
    checkout,
    label: 'weekendescapes',
    ss: cityName,
  });
  return `https://www.booking.com/search.html?${params}`;
}

async function fetchHotelsForDates(
  intent: ParsedIntent,
  checkin: string,
  checkout: string
): Promise<HotelOption[]> {
  const cityInfo = CITY_MAP[intent.destination];
  if (!cityInfo) return [];

  const apiKey = process.env.LITEAPI_KEY || '';
  const affiliateId = process.env.BOOKING_AFFILIATE_ID || '101813175';
  const hotelPrefs = intent.hotelPreferences;
  const minStars = hotelPrefs?.stars || null;

  const checkinFormatted = formatDate(checkin);
  const checkoutFormatted = formatDate(checkout);

  const ratesBody: Record<string, any> = {
    checkin: checkinFormatted,
    checkout: checkoutFormatted,
    currency: 'EUR',
    guestNationality: 'SE',
    occupancies: [{ adults: 2 }],
    countryCode: cityInfo.countryCode,
    cityName: cityInfo.cityName,
    limit: 6,
    timeout: 8,
    includeHotelData: true,  // Returns a separate 'hotels' array with names/photos
  };

  if (minStars) ratesBody.starRating = [minStars];
  if (hotelPrefs?.neighbourhood) {
    ratesBody.aiSearch = `hotels in ${hotelPrefs.neighbourhood} ${cityInfo.cityName}`;
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
  // When includeHotelData=true, hotel metadata is in a separate 'hotels' array
  const hotelsMeta = ratesData.hotels || [];

  // Build a lookup map: hotelId -> metadata
  const metaMap = new Map<string, any>();
  for (const m of hotelsMeta) {
    metaMap.set(m.id || m.hotelId, m);
  }

  if (hotels.length === 0) return [];

  const nights = Math.round(
    (new Date(checkoutFormatted).getTime() - new Date(checkinFormatted).getTime()) / (1000 * 60 * 60 * 24)
  );

  return hotels
    .slice(0, 6)
    .map((h: any) => {
      const cheapestRate = h.roomTypes?.[0]?.rates?.[0];
      const totalAmount = cheapestRate?.retailRate?.total?.[0]?.amount || 0;
      const totalPrice = Math.round(totalAmount);
      const pricePerNight = nights > 0 ? Math.round(totalAmount / nights) : totalPrice;

      // Get metadata from the hotels array
      const meta = metaMap.get(h.hotelId) || {};

      return {
        name: meta.name || meta.hotelName || h.hotelId,
        stars: meta.starRating || meta.stars || 0,
        reviewScore: meta.rating ? parseFloat(meta.rating) : (meta.guestScore ? parseFloat(meta.guestScore) : 0),
        reviewCount: meta.reviewCount || meta.numberOfReviews || 0,
        pricePerNight,
        totalPrice,
        location: meta.address || cityInfo.cityName,
        distanceFromCenter: '',
        thumbnailUrl: meta.main_photo || meta.mainPhoto || meta.thumbnail || '',
        affiliateUrl: buildBookingUrl(checkinFormatted, checkoutFormatted, cityInfo.cityName, affiliateId),
      };
    })
    .filter((h: HotelOption) => h.totalPrice > 0);
}

export async function searchHotels(
  intent: ParsedIntent,
  checkin: string,
  checkout: string
): Promise<HotelOption[]> {
  const cacheKey = buildCacheKey({
    dest: intent.destination,
    checkin: formatDate(checkin),
    checkout: formatDate(checkout),
    budget: intent.budgetSignal,
    stars: String(intent.hotelPreferences?.stars || ''),
  });

  const cached = getCached<HotelOption[]>(cacheKey);
  if (cached) return cached;

  await sleep(Math.random() * 500);

  const results = await fetchHotelsForDates(intent, checkin, checkout);

  const budgetMax: Record<string, number> = {
    budget: 150,
    mid: 300,
    comfort: 500,
    luxury: 99999,
    unspecified: 99999,
  };
  const maxPerNight = budgetMax[intent.budgetSignal] || 99999;
  const filtered = results.filter(h => h.pricePerNight <= maxPerNight);
  const final = filtered.length > 0 ? filtered : results;

  if (final.length > 0) setCache(cacheKey, final);
  return final;
}
