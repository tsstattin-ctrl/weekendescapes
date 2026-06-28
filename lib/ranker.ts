import Anthropic from '@anthropic-ai/sdk';
import { ParsedIntent, RankedResult, WeekendPackage } from './types';

const client = new Anthropic();

export async function rankPackages(
  packages: WeekendPackage[],
  intent: ParsedIntent,
  originalQuery: string
): Promise<RankedResult> {
  if (packages.length === 0) {
    return {
      packages: [],
      recommendation: 'No packages found for your search. Try broadening your date range or destination.',
      tradeoffs: '',
    };
  }

  const packageSummary = packages.map((p, i) => ({
    index: i + 1,
    weekend: p.weekendLabel,
    flightCost: `€${p.flight.totalPrice}`,
    airline: p.flight.outbound.airline,
    hotel: p.hotel.name,
    hotelStars: p.hotel.stars,
    hotelScore: p.hotel.reviewScore,
    hotelLocation: p.hotel.distanceFromCenter,
    hotelCostTotal: `€${p.hotel.totalPrice}`,
    totalCost: `€${p.totalCost}`,
  }));

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    system: `You are a travel advisor helping someone pick the best weekend trip package.
You will receive a list of flight+hotel combinations and the user's original query.
Respond with JSON only. No markdown. Schema:
{
  "rankedOrder": [array of package indices in order from best to worst],
  "recommendation": "2-3 sentence plain English explanation of the top pick and why it suits the user",
  "tradeoffs": "1-2 sentence summary of what the runner-up offers differently"
}`,
    messages: [
      {
        role: 'user',
        content: `User's original request: "${originalQuery}"

User preferences: ${JSON.stringify({
  budgetSignal: intent.budgetSignal,
  searchMode: intent.searchMode || 'package',
  hotelPreferences: intent.hotelPreferences,
  flightPreferences: intent.flightPreferences,
})}

Packages to rank:
${JSON.stringify(packageSummary, null, 2)}`,
      },
    ],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '{}';
  const clean = text.replace(/```json|```/g, '').trim();

  try {
    const parsed = JSON.parse(clean);
    const rankedPackages = (parsed.rankedOrder as number[])
      .map((i: number) => packages[i - 1])
      .filter(Boolean)
      .slice(0, 3);

    return {
      packages: rankedPackages,
      recommendation: parsed.recommendation || '',
      tradeoffs: parsed.tradeoffs || '',
    };
  } catch {
    return {
      packages: packages.slice(0, 3),
      recommendation: `Best value option: ${packages[0]?.weekendLabel} at €${packages[0]?.totalCost} total.`,
      tradeoffs: '',
    };
  }
}
