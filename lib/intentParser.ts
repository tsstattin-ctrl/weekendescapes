import Anthropic from '@anthropic-ai/sdk';
import { ParsedIntent } from './types';

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a travel query parser. Extract structured search parameters from natural language travel queries.

Always respond with valid JSON only. No explanation, no markdown. Use this exact schema:
{
  "origin": "IATA airport code",
  "originCity": "City name",
  "destination": "IATA airport code", 
  "destinationCity": "City name",
  "dateRangeStart": "YYYY-MM-DD",
  "dateRangeEnd": "YYYY-MM-DD",
  "budgetSignal": "budget|mid|comfort|unspecified",
  "hotelPreferences": ["array", "of", "preference", "strings"],
  "flexibility": "any_weekend|specific_weekends"
}

Rules:
- If no date range is mentioned, default to the next 3 months from today
- If origin city is ambiguous, pick the largest nearby airport
- budgetSignal: "budget" = cheap/cheapest mentioned, "comfort" = nice/good hotel mentioned, "mid" = default
- hotelPreferences: extract location preferences, amenity mentions, neighbourhood names
- Always use IATA codes for origin and destination`;

export async function parseIntent(userQuery: string): Promise<ParsedIntent> {
  const today = new Date().toISOString().split('T')[0];

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `Today is ${today}. Parse this travel query: "${userQuery}"`,
      },
    ],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';

  try {
    const clean = text.replace(/```json|```/g, '').trim();
return JSON.parse(clean) as ParsedIntent;
  } catch {
    throw new Error(`Failed to parse intent from Claude response: ${text}`);
  }
}
