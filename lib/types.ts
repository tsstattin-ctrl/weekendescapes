export interface HotelPreferences {
  neighbourhood: string | null;
  stars: number | null;
  specificHotel: string | null;
  amenities: string[];
  pricePerNightMax: number | null;
  freeText: string;
  pointOfInterest: string | null;      // e.g. "Rijksmuseum", "Restaurant X"
  maxWalkingMinutes: number | null;    // e.g. 10
}

export interface FlightPreferences {
  preferredAirlines: string[];
  maxStops: number | null;
  preferredDepartureTime: 'morning' | 'afternoon' | 'evening' | null;
  maxDurationHours: number | null;
}

export interface ParsedIntent {
  origin: string;
  originCity: string;
  destination: string;
  destinationCity: string;
  dateRangeStart: string;
  dateRangeEnd: string;
  budgetSignal: 'budget' | 'mid' | 'comfort' | 'luxury' | 'unspecified';
  hotelPreferences: HotelPreferences;
  flightPreferences: FlightPreferences;
  flexibility: 'any_weekend' | 'specific_weekends';
  searchMode: 'package' | 'hotel_led' | 'flight_led';
  sources: Array<'booking' | 'agoda' | 'hotels_com'>;
  rawQuery: string;
}

export interface FlightOption {
  outbound: {
    departure: string;
    arrival: string;
    airline: string;
    flightNumber: string;
    duration: string;
  };
  inbound: {
    departure: string;
    arrival: string;
    airline: string;
    flightNumber: string;
    duration: string;
  };
  totalPrice: number;
  currency: string;
  weekendLabel: string;
  bookingUrl: string;
}

export interface HotelOption {
  name: string;
  stars: number;
  reviewScore: number;
  reviewCount: number;
  pricePerNight: number;
  totalPrice: number;
  location: string;
  distanceFromCenter: string;
  thumbnailUrl: string;
  affiliateUrl: string;
  coordinates?: { lat: number; lng: number };     // for walking distance filtering
  walkingMinutesToPoi?: number;                    // populated when POI search active
}

export interface WeekendPackage {
  id: string;
  weekendLabel: string;
  flight: FlightOption;
  hotel: HotelOption;
  totalCost: number;
  savingVsAverage?: number;
}

export interface RankedResult {
  packages: WeekendPackage[];
  recommendation: string;
  tradeoffs: string;
}
