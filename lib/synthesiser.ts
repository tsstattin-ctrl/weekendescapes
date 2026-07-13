import Anthropic from '@anthropic-ai/sdk';
import { WeekendPackage, RankedResult } from './types';
import { SearchPlan } from './planner';

const client = new Anthropic();

export async function synthesiseResults(
  packages: WeekendPackage[],
  plan: SearchPlan,
): Promise<RankedResult> {
  if (packages.length === 0) {
    return {
      packages: [],
      recommendation: 'No packages found for your search. Try broadening your date range or being less specific on hotel preferences.',
      tradeoffs: '',
    };
  }

  const packageSummary = packages.map((p, i) => ({
    index: i + 1,
    destination: p.hotel.location,
    weekend: p.weekendLabel,
    flightCost: `€${p.flight.totalPrice}`,
    airline: p.flight.outbound.airline,
    flightDuration: p.flight.outbound.duration,
    hotel: p.hotel.name,
    hotelStars: p.hotel.stars,
    hotelScore: p.hotel.reviewScore,
    hotelLocation: p.hotel.distanceFromCenter,
    hotelCostTotal: `€${p.hotel.totalPrice}`,
    totalCost: `€${p.totalCost}`,
    walkingMinutesToPoi: p.hotel.walkingMinutesToPoi || null,
  }));

  const isMultiDestination = plan.strategy === 'multi_destination';
  const isHotelLed = plan.strategy === 'hotel_led';

  const systemPrompt = `You are an expert Nordic travel agent giving personalised advice. 
You will receive ranked travel packages and the user's original request.
Respond with JSON only. No markdown. Schema:
{
  "rankedOrder": [array of package indices best to worst],
  "recommendation": "2-3 sentence plain English explanation of the top pick, written like a travel agent — mention specific hotel name, flight details, total cost, and why it suits the user's request",
  "tradeoffs": "1-2 sentences about what the runner-up offers differently — be specific about the tradeoff (e.g. €30 more but better hotel score, or same price but different destination)"
}

${isMultiDestination ? 'This is a multi-destination search — lead with the destination comparison angle, e.g. "Prague beats Amsterdam on value this weekend because..."' : ''}
${isHotelLed ? 'This is a hotel-led search — the hotel is fixed, so focus on explaining which weekend timing offers the best total deal including flights.' : ''}
${plan.weighting === 'total_cost' ? 'Prioritise total cost in your ranking.' : ''}
${plan.weighting === 'quality_adjusted' ? 'Prioritise hotel quality and review scores, accepting slightly higher cost for meaningfully better hotels.' : ''}`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 600,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `User's request: "${plan.rawQuery}"

Search strategy: ${plan.strategy}
Optimising for: ${plan.weighting}
Constraints: ${JSON.stringify(plan.constraints)}

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
      recommendation: `Best option: ${packages[0]?.weekendLabel} at €${packages[0]?.totalCost} total.`,
      tradeoffs: '',
    };
  }
}
