import { FlightOption, HotelOption, WeekendPackage } from './types';

function scorePairing(flight: FlightOption, hotel: HotelOption): number {
  const totalCost = flight.totalPrice + hotel.totalPrice;
  const reviewWeight = hotel.reviewScore * 20;
  const costPenalty = totalCost * 0.1;
  return reviewWeight - costPenalty;
}

export function buildPackages(
  flights: FlightOption[],
  hotelsByWeekend: Map<string, HotelOption[]>
): WeekendPackage[] {
  const packages: WeekendPackage[] = [];

  for (const flight of flights) {
    const hotels = hotelsByWeekend.get(flight.weekendLabel) || [];
    if (hotels.length === 0) continue;

    const bestHotel = hotels.reduce((best, hotel) => {
      return scorePairing(flight, hotel) > scorePairing(flight, best) ? hotel : best;
    });

    const totalCost = flight.totalPrice + bestHotel.totalPrice;

    packages.push({
      id: `${flight.weekendLabel}-${bestHotel.name}`.replace(/\s/g, '-').toLowerCase(),
      weekendLabel: flight.weekendLabel,
      flight,
      hotel: bestHotel,
      totalCost,
    });
  }

  if (packages.length > 1) {
    const avgCost = packages.reduce((sum, p) => sum + p.totalCost, 0) / packages.length;
    for (const pkg of packages) {
      pkg.savingVsAverage = Math.round(avgCost - pkg.totalCost);
    }
  }

  return packages.sort((a, b) => a.totalCost - b.totalCost);
}
