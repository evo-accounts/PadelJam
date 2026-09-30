import type { LocationPoint } from '@padel/api';

/**
 * Read a PostGIS point as PostgREST returns a `geography(point)` column: hex EWKB, e.g.
 * `0101000020E6100000` + 8-byte X (lng) + 8-byte Y (lat). Only that one shape is accepted — a 2D
 * point with an SRID, either byte order — and anything else reads as no point, never as a guess.
 */
export function parseEwkbPoint(value: unknown): LocationPoint | null {
  if (typeof value !== 'string' || !/^[0-9a-fA-F]{50}$/.test(value)) return null;
  const bytes = new Uint8Array(25);
  for (let i = 0; i < 25; i++) bytes[i] = parseInt(value.slice(i * 2, i * 2 + 2), 16);
  const view = new DataView(bytes.buffer);
  const little = bytes[0] === 1;
  const type = view.getUint32(1, little);
  // 0x20000001: point (1) with the SRID flag; no Z or M.
  if (type !== 0x20000001) return null;
  const lng = view.getFloat64(9, little);
  const lat = view.getFloat64(17, little);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

/** Same place to about a metre — a re-save of an unchanged pin is not a change. */
export function samePoint(a: LocationPoint | null, b: LocationPoint | null): boolean {
  if (!a || !b) return a === b;
  return Math.abs(a.lat - b.lat) < 1e-5 && Math.abs(a.lng - b.lng) < 1e-5;
}
