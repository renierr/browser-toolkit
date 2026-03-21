export function toRadians(deg: number): number {
  return deg * (Math.PI / 180);
}

export function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function formatDistance(km: number): string {
  if (km < 1) {
    return `${(km * 1000).toFixed(0)} m`;
  }
  return `${km.toFixed(2)} km`;
}

export function formatCoordinate(value: number, isLat: boolean): string {
  const abs = Math.abs(value);
  const dir = isLat ? (value >= 0 ? 'N' : 'S') : value >= 0 ? 'E' : 'W';
  return `${abs.toFixed(6)}° ${dir}`;
}

export function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString();
}

export function createOsmEmbedUrl(lat: number, lon: number): string {
  const bbox = `${lon - 0.01},${lat - 0.01},${lon + 0.01},${lat + 0.01}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lon}`;
}

export interface IpLocationResult {
  lat: number;
  lon: number;
  accuracy: number;
  source: 'ip';
}

export async function getPositionViaIp(): Promise<IpLocationResult | null> {
  try {
    const response = await fetch('https://ipinfo.io/json/', {
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const data: { loc?: string } = await response.json();
    if (!data.loc) return null;
    const [lat, lon] = data.loc.split(',').map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return {
      lat,
      lon,
      accuracy: 5000,
      source: 'ip',
    };
  } catch {
    return null;
  }
}
