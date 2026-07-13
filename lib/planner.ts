import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

// Supported European destinations for multi-destination search
export const SUPPORTED_DESTINATIONS: Record<string, { iata: string; cityName: string; countryCode: string }> = {
  Amsterdam: { iata: 'AMS', cityName: 'Amsterdam', countryCode: 'NL' },
  Copenhagen: { iata: 'CPH', cityName: 'Copenhagen', countryCode: 'DK' },
  Prague: { iata: 'PRG', cityName: 'Prague', countryCode: 'CZ' },
  Berlin: { iata: 'BER', cityName: 'Berlin', countryCode: 'DE' },
  Paris: { iata: 'CDG', cityName: 'Paris', countryCode: 'FR' },
  Barcelona: { iata: 'BCN', cityName: 'Barcelona', countryCode: 'ES' },
  Rome: { iata: 'FCO', cityName: 'Rome', countryCode: 'IT' },
  Vienna: { iata: 'VIE', cityName: 'Vienna', countryCode: 'AT' },
  Lisbon: { iata: 'LIS', cityName: 'Lisbon', countryCode: 'PT' },
  Dublin: { iata: 'DUB', cityName: 'Dublin', countryCode: 'IE' },
  Budapest: { iata: 'BUD', cityName: 'Budapest', countryCode: 'HU' },
  London: { iata: 'LHR', cityName: 'London', countryCode: 'GB' },
  Madrid: { iata: 'MAD', cityName: 'Madrid', countryCode: 'ES' },
};

export interface DestinationPlan {
  iata: string;
  cityName: string;
  countryCode: string;
}

export interface SearchConstraints {
  airline?: string | null;
  neighbourhood?: string | null;
  minStars?: number | null;
  maxStops?: number | null;
  budgetSignal?: string;
  pricePerNightMax?: number | null;
  pointOfInterest?: string | null;
  maxWalkingMinutes?: number | null;
  specificHotel?: string | null;
}

export interface SearchPlan {
  // Core strategy
  strategy: 'package' | 'hotel_led' | 'flight_led' | 'multi_destination';

  // Origin
  origin: string;
  originCity: string;

  // Destinations to search
  destinations: DestinationPlan[];

  // Date range
  dateRangeStart: string;
  dateRangeEnd: string;

  // How many weekends to check per destination
  weekendsToCheck: number;

  // What to optimise for
  weighting: 'total_cost' | 'quality_adjusted' | 'flight_first' | 'hotel_first';

  // Constraints
  constraints: SearchConstraints;

  // Explanation of the plan for debugging
  planRationale: string;

  // Original query preserved for synthesiser
  rawQuery: string;
}

const SYSTEM_PROMPT = `You are a travel search strategist for a Nordic weekend travel app. Your job is to design the optimal search strategy for a user's travel query.

Always respond with valid JSON only. No explanation, no markdown. Use this exact schema:
{
  "strategy": "package|hotel_led|flight_led|multi_destination",
  "origin": "IATA code",
  "originCity": "City name",
  "destinations": [
    { "iata": "AMS", "cityName": "Amsterdam", "countryCode": "NL" }
  ],
  "dateRangeStart": "YYYY-MM-DD",
  "dateRangeEnd": "YYYY-MM-DD",
  "weekendsToCheck": 4,
  "weighting": "total_cost|quality_adjusted|flight_first|hotel_first",
  "constraints": {
    "airline": "airline name or null",
    "neighbourhood": "area name or null",
    "minStars": "integer or null",
    "maxStops": "integer or null",
    "budgetSignal": "budget|mid|comfort|luxury|unspecified",
    "pricePerNightMax": "integer or null",
    "pointOfInterest": "venue name or null",
    "maxWalkingMinutes": "integer or null",
    "specificHotel": "hotel name or null"
  },
  "planRationale": "1 sentence explaining the strategy choice",
  "rawQuery": "original query verbatim"
}

Strategy selection rules:
- "hotel_led": user mentions a specific hotel name → fix the hotel, find cheapest weekend
- "flight_led": user mentions specific airline or departure time constraint as primary concern
- "multi_destination": user is flexible on destination ("best value European city break", "cheapest European weekend", "surprise me") → search 4-6 cities in parallel
- "package": default for specific destination queries — optimise flight + hotel combination

Destination rules:
- For multi_destination: pick 4-6 relevant European cities based on origin (Nordic travellers → include Copenhagen, Amsterdam, Berlin, Prague, Barcelona, Rome)
- For specific destination: single destination array
- Always use IATA codes from this list: AMS, CPH, PRG, BER, CDG, BCN, FCO, VIE, LIS, DUB, BUD, LHR, MAD

Origin rules:
- Default to ARN (Stockholm) if not specified
- Oslo = OSL, Copenhagen = CPH, Helsinki = HEL

Date rules:
- If no dates mentioned: next 3 months from today
- "this spring" = March-May, "summer" = June-August, "autumn/fall" = September-November

weekendsToCheck rules:
- hotel_led: 8 (searching one hotel across many weekends)
- multi_destination: 3 per destination (balance coverage vs speed)
- package/flight_led: 4 (good coverage without too many API calls)

Weighting rules:
- "total_cost": user mentions cheap/budget/cheapest/best value
- "quality_adjusted": user mentions nice/good/comfortable/quality
- "hotel_first": user has specific hotel preferences but flexible on flights
- "flight_first": user has specific flight preferences but flexible on hotel`;

export async function planSearch(userQuery: string): Promise<SearchPlan> {
  const today = new Date().toISOString().split('T')[0];

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Today is ${today}. Design the optimal search strategy for: "${userQuery}"`,
      },
    ],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const clean = text.replace(/```json|```/g, '').trim();

  try {
    return JSON.parse(clean) as SearchPlan;
  } catch {
    throw new Error(`Failed to parse search plan: ${text}`);
  }
}
