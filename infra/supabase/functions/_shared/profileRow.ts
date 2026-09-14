// The `profiles` row that account completion writes, assembled from SERVER-TRUSTED values only.
// Extracted from complete-account/index.ts so the three things that are easy to get wrong here —
// GoTrue's empty-string identifiers, display-name normalisation, and the consent timestamp — are
// unit-testable. Pure TS with no Deno/npm imports so `pnpm test:functions` can run it under plain
// `node --test`; there is no local Deno on this Mac.
export interface ProfileRowInput {
  /** auth.users.id of the caller. */
  id: string;
  /** auth.users.email as GoTrue reports it: a real address, '', null or undefined. */
  authEmail: string | null | undefined;
  /** auth.users.phone, same three shapes. GoTrue stores it WITHOUT the leading '+'. */
  authPhone: string | null | undefined;
  /** The display name from the request body; already checked non-blank by the caller. */
  fullName: string;
  /** When consent was recorded. The caller passes the server clock — see complete-account. */
  acceptedAt: Date;
}

export interface ProfileRow {
  id: string;
  email: string | null;
  phone: string | null;
  full_name: string;
  terms_accepted_at: string;
}

export function buildProfileRow(input: ProfileRowInput): ProfileRow {
  return {
    id: input.id,
    // `|| null`, NOT `??`: GoTrue reports a missing identifier as "", and an empty string would
    // collide on the UNIQUE constraint the moment a second user skips the same secondary.
    // profiles.email and profiles.phone are both nullable (migrations 0084 and 0088).
    email: input.authEmail || null,
    phone: input.authPhone || null,
    full_name: input.fullName.trim().replace(/\s+/g, ' '),
    // The consent record. This function serves the screen where the user ticks a gated checkbox,
    // so the act is real here and nowhere else in the sign-up flow — see complete-account/index.ts
    // for why the timestamp is the server's rather than the client's.
    terms_accepted_at: input.acceptedAt.toISOString(),
  };
}
