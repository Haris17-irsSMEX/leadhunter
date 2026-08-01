import type { GoogleGeoBounds, GoogleGeoPoint } from "@/lib/sgai";

export type CityScanZone = {
  id: string;
  center: GoogleGeoPoint;
  radiusMeters: number;
};

const EARTH_RADIUS_KM = 6371;

function distanceKm(a: GoogleGeoPoint, b: GoogleGeoPoint) {
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const deltaLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const deltaLng = ((b.longitude - a.longitude) * Math.PI) / 180;
  const value =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

export function isPointInsideBounds(point: GoogleGeoPoint, bounds: GoogleGeoBounds) {
  return (
    point.latitude >= bounds.southwest.latitude &&
    point.latitude <= bounds.northeast.latitude &&
    point.longitude >= bounds.southwest.longitude &&
    point.longitude <= bounds.northeast.longitude
  );
}

export function generateCityScanZones(bounds: GoogleGeoBounds): CityScanZone[] {
  const south = bounds.southwest.latitude;
  const west = bounds.southwest.longitude;
  const north = bounds.northeast.latitude;
  const east = bounds.northeast.longitude;

  if (![south, west, north, east].every(Number.isFinite) || north <= south || east <= west) {
    throw new Error("The resolved city boundary is not supported.");
  }

  const midpoint = { latitude: (south + north) / 2, longitude: (west + east) / 2 };
  const heightKm = distanceKm(
    { latitude: south, longitude: midpoint.longitude },
    { latitude: north, longitude: midpoint.longitude },
  );
  const widthKm = distanceKm(
    { latitude: midpoint.latitude, longitude: west },
    { latitude: midpoint.latitude, longitude: east },
  );
  const areaKm2 = Math.max(1, heightKm * widthKm);
  const [rows, columns] =
    areaKm2 <= 120 ? [2, 2] : areaKm2 <= 600 ? [3, 3] : areaKm2 <= 2_000 ? [4, 4] : [4, 6];
  const latStep = (north - south) / rows;
  const lngStep = (east - west) / columns;
  const zones: CityScanZone[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const cellSouth = south + latStep * row;
      const cellWest = west + lngStep * column;
      const center = {
        latitude: cellSouth + latStep / 2,
        longitude: cellWest + lngStep / 2,
      };
      const corner = { latitude: cellSouth, longitude: cellWest };
      const radiusMeters = Math.min(50_000, Math.max(500, Math.ceil(distanceKm(center, corner) * 1_100)));

      zones.push({ id: `r${row + 1}-c${column + 1}`, center, radiusMeters });
    }
  }

  return zones.slice(0, 24);
}

