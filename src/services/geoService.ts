/** Simulated GPS (PRD 4.4): a fix near a known point with an accuracy reading. Polygon checks arrive in phase 14. */
export function fixNear(center: { lat: number; lng: number }, spreadDeg = 0.01) {
  return {
    lat: center.lat + (Math.random() - 0.5) * spreadDeg,
    lng: center.lng + (Math.random() - 0.5) * spreadDeg,
    accuracy: Math.round(3 + Math.random() * 12),
  };
}
