let instanceSeq = 0;

/**
 * Returns a channel topic that is unique per subscribing hook instance.
 *
 * supabase-js keeps a channel registered on the client until the server acks
 * its leave (or a 10s timeout), and `client.channel(topic)` returns that
 * still-registered instance when the topic collides. Calling
 * `.on('postgres_changes', …)` on an already-subscribed instance throws
 * ("cannot add `postgres_changes` callbacks … after `subscribe()`"), which
 * crashed the app to the ErrorBoundary when a realtime hook remounted across
 * an in-session user switch. A per-mount suffix guarantees every effect run
 * gets a fresh channel; the topic name itself is irrelevant to
 * postgres_changes delivery.
 */
export const uniqueChannelTopic = (base: string): string => `${base}#${++instanceSeq}`;
