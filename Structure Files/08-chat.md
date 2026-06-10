# Spec 08 — Chat

**Goal:** 1:1 and group chat with reactions, threads, mentions, image sharing, reported
messages, and moderation — powered by Stream Chat, accessed only through `packages/chat`,
with a nightly export to our own Postgres as migration insurance.

**Depends on:** 04.

## Tasks

1. Build `packages/chat` as the single abstraction over Stream Chat:
   - Initialise the Stream client with a server-issued user token (token minted by an
     Edge Function, never client-side secrets).
   - Expose framework-agnostic helpers + thin hooks: connect, channel list, channel,
     send, react, thread reply, mention, upload image, report message.
   - App code imports ONLY from `packages/chat` — never `stream-chat` directly.
2. Schema (migration), tenant-scoped:
   - `chat_channels` — maps our channels to Stream channel ids, with tenant/community/
     scope metadata.
   - `chat_members` — membership mapping.
   - `reported_messages` — our record of reports for moderation review.
3. Web chat (`(app)/chat`): channel list, 1:1 and group channels, reactions, threads,
   mentions, image sharing, report-a-message. Use Stream's React SDK under the package.
4. Moderation: reported messages flow into `reported_messages`; surface a basic
   moderation queue in the dashboard (role-gated). Wire Stream's moderation features.
5. Entitlement gating: `group_chat` vs `private_chat` (1:1) are separate plan features —
   gate accordingly via `packages/features`, enforced server-side at token/channel
   creation, not just UI.
6. Nightly export: an Edge Function (scheduled) exports channels/messages from Stream to
   our Postgres. This is the lock-in insurance — verify it round-trips.

## Constraints

- No direct `stream-chat` import outside `packages/chat`.
- Stream user tokens are minted server-side only.
- Chat features (`group_chat`, `private_chat`) respect entitlements at creation time.
- The nightly export must actually run and store retrievable data.

## Definition of done

- [ ] Two members can hold a 1:1 chat with reactions, threads, mentions, and image share.
- [ ] Group chat works within a community/tenant scope.
- [ ] Reporting a message records it in `reported_messages` and shows in the dashboard
      moderation queue (role-gated).
- [ ] A tenant lacking `private_chat` cannot open 1:1 channels (server-enforced).
- [ ] Grep confirms no `stream-chat` import outside `packages/chat`.
- [ ] The nightly export writes channels/messages to Postgres and they can be read back.
