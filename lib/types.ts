export interface ParsedIntent {
  origin: string;           // e.g. "OSL"
  originCity: string;       // e.g. "Oslo"
  destination: string;      // e.g. "AMS"
  destinationCity: string;  // e.g. "Amsterdam"
  dateRangeStart: string;   // ISO date e.g. "2025-03-01"
  dateRangeEnd: string;     // ISO date e.g. "2025-04-30"
  budgetSignal: 'budget' | 'mid' | 'comfort' | 'unspecified';
  hotelPreferences: string[]; // e.g. ["central", "walking distance to museums"]
  flexibility: 'any_weekend' | 'specific_weekends';
}

export interface FlightOption {
  outbound: {
    departure: string;    // ISO datetime
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
  totalPrice: number;     // EUR
  currency: string;
  weekendLabel: string;   // e.g. "Mar 14–16"
  bookingUrl: string;
}

export interface HotelOption {
  name: string;
  stars: number;
  reviewScore: number;    // 0–10
  reviewCount: number;
  pricePerNight: number;  // EUR
  totalPrice: number;     // for the stay duration
  location: string;
  distanceFromCenter: string;
  thumbnailUrl: string;
  affiliateUrl: string;
}

export interface WeekendPackage {
  id: string;
  weekendLabel: string;   // e.g. "Mar 14–16"
  flight: FlightOption;
  hotel: HotelOption;
  totalCost: number;
  savingVsAverage?: number;
}

export interface RankedResult {
  packages: WeekendPackage[];
  recommendation: string;   // Claude's plain-English top pick explanation
  tradeoffs: string;        // Brief summary of alternatives
}
