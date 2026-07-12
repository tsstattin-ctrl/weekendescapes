// lib/geocoding.ts
// Converts neighbourhood names and points of interest to coordinates
// and calculates walking distances between hotels and POIs

const MAPS_BASE = 'https://maps.googleapis.com/maps/api';

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface GeocodedLocation {
  coordinates: Coordinates;
  formattedAddress: string;
  locationType: 'neighbourhood' | 'poi' | 'city' | 'unknown';
}

export interface WalkingDistance {
  durationMinutes: number;
  distanceMeters: number;
  withinLimit: boolean;
}

// Geocode a neighbourhood, district, or point of interest
export async function geocodeLocation(
  query: string,
  cityName: string
): Promise<GeocodedLocation | null> {
  const apiKey = process.env.GOOGLE_MAPS_KEY || '';
  if (!apiKey) {
    console.warn('GOOGLE_MAPS_KEY not set — skipping geocoding');
    return null;
  }

  const fullQuery = `${query}, ${cityName}`;
  const params = new URLSearchParams({
    address: fullQuery,
    key: apiKey,
  });

  try {
    const response = await fetch(`${MAPS_BASE}/geocode/json?${params}`);
    if (!response.ok) return null;

    const data = await response.json();
    if (data.status !== 'OK' || !data.results?.[0]) {
      console.warn(`Geocoding failed for "${fullQuery}":`, data.status);
      return null;
    }

    const result = data.results[0];
    const location = result.geometry.location;
    const types = result.types || [];

    // Determine location type
    let locationType: GeocodedLocation['locationType'] = 'unknown';
    if (types.includes('neighborhood') || types.includes('sublocality') || types.includes('political')) {
      locationType = 'neighbourhood';
    } else if (types.includes('establishment') || types.includes('point_of_interest') || types.includes('restaurant')) {
      locationType = 'poi';
    } else if (types.includes('locality')) {
      locationType = 'city';
    }

    return {
      coordinates: { lat: location.lat, lng: location.lng },
      formattedAddress: result.formatted_address,
      locationType,
    };
  } catch (err) {
    console.error('Geocoding error:', err);
    return null;
  }
}

// Calculate walking distance from a hotel to a point of interest
export async function getWalkingDistance(
  hotelCoords: Coordinates,
  poiCoords: Coordinates,
  maxWalkingMinutes: number = 15
): Promise<WalkingDistance | null> {
  const apiKey = process.env.GOOGLE_MAPS_KEY || '';
  if (!apiKey) return null;

  const params = new URLSearchParams({
    origins: `${hotelCoords.lat},${hotelCoords.lng}`,
    destinations: `${poiCoords.lat},${poiCoords.lng}`,
    mode: 'walking',
    key: apiKey,
  });

  try {
    const response = await fetch(`${MAPS_BASE}/distancematrix/json?${params}`);
    if (!response.ok) return null;

    const data = await response.json();
    if (data.status !== 'OK') return null;

    const element = data.rows?.[0]?.elements?.[0];
    if (!element || element.status !== 'OK') return null;

    const durationMinutes = Math.round(element.duration.value / 60);
    const distanceMeters = element.distance.value;

    return {
      durationMinutes,
      distanceMeters,
      withinLimit: durationMinutes <= maxWalkingMinutes,
    };
  } catch (err) {
    console.error('Distance Matrix error:', err);
    return null;
  }
}

// Build a LiteAPI-compatible bounding box from coordinates + radius
export function buildRadiusFilter(center: Coordinates, radiusMeters: number = 1000) {
  // Approximate degrees per meter
  const latDelta = radiusMeters / 111320;
  const lngDelta = radiusMeters / (111320 * Math.cos(center.lat * Math.PI / 180));

  return {
    latitude: center.lat,
    longitude: center.lng,
    radius: radiusMeters / 1000, // LiteAPI uses km
  };
}
