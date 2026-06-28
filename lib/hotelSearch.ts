import { HotelOption, ParsedIntent } from './types';
import { buildCacheKey, getCached, setCache } from './cache';

const BOOKING_BASE = 'https://distribution-xml.booking.com/2.0/json';

const CITY_DEST_IDS: Record<string, string> = {
  AMS: '-2140479',
  LON: '-2601889',
  PAR: '-1456928',
  BCN: '-372490',
  CPH: '-2745636',
  BER: '-1746443',
  ROM: '-126693',
  PRG: '-553173',
  VIE: '-1995499',
  LIS: '-2167973',
};

const MOCK_HOTELS: HotelOption[] = [
  {
    name: 'Hotel V Nesplein',
    stars: 4,
    reviewScore: 8.9,
    reviewCount: 2341,
    pricePerNight: 95,
    totalPrice: 190,
    location: 'Amsterdam Centre',
    distanceFromCenter: '0.3 km from centre',
    thumbnailUrl: '',
    affiliateUrl: 'https://www.booking.com',
  },
  {
    name: 'The Student Hotel Amsterdam City',
    stars: 3,
    reviewScore: 8.4,
    reviewCount: 1876,
    pricePerNight: 72,
    totalPrice: 144,
    location: 'Amsterdam',
    distanceFromCenter: '1.2 km from centre',
    thumbnailUrl: '',
    affiliateUrl: 'https://www.booking.com',
  },
  {
    name: 'INK Hotel Amsterdam',
    stars: 4,
    reviewScore: 9.1,
    reviewCount: 3102,
    pricePerNight: 128,
    totalPrice: 256,
    location: 'Amsterdam Centre',
    distanceFromCenter: '0.1 km from centre',
    thumbnailUrl: '',
    affiliateUrl: 'https://www.booking.com',
  },
  {
    name: 'Conscious Hotel Westerpark',
    stars: 3,
    reviewScore: 8.6,
    reviewCount: 987,
    pricePerNight: 85,
    totalPrice: 170,
    location: 'Amsterdam West',
    distanceFromCenter: '2.1 km from centre',
    thumbnailUrl: '',
    affiliateUrl: 'https://www.booking.com',
  },
];

function buildAffiliateUrl(hotelId: string, checkin: string, checkout: string, affiliateId: string): string {
  const params = new URLSearchParams({
    aid: affiliateId,
    hotel_id: hotelId,
    checkin,
    checkout,
    label: 'weekendescapes',
  });
  return `https://www.booking.com/hotel/nl/${hotelId}.html?${params}`;
}

export async function searchHotels(
  intent: ParsedIntent,
  checkin: string,
  checkout: string
): Promise<HotelOption[]> {
  const cacheKey = buildCacheKey({ dest: intent.destination, checkin, checkout });
  const cached = getCached<HotelOption[]>(cacheKey);
  if (cached) return cached;

  // Use mock data until Booking.com affiliate is approved
  const shuffled = [...MOCK_HOTELS].sort(() => Math.random() - 0.5);

  // Filter by star rating if user specified one
  const hotelPrefs = intent.hotelPreferences;
  const minStars = hotelPrefs?.stars || null;
  const filtered = minStars
    ? shuffled.filter(h => h.stars >= minStars)
    : shuffled;

  setCache(cacheKey, filtered);
  return filtered;
}
