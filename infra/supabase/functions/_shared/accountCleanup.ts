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

export type CleanupClients = { storage: AvatarStorage; stream: StreamUsers | null };

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
  if (!clients.stream) {
    log(`delete-account: Stream step for ${uid} skipped, STREAM_API_KEY or STREAM_API_SECRET is not set`);
    return;
  }
  try {
    await anonymizeStreamUser(clients.stream, uid);
  } catch (e) {
    log(`delete-account: Stream anonymize for ${uid} failed after the deletion: ${(e as Error).message}`);
  }
}
