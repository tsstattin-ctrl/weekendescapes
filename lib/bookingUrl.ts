// Booking.com affiliate deep link builder
// dest_id values are Booking.com internal city IDs — required for reliable redirects

const BOOKING_DEST_IDS: Record<string, { dest_id: string; dest_type: string; ss: string }> = {
  AMS: { dest_id: '-2140479', dest_type: 'city', ss: 'Amsterdam' },
  LON: { dest_id: '-2601889', dest_type: 'city', ss: 'London' },
  LHR: { dest_id: '-2601889', dest_type: 'city', ss: 'London' },
  PAR: { dest_id: '-1456928', dest_type: 'city', ss: 'Paris' },
  CDG: { dest_id: '-1456928', dest_type: 'city', ss: 'Paris' },
  BCN: { dest_id: '-372490',  dest_type: 'city', ss: 'Barcelona' },
  CPH: { dest_id: '-2745636', dest_type: 'city', ss: 'Copenhagen' },
  BER: { dest_id: '-1746443', dest_type: 'city', ss: 'Berlin' },
  ROM: { dest_id: '-126693',  dest_type: 'city', ss: 'Rome' },
  FCO: { dest_id: '-126693',  dest_type: 'city', ss: 'Rome' },
  PRG: { dest_id: '-553173',  dest_type: 'city', ss: 'Prague' },
  VIE: { dest_id: '-1995499', dest_type: 'city', ss: 'Vienna' },
  LIS: { dest_id: '-2167973', dest_type: 'city', ss: 'Lisbon' },
  DUB: { dest_id: '-1527899', dest_type: 'city', ss: 'Dublin' },
  ATH: { dest_id: '-814876',  dest_type: 'city', ss: 'Athens' },
  MAD: { dest_id: '-390625',  dest_type: 'city', ss: 'Madrid' },
  MIL: { dest_id: '-121726',  dest_type: 'city', ss: 'Milan' },
  BUD: { dest_id: '-850553',  dest_type: 'city', ss: 'Budapest' },
};

export function buildBookingAffiliateUrl(
  iataCode: string,
  checkin: string,
  checkout: string,
  affiliateId: string
): string {
  const dest = BOOKING_DEST_IDS[iataCode];
  
  if (!dest) {
    // Fallback to generic search if we don't have the dest_id
    return `https://www.booking.com/searchresults.html?aid=${affiliateId}&checkin=${checkin}&checkout=${checkout}&label=weekendescapes&group_adults=2&no_rooms=1`;
  }

  const params = new URLSearchParams({
    aid: affiliateId,
    ss: dest.ss,
    dest_id: dest.dest_id,
    dest_type: dest.dest_type,
    checkin,
    checkout,
    group_adults: '2',
    no_rooms: '1',
    label: 'weekendescapes',
  });

  return `https://www.booking.com/searchresults.html?${params}`;
}
