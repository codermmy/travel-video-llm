export function isValidGps(lat?: number, lon?: number): boolean {
  if (lat === undefined || lon === undefined) {
    return false;
  }
  return lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

export function formatGps(lat: number, lon: number): string {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lonDir = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}°${latDir}, ${Math.abs(lon).toFixed(4)}°${lonDir}`;
}
