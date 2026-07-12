import Anthropic from '@anthropic-ai/sdk';
import { ParsedIntent } from './types';

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a travel query parser. Extract structured search parameters from natural language travel queries, handling everything from vague to highly specific requests.

Always respond with valid JSON only. No explanation, no markdown. Use this exact schema:
{
  "origin": "IATA airport code",
  "originCity": "City name",
  "destination": "IATA airport code",
  "destinationCity": "City name",
  "dateRangeStart": "YYYY-MM-DD",
  "dateRangeEnd": "YYYY-MM-DD",
  "budgetSignal": "budget|mid|comfort|luxury|unspecified",
  "hotelPreferences": {
    "neighbourhood": "specific area or district if mentioned, else null",
    "stars": "minimum star rating as integer if mentioned, else null",
    "specificHotel": "exact hotel name if mentioned, else null",
    "amenities": ["array of specific amenities mentioned"],
    "pricePerNightMax": "maximum price per night as integer if mentioned, else null",
    "freeText": "any other hotel preferences not captured above",
    "pointOfInterest": "specific restaurant, museum, landmark or venue mentioned for proximity search, else null",
    "maxWalkingMinutes": "maximum walking time in minutes to POI as integer, else null"
  },
  "flightPreferences": {
    "preferredAirlines": ["array of airline names if mentioned, else empty array"],
    "maxStops": "integer if mentioned (0=direct only), else null",
    "preferredDepartureTime": "morning|afternoon|evening|null",
    "maxDurationHours": "integer if mentioned, else null"
  },
  "flexibility": "any_weekend|specific_weekends",
  "searchMode": "package|hotel_led|flight_led",
  "sources": ["booking", "agoda", "hotels_com"],
  "rawQuery": "the original query verbatim"
}

Rules:
- If no date range mentioned, default to next 3 months from today
- origin: if not mentioned, default to OSL (Oslo)
- budgetSignal: "budget"=cheap/cheapest, "comfort"=nice/good, "luxury"=luxury/five-star, "mid"=default
- searchMode: "hotel_led" if user specifies a hotel name or very specific hotel constraints; "flight_led" if user cares mainly about flight timing/price; "package" for balanced search (default)
- sources: always include "booking"; add "agoda" and "hotels_com" if user asks to search across aggregators
- neighbourhood: extract district/area names precisely (e.g. "Jordaan", "14th arrondissement", "Shoreditch")
- stars: extract as integer (e.g. "four-star" = 4, "5 star" = 5)
- pointOfInterest: extract specific venues, restaurants, museums, landmarks (e.g. "Rijksmuseum", "Restaurant X", "Eiffel Tower")
- maxWalkingMinutes: extract walking time constraints (e.g. "10 minute walk" = 10, "walking distance" = 15)
- If user mentions a specific hotel, set searchMode to "hotel_led" and specificHotel to that name
- Always use IATA codes for origin and destination`;

export async function parseIntent(userQuery: string): Promise<ParsedIntent> {
  const today = new Date().toISOString().split('T')[0];

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 800,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Today is ${today}. Parse this travel query: "${userQuery}"`,
      },
    ],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const clean = text.replace(/```json|```/g, '').trim();

  try {
    return JSON.parse(clean) as ParsedIntent;
  } catch {
    throw new Error(`Failed to parse intent from Claude response: ${text}`);
  }
}
