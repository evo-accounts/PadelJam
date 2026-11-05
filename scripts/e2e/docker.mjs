// Injected so it can be tested without Docker. `start` must not throw.
export async function ensureDocker({ isUp, start, sleep, attempts = 24, waitMs = 5000 }) {
  if (isUp()) return true;
  start();
  for (let i = 0; i < attempts; i++) {
    await sleep(waitMs);
    if (isUp()) return true;
  }
  return false;
}
