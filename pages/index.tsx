import { useState } from 'react';
import Head from 'next/head';
import { RankedResult, WeekendPackage } from '../lib/types';

const EXAMPLE_QUERIES = [
  'Cheap weekend in Amsterdam from Oslo, March or April',
  'Nice hotel in Copenhagen from Stockholm, any weekend this spring',
  'Budget weekend Prague from London, flexible on dates',
];

function PackageCard({ pkg, isTop }: { pkg: WeekendPackage; isTop: boolean }) {
  return (
    <div className={`package-card ${isTop ? 'top-pick' : ''}`}>
      {isTop && <div className="top-badge">⭐ Top Pick</div>}
      <div className="card-body">
        {/* Flight column */}
        <div>
          <div className="card-section-label">✈️ Flight</div>
          <div className="weekend-label">{pkg.weekendLabel}</div>
          <div className="flight-detail">
            {pkg.flight.outbound.airline} · {pkg.flight.outbound.duration}
          </div>
          <div className="flight-detail" style={{ color: 'var(--mist)', fontSize: '0.8rem' }}>
            {pkg.flight.outbound.flightNumber}
          </div>
        </div>

        {/* Hotel column */}
        <div>
          <div className="card-section-label">🏨 Hotel</div>
          <div className="flight-detail" style={{ fontWeight: 600 }}>{pkg.hotel.name}</div>
          <div className="flight-detail" style={{ color: 'var(--mist)', fontSize: '0.8rem' }}>
            {pkg.hotel.distanceFromCenter}
          </div>
          {pkg.hotel.reviewScore > 0 && (
            <div className="hotel-score">
              {pkg.hotel.reviewScore.toFixed(1)} · {pkg.hotel.reviewCount.toLocaleString()} reviews
            </div>
          )}
        </div>

        {/* Price column */}
        <div className="price-col">
          <div className="total-price">€{pkg.totalCost}</div>
          <div className="price-breakdown">
            ✈️ €{pkg.flight.totalPrice} flights<br />
            🏨 €{pkg.hotel.totalPrice} hotel
          </div>
          {pkg.savingVsAverage && pkg.savingVsAverage > 0 && (
            <div className="saving-badge">€{pkg.savingVsAverage} below avg</div>
          )}
        </div>
      </div>

      <div className="card-footer">
        <a href={pkg.flight.bookingUrl} target="_blank" rel="noopener noreferrer" className="btn-flight">
          View Flights →
        </a>
        <a href={pkg.hotel.affiliateUrl} target="_blank" rel="noopener noreferrer" className="btn-hotel">
          Book Hotel →
        </a>
      </div>
    </div>
  );
}

export default function Home() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RankedResult | null>(null);
  const [error, setError] = useState('');

  async function handleSearch(q?: string) {
    const searchQuery = q || query;
    if (!searchQuery.trim()) return;

    setLoading(true);
    setError('');
    setResult(null);
    if (q) setQuery(q);

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Something went wrong');
      } else {
        setResult(data);
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Head>
        <title>Weekend Escapes — Find your perfect city break</title>
        <meta name="description" content="Describe your ideal weekend trip. Get the best flight + hotel combinations in seconds." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="hero">
        <h1>Find your next<br /><em>weekend escape</em></h1>
        <p>Describe where you want to go. Get the best flight + hotel deal in seconds.</p>

        <div className="search-bar">
          <input
            type="text"
            placeholder="e.g. Cheap weekend in Amsterdam from Oslo, March or April"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            autoFocus
          />
          <button onClick={() => handleSearch()} disabled={loading || !query.trim()}>
            {loading ? 'Searching…' : 'Find deals'}
          </button>
        </div>

        <div className="examples">
          {EXAMPLE_QUERIES.map((ex) => (
            <button
              key={ex}
              className="example-chip"
              onClick={() => handleSearch(ex)}
            >
              {ex}
            </button>
          ))}
        </div>
      </div>

      <div className="results-section">
        {loading && (
          <div className="loading">
            <div className="loading-spinner" />
            <p>Searching flights and hotels across weekends…</p>
          </div>
        )}

        {error && <div className="error-box">{error}</div>}

        {result && !loading && (
          <>
            {result.recommendation && (
              <div className="recommendation-box">
                <div className="label">Claude's recommendation</div>
                <p>{result.recommendation}</p>
                {result.tradeoffs && <p className="tradeoffs">{result.tradeoffs}</p>}
              </div>
            )}

            {result.packages.length > 0 ? (
              <div className="packages-grid">
                {result.packages.map((pkg, i) => (
                  <PackageCard key={pkg.id} pkg={pkg} isTop={i === 0} />
                ))}
              </div>
            ) : (
              <div className="error-box" style={{ background: '#FFF7ED', borderColor: '#FED7AA', color: '#92400E' }}>
                No packages found. Try broadening your date range or adjusting your preferences.
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
