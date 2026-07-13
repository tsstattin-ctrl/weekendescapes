import Anthropic from '@anthropic-ai/sdk';
import { WeekendPackage, RankedResult } from './types';
import { SearchPlan } from './planner';
import {
  rankByValue,
  DEFAULT_VALUE_CONFIG,
  QUALITY_VALUE_CONFIG,
  ScoredPackage,
} from './value';

const client = new Anthropic();

export async function synthesiseResults(
  packages: WeekendPackage[],
  plan: SearchPlan,
): Promise<RankedResult> {
  if (packages.length === 0) {
    return {
      packages: [],
      recommendation:
        'No packages found for your search. Try broadening your date range or being less specific on hotel preferences.',
      tradeoffs: '',
    };
  }

  // 1. RANKING HAPPENS HERE, IN CODE — not in the LLM. Deterministic and tunable.
  const config =
    plan.weighting === 'quality_adjusted' ? QUALITY_VALUE_CONFIG : DEFAULT_VALUE_CONFIG;
  const ranked: ScoredPackage[] = rankByValue(packages, config);
  const top = ranked.slice(0, 3);

  // 2. Summary is built in final ranked order and exposes the value maths, so the
  //    prose can reference the travel-time tradeoff accurately instead of guessing.
  const packageSummary = top.map((s, i) => ({
    rank: i + 1,
    destination: s.pkg.hotel.location,
    weekend: s.pkg.weekendLabel,
    airline: s.pkg.flight.outbound.airline,
    flightDuration: s.pkg.flight.outbound.duration,
    roundTripHours: Number(s.rtHours.toFixed(1)),
    hotel: s.pkg.hotel.name,
    hotelStars: s.pkg.hotel.stars,
    hotelScore: s.pkg.hotel.reviewScore,
    flightCost: `€${s.pkg.flight.totalPrice}`,
    hotelCostTotal: `€${s.pkg.hotel.totalPrice}`,
    totalCost: `€${s.pkg.totalCost}`, // sticker price
    travelTimePenalty: `€${s.travelPenalty}`,
    effectiveValueCost: `€${s.effectiveCost}`, // the ranking key
  }));

  // Did the cheapest-on-paper option get out-ranked by travel time? If so, tell the
  // model to explain the divergence rather than contradict the ranking.
  const cheapestOnPaper = [...packages].sort((a, b) => a.totalCost - b.totalCost)[0];
  const winnerBeatCheapest = cheapestOnPaper && top[0].pkg !== cheapestOnPaper;

  const isMultiDestination = plan.strategy === 'multi_destination';
  const isHotelLed = plan.strategy === 'hotel_led';

  const systemPrompt = `You are an expert Nordic travel agent giving personalised advice.
The packages you receive are ALREADY ranked best-to-worst by value. Do NOT re-rank them.
"Value" = total price adjusted for travel time: long or connecting flights are penalised because they eat into a short weekend. "effectiveValueCost" is the ranking key; "totalCost" is the sticker price.

Respond with JSON only. No markdown. Schema:
{
  "recommendation": "2-3 sentences on the rank-1 pick, like a travel agent — name the hotel, the flight (airline + duration), the total cost, and why it suits the request",
  "tradeoffs": "1-2 sentences on what rank 2 offers differently — be specific about the tradeoff (e.g. €30 cheaper on paper but 5h more round-trip travel)"
}

${
  winnerBeatCheapest
    ? 'IMPORTANT: the rank-1 pick is NOT the cheapest on paper — a cheaper option was out-ranked because its flight is much longer. Explicitly explain this: name the cheaper option, its sticker price, and why the extra travel time makes the top pick the better weekend.'
    : ''
}
${
  isMultiDestination
    ? 'Lead with the destination comparison angle (e.g. "Berlin beats Vienna on value this weekend because...").'
    : ''
}
${
  isHotelLed
    ? 'The hotel is fixed, so focus on which weekend timing gives the best total deal including flights.'
    : ''
}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `User's request: "${plan.rawQuery}"

Strategy: ${plan.strategy}
Constraints: ${JSON.stringify(plan.constraints)}

Packages (already ranked best-to-worst by value):
${JSON.stringify(packageSummary, null, 2)}`,
      },
    ],
  });

  // Robustly pick the text block rather than assuming content[0].
  const textBlock = response.content.find((b) => b.type === 'text');
  const text = textBlock && textBlock.type === 'text' ? textBlock.text : '{}';
  const clean = text.replace(/```json|```/g, '').trim();

  const rankedPackages = top.map((s) => s.pkg);

  try {
    const parsed = JSON.parse(clean);
    return {
      packages: rankedPackages, // order comes from code, not the model
      recommendation: parsed.recommendation || '',
      tradeoffs: parsed.tradeoffs || '',
    };
  } catch {
    return {
      packages: rankedPackages,
      recommendation: `Best value: ${rankedPackages[0]?.weekendLabel} at €${rankedPackages[0]?.totalCost} total.`,
      tradeoffs: '',
    };
  }
}
