import { HotelOption, ParsedIntent } from './types';
import { buildCacheKey, getCached, setCache } from './cache';

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

export async function searchHotels(
  intent: ParsedIntent,
  checkin: string,
  checkout: string
): Promise<HotelOption[]> {
  const cacheKey = buildCacheKey({ dest: intent.destination, checkin, checkout });
  const cached = getCached<HotelOption[]>(cacheKey);
  if (cached) return cached;

  // Shuffle slightly so different weekends get different hotel orderings
  const shuffled = [...MOCK_HOTELS].sort(() => Math.random() - 0.5);
  setCache(cacheKey, shuffled);
  return shuffled;
}