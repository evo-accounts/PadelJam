/**
 * Count a mixed event's CONFIRMED roster by gender. Mirrors the server check in
 * start_event (migration 0092): members use profiles.gender, guests use guest_gender.
 */
export type MixedBalance = { men: number; women: number; unknown: number; balanced: boolean };

type RosterRow = {
  status: string;
  guest_gender: string | null;
  profiles: { gender: string | null } | null;
};

export function mixedBalance(rows: RosterRow[]): MixedBalance {
  let men = 0;
  let women = 0;
  let unknown = 0;
  for (const r of rows) {
    if (r.status !== 'confirmed') continue;
    const g = r.profiles?.gender ?? r.guest_gender;
    if (g === 'male') men++;
    else if (g === 'female') women++;
    else unknown++;
  }
  return { men, women, unknown, balanced: unknown === 0 && men === women };
}
