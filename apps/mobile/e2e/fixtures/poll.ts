/** Poll an async producer until the predicate passes; throws with the last value on timeout. */
export async function pollUntil<T>(
  produce: () => Promise<T>,
  predicate: (v: T) => boolean,
  opts: { timeoutMs?: number; intervalMs?: number; label?: string } = {},
): Promise<T> {
  const { timeoutMs = 8_000, intervalMs = 500, label = 'condition' } = opts;
  const deadline = Date.now() + timeoutMs;
  let last: T | undefined;
  while (Date.now() < deadline) {
    last = await produce();
    if (predicate(last)) return last;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`pollUntil timed out (${timeoutMs}ms) for ${label}; last=${JSON.stringify(last)?.slice(0, 300)}`);
}
