import type { NextApiRequest, NextApiResponse } from 'next';
import { planSearch } from '../../lib/planner';
import { executeSearchPlan } from '../../lib/orchestrator';
import { synthesiseResults } from '../../lib/synthesiser';
import { RankedResult } from '../../lib/types';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<RankedResult | { error: string }>
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { query } = req.body;
  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'Missing query' });
  }

  try {
    console.log('[search] Planning strategy for:', query);
    const plan = await planSearch(query);
    console.log('[search] Plan:', JSON.stringify({
      strategy: plan.strategy,
      destinations: plan.destinations.map(d => d.iata),
      weekendsToCheck: plan.weekendsToCheck,
      weighting: plan.weighting,
      constraints: plan.constraints,
      rationale: plan.planRationale,
    }));

    console.log('[search] Executing plan...');
    const packages = await executeSearchPlan(plan);
    console.log(`[search] Found ${packages.length} packages`);

    if (packages.length === 0) {
      return res.status(200).json({
        packages: [],
        recommendation: 'No packages found. Try broadening your dates, destination, or hotel preferences.',
        tradeoffs: '',
      });
    }

    console.log('[search] Synthesising results...');
    const result = await synthesiseResults(packages, plan);

    return res.status(200).json(result);
  } catch (err) {
    console.error('[search] Error:', err);
    return res.status(500).json({
      error: 'Search failed. Please try again.',
    });
  }
}
