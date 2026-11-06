// What a deleted account leaves behind outside the database: its avatar files and its Stream identity.
// Runs only AFTER soft_delete_account succeeded. Every failure is logged (user id and step only) and
// never thrown: the account is already deleted, and an error would strand the user on the delete screen.
// The clients are arguments so node tests can run this without a network.

export type AvatarStorage = {
  list(
    path: string,
    opts: { limit: number; offset: number },
  ): Promise<{ data: { name: string }[] | null; error: { message: string } | null }>;
  remove(paths: string[]): Promise<{ error: { message: string } | null }>;
};

export type StreamUsers = {
  revokeUserToken(userID: string, before?: Date | string | null): Promise<unknown>;
  partialUpdateUser(update: { id: string; set: Record<string, unknown>; unset: string[] }): Promise<unknown>;
};

export const DELETED_USER_NAME = 'Deleted user';
const PAGE = 100;

export async function removeAvatarFiles(storage: AvatarStorage, uid: string): Promise<void> {
  // Removing a page shifts later files forward, so always list from offset 0 until it is empty.
  // A page that fails to remove would loop forever, so a remove error stops the loop.
  for (;;) {
    const { data, error } = await storage.list(uid, { limit: PAGE, offset: 0 });
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) return;
    const { error: rmErr } = await storage.remove(data.map((f) => `${uid}/${f.name}`));
    if (rmErr) throw new Error(rmErr.message);
    if (data.length < PAGE) return;
  }
}

// A user who never connected to chat does not exist at Stream: that is "already clean".
const isUnknownStreamUser = (e: unknown): boolean => {
  const err = e as { code?: number; status?: number; message?: string };
  return err?.code === 16 || err?.status === 404 || /not found|doesn'?t exist|does not exist/i.test(err?.message ?? '');
};

export async function anonymizeStreamUser(stream: StreamUsers, uid: string): Promise<void> {
  try {
    await stream.partialUpdateUser({ id: uid, set: { name: DELETED_USER_NAME }, unset: ['image'] });
  } catch (e) {
    if (isUnknownStreamUser(e)) return;
    throw e;
  }
}

// Other people's notifications keep the name copied into actor_name when they were made. Rewrite it to
// the same placeholder the profile got; null would leave both apps' `actor_name ?? ''` with no subject.
export type NotificationsDb = {
  renameActor(uid: string, name: string): Promise<{ message: string } | null>;
};

// The organiser's Activity rows where the account is the actor AND the one named: 0140's three triggers write
// target_name for joined, left, waitlist_joined, waitlist_claimed, invite_accepted and invite_declined. Other
// actions with this actor (invited, partner_invite_*, confirmed, removed, marked_paid) name someone else.
export const SELF_NAMING_ACTIONS = ['joined', 'left', 'waitlist_joined', 'waitlist_claimed', 'invite_accepted', 'invite_declined'];
export type ActivityDb = {
  renameSelfNamed(uid: string, name: string): Promise<{ message: string } | null>;
};

export type CleanupClients = {
  storage: AvatarStorage;
  stream: StreamUsers | null;
  notifications?: NotificationsDb;
  activity?: ActivityDb;
};

export async function cleanUpDeletedAccount(
  uid: string,
  clients: CleanupClients,
  log: (msg: string) => void = console.error,
): Promise<void> {
  try {
    await removeAvatarFiles(clients.storage, uid);
  } catch (e) {
    log(`delete-account: avatar removal for ${uid} failed after the deletion: ${(e as Error).message}`);
  }
  if (clients.notifications) {
    try {
      const err = await clients.notifications.renameActor(uid, DELETED_USER_NAME);
      if (err) throw new Error(err.message);
    } catch (e) {
      log(`delete-account: notification actor_name for ${uid} failed after the deletion: ${(e as Error).message}`);
    }
  }
  if (clients.activity) {
    try {
      const err = await clients.activity.renameSelfNamed(uid, DELETED_USER_NAME);
      if (err) throw new Error(err.message);
    } catch (e) {
      log(`delete-account: activity target_name for ${uid} failed after the deletion: ${(e as Error).message}`);
    }
  }
  if (!clients.stream) {
    log(`delete-account: Stream step for ${uid} skipped, STREAM_API_KEY or STREAM_API_SECRET is not set`);
    return;
  }
  // Tokens from stream-token have no expiry, and the apps send name and image on connectUser, so a second
  // signed-in device could write the real name back. Revoke first and as its own step, so a failure here
  // does not stop the anonymise below.
  try {
    await clients.stream.revokeUserToken(uid);
  } catch (e) {
    if (!isUnknownStreamUser(e)) log(`delete-account: Stream token revoke for ${uid} failed after the deletion: ${(e as Error).message}`);
  }
  try {
    await anonymizeStreamUser(clients.stream, uid);
  } catch (e) {
    log(`delete-account: Stream anonymize for ${uid} failed after the deletion: ${(e as Error).message}`);
  }
}
