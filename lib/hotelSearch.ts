import { HotelOption, ParsedIntent } from './types';
import { buildCacheKey, getCached, setCache } from './cache';
import { geocodeLocation, getWalkingDistance, buildRadiusFilter } from './geocoding';
import { buildBookingAffiliateUrl } from './bookingUrl';

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

  // --- Geocoding: resolve neighbourhood or POI to coordinates ---
  let geoFilter: { latitude: number; longitude: number; radius: number } | null = null;
  let poiCoordinates: { lat: number; lng: number } | null = null;

  if (hotelPrefs?.neighbourhood) {
    console.log(`[geo] Geocoding neighbourhood: ${hotelPrefs.neighbourhood}`);
    const geo = await geocodeLocation(hotelPrefs.neighbourhood, cityInfo.cityName);
    if (geo) {
      console.log(`[geo] Resolved to: ${geo.formattedAddress} (${geo.coordinates.lat}, ${geo.coordinates.lng})`);
      geoFilter = buildRadiusFilter(geo.coordinates, 800); // 800m radius around neighbourhood centre
    }
  }

  if (hotelPrefs?.pointOfInterest) {
    console.log(`[geo] Geocoding POI: ${hotelPrefs.pointOfInterest}`);
    const geo = await geocodeLocation(hotelPrefs.pointOfInterest, cityInfo.cityName);
    if (geo) {
      poiCoordinates = geo.coordinates;
      console.log(`[geo] POI resolved to: ${geo.formattedAddress}`);
      // If no neighbourhood set, use POI as the centre with walking radius
      if (!geoFilter) {
        const walkingRadius = (hotelPrefs.maxWalkingMinutes || 15) * 80; // ~80m per minute walking
        geoFilter = buildRadiusFilter(geo.coordinates, walkingRadius);
      }
    }
  }

  // --- Build LiteAPI request ---
  const ratesBody: Record<string, any> = {
    checkin: checkinFormatted,
    checkout: checkoutFormatted,
    currency: 'EUR',
    guestNationality: 'SE',
    occupancies: [{ adults: 2 }],
    countryCode: cityInfo.countryCode,
    cityName: cityInfo.cityName,
    limit: 10,
    timeout: 8,
    includeHotelData: true,
  };

  // Use coordinate-based search if we have geo data
  if (geoFilter) {
    ratesBody.latitude = geoFilter.latitude;
    ratesBody.longitude = geoFilter.longitude;
    ratesBody.radius = geoFilter.radius;
    delete ratesBody.cityName; // lat/lng takes precedence
  }

  if (minStars) ratesBody.starRating = [minStars];

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
  const hotelsMeta = ratesData.hotels || [];

  const metaMap = new Map<string, any>();
  for (const m of hotelsMeta) {
    metaMap.set(m.id || m.hotelId, m);
  }

  if (hotels.length === 0) return [];

  const nights = Math.round(
    (new Date(checkoutFormatted).getTime() - new Date(checkinFormatted).getTime()) / (1000 * 60 * 60 * 24)
  );

  // Map hotel results
  let results: HotelOption[] = hotels
    .slice(0, 10)
    .map((h: any) => {
      const cheapestRate = h.roomTypes?.[0]?.rates?.[0];
      const totalAmount = cheapestRate?.retailRate?.total?.[0]?.amount || 0;
      const totalPrice = Math.round(totalAmount);
      const pricePerNight = nights > 0 ? Math.round(totalAmount / nights) : totalPrice;
      const meta = metaMap.get(h.hotelId) || {};

      // Extract hotel coordinates if available
      const hotelCoords = meta.latitude && meta.longitude
        ? { lat: parseFloat(meta.latitude), lng: parseFloat(meta.longitude) }
        : null;

      return {
        name: meta.name || meta.hotelName || h.hotelId,
        stars: meta.starRating || meta.stars || 0,
        reviewScore: meta.rating ? parseFloat(meta.rating) : (meta.guestScore ? parseFloat(meta.guestScore) : 0),
        reviewCount: meta.reviewCount || meta.numberOfReviews || 0,
        pricePerNight,
        totalPrice,
        location: cityInfo.cityName,
        distanceFromCenter: meta.distanceFromCityCenter
          ? `${parseFloat(meta.distanceFromCityCenter).toFixed(1)} km from centre`
          : '',
        thumbnailUrl: meta.main_photo || meta.mainPhoto || '',
        affiliateUrl: buildBookingAffiliateUrl(intent.destination, checkinFormatted, checkoutFormatted, affiliateId),
        coordinates: hotelCoords || undefined,
      };
    })
    .filter((h: HotelOption) => h.totalPrice > 0);

  // --- Walking distance filter: if POI specified, calculate and filter ---
  if (poiCoordinates && hotelPrefs?.maxWalkingMinutes) {
    console.log(`[geo] Filtering ${results.length} hotels by walking distance to POI...`);
    const walkingResults = await Promise.all(
      results.map(async (hotel) => {
        if (!hotel.coordinates) return { hotel, walking: null };
        const walking = await getWalkingDistance(
          hotel.coordinates,
          poiCoordinates!,
          hotelPrefs.maxWalkingMinutes!
        );
        return { hotel, walking };
      })
    );

    // Filter to hotels within walking limit and annotate with walking time
    const filtered = walkingResults
      .filter(({ walking }) => walking === null || walking.withinLimit)
      .map(({ hotel, walking }) => ({
        ...hotel,
        walkingMinutesToPoi: walking?.durationMinutes,
        distanceFromCenter: walking
          ? `${walking.durationMinutes} min walk to ${hotelPrefs.pointOfInterest}`
          : hotel.distanceFromCenter,
      }));

    if (filtered.length > 0) {
      results = filtered;
      console.log(`[geo] ${results.length} hotels within ${hotelPrefs.maxWalkingMinutes} min walk`);
    }
  }

  // Budget filter
  const budgetMax: Record<string, number> = {
    budget: 150,
    mid: 300,
    comfort: 500,
    luxury: 99999,
    unspecified: 99999,
  };
  const maxPerNight = budgetMax[intent.budgetSignal] || 99999;
  const filtered = results.filter(h => h.pricePerNight <= maxPerNight);
  return filtered.length > 0 ? filtered : results;
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
    neighbourhood: intent.hotelPreferences?.neighbourhood || '',
    poi: intent.hotelPreferences?.pointOfInterest || '',
  });

  const cached = getCached<HotelOption[]>(cacheKey);
  if (cached) return cached;

  await sleep(Math.random() * 300);

  const results = await fetchHotelsForDates(intent, checkin, checkout);

  if (results.length > 0) setCache(cacheKey, results);
  return results;
}
