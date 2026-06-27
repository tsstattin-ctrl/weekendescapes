# Weekend Escapes

AI-powered weekend trip finder. Describe where you want to go in plain English — get the best flight + hotel combinations ranked and explained in seconds.

## How it works

1. **Intent parsing** — Claude extracts your origin, destination, date range, budget signal, and hotel preferences from your query
2. **Parallel search** — Flights fetched via SerpAPI (Google Flights) across all weekends in your range; hotels via Booking.com affiliate API
3. **Smart caching** — Results cached for 2 hours so repeat queries don't burn API credits
4. **AI ranking** — Claude ranks flight+hotel combinations against your original intent and explains the top pick in plain English

## Setup

### 1. Install dependencies
```bash
npm install
```

### 2. Configure environment variables
```bash
cp .env.example .env.local
```

Fill in your credentials in `.env.local`:

| Variable | Where to get it |
|----------|----------------|
| `SERPAPI_KEY` | [serpapi.com](https://serpapi.com) — free tier: 100 searches/month, paid from $50/month |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) |
| `BOOKING_AFFILIATE_ID` | [booking.com affiliate program](https://www.booking.com/affiliate-program/v2/index.html) |
| `BOOKING_API_KEY` | Provided after Booking.com affiliate approval |

### 3. Run locally
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 4. Deploy to Vercel
```bash
npm install -g vercel
vercel
```

Add your environment variables in the Vercel dashboard under Project Settings → Environment Variables.

## Project structure

```
weekendescapes/
├── lib/
│   ├── types.ts          # Shared TypeScript interfaces
│   ├── cache.ts          # In-memory caching layer
│   ├── intentParser.ts   # LLM call #1: natural language → structured params
│   ├── flightSearch.ts   # SerpAPI Google Flights integration
│   ├── hotelSearch.ts    # Booking.com affiliate API integration
│   ├── packageBuilder.ts # Combines flights + hotels into ranked packages
│   └── ranker.ts         # LLM call #2: ranks packages + writes recommendation
├── pages/
│   ├── api/
│   │   └── search.ts     # Main API route orchestrating the full flow
│   ├── _app.tsx
│   └── index.tsx         # Frontend UI
└── styles/
    └── globals.css
```

## Extending the project

### Add more destination cities
Edit the `CITY_DEST_IDS` map in `lib/hotelSearch.ts` with Booking.com dest_ids. Find dest_ids via the Booking.com `/locations` API endpoint.

### Add Travelpayouts flight affiliate
Replace the Google Flights booking URL in `lib/flightSearch.ts` with Travelpayouts deep links for Kiwi.com or Trip.com to earn ~€1.50 per flight booking.

### Improve caching at scale
Replace `node-cache` (in-memory, single server) with Redis via Upstash for persistent caching that survives server restarts and works across serverless instances.

### Add a Duffel integration
For direct flight sales (micro-OTA model), replace SerpAPI with [Duffel's API](https://duffel.com) — you become the seller and earn margin rather than affiliate fees.

## Revenue model

| Source | Rate | Notes |
|--------|------|-------|
| Booking.com hotel affiliate | ~4–8% of booking value | Primary revenue stream |
| Travelpayouts flight affiliate | ~€0.50–2 per booking | Add once hotel affiliate is working |
| Duffel direct flight sales | ~3–8% margin | Graduate to this at 5k+ MAU |

## Tech stack

- **Next.js 14** — React framework with serverless API routes
- **TypeScript** — Type safety across the full stack
- **Vercel** — Deployment (free tier works at low traffic)
- **SerpAPI** — Google Flights data
- **Booking.com Affiliate API** — Hotel inventory + affiliate links
- **Anthropic Claude** — Intent parsing + results ranking
- **node-cache** — In-memory result caching
