# Make the delete screen true, and remove the avatar file and the Stream identity (PAD-276)

Approved by the CTO, 2026-11-06.

## The problem

The delete screen, on both apps and in all three locales, tells people that messages, match history and
payment information are removed. None of that is true: chat is untouched at Stream, finished results stay,
and no payment information exists. Testers will see this, so it ships before they are invited.

The behaviour has two gaps a user would call "removed":

- `delete-account` clears `avatar_url` but leaves every file under `avatars/{uid}/` in a public bucket.
  Uploads use a new name each time, so earlier photos are there too.
- It makes no call to Stream, so the person's real name and photo URL still show on their old messages.

## Why one PR

The new copy says the photo goes and old messages show "Deleted user". It's true only with the function
change, and each PR costs an `e2e` run on the one runner. So: one PR, Engineer A first (function, web, tests),
then Engineer B on the same branch (mobile).

**Due: merged by 11-18, so it's in the iOS build of 11-20 (row #2) and the Android build of 12-03 (row #18).**

## Not in this work

- Deleting messages at Stream. Messages stay. The lawyer rules on that (privacy policy question 14), and
  it's a small change if they say otherwise.
- Other buckets and `community-post-images`: posts stay, so their images stay.
- `/privacy` saying "anonymizes": it's replaced by the interim policy (row #11a), which is gate 5.
- Accounts already deleted: the CTO handles them after this ships.

## Function

In `infra/supabase/functions/delete-account/index.ts`, **after** `soft_delete_account` succeeds. A refused
deletion (`last_admin_must_promote_first`) must touch nothing. Put the logic in a `_shared` helper that takes
its storage and Stream clients as arguments, so `pnpm test:functions` can test it without a network.

1. **Avatar:** with the service-role client, page through `storage.from('avatars').list(uid)` and `remove` every
   file. A social-login `avatar_url` is an outside URL, with no file to remove.
2. **Stream:** `StreamChat.getInstance(key, secret).partialUpdateUser({ id, set: { name: 'Deleted user' }, unset: ['image'] })`,
   only through the existing `STREAM_API_KEY` and `STREAM_API_SECRET`. A user who never connected doesn't exist at
   Stream: treat that as done. Missing keys: log and carry on.
3. **Failures in 1 or 2 are logged, not returned,** the same way as the GoTrue ban below them: the account
   is already deleted, and a 400 would strand the user on the delete screen. The log line has the user id
   and which step failed, and nothing else personal.

No migration. No client calls Stream or storage for this.

## Copy

Same keys pattern on both apps, in pt-PT, pt-BR and en. Remove `deleteErasedPayment`, `deleteErasedOther`,
`deleteErasedMemberships` / `deleteErasedHistory` and `deleteErasedSocial` / `deleteErasedMessages`. Mobile:
`apps/mobile/lib/i18n-mobile.ts`, `apps/mobile/app/profile/delete-account.tsx`. Web: `apps/web/src/lib/i18n-web.ts`,
`apps/web/src/app/(app)/app/settings/delete/page.tsx`. Add a second card, "What stays", styled like the first.

These strings come from what the code does. Don't take wording from Legal's drafts. pt-PT uses `tu`, as the
rest of the app does.

| Key | en | pt-PT | pt-BR |
|---|---|---|---|
| `deleteWarningBody` | This permanently removes your profile details and closes your account. Some things stay, listed below. This cannot be undone. | Isto remove permanentemente os dados do teu perfil e encerra a tua conta. Algumas coisas ficam, como indicado abaixo. Não é possível anular. | Isso remove permanentemente os dados do seu perfil e encerra sua conta. Algumas coisas permanecem, conforme abaixo. Não é possível desfazer. |
| `deleteListTitle` | What is removed | O que é removido | O que é removido |
| `deleteErasedProfile` | Your name, photo, contact details and everything else on your profile | O teu nome, fotografia, contactos e tudo o resto do teu perfil | Seu nome, foto, contatos e todo o resto do seu perfil |
| `deleteErasedConnections` | Who you follow and who follows you, your communities and groups, settings and notifications | Quem segues e quem te segue, as tuas comunidades e grupos, definições e notificações | Quem você segue e quem segue você, suas comunidades e grupos, configurações e notificações |
| `deleteErasedUpcoming` | Your places in upcoming events | Os teus lugares em eventos futuros | Suas vagas em eventos futuros |
| `deleteErasedReports` | Reports you made and blocks you placed | As denúncias que fizeste e os bloqueios que colocaste | As denúncias que você fez e os bloqueios que colocou |
| `deleteKeptTitle` | What stays | O que fica | O que permanece |
| `deleteKeptContent` | Your posts, comments, reviews and chat messages, shown as "Deleted user" | As tuas publicações, comentários, avaliações e mensagens de chat, como "Deleted user" | Suas publicações, comentários, avaliações e mensagens de chat, como "Deleted user" |
| `deleteKeptResults` | Results and activity from events already played or in progress | Resultados e atividade de eventos já jogados ou a decorrer | Resultados e atividade de eventos já jogados ou em andamento |
| `deleteKeptCreated` | Communities and events you created | Comunidades e eventos que criaste | Comunidades e eventos que você criou |
| `deleteKeptSupport` | Your support requests, and reports other people made about you | Os teus pedidos de apoio e as denúncias que outras pessoas fizeram sobre ti | Seus pedidos de suporte e as denúncias que outras pessoas fizeram sobre você |

## Tests

- `_shared` helper (`pnpm test:functions`): removes every file across more than one page; never runs when the
  RPC refuses; a storage failure still runs the Stream step and the function returns ok; a Stream failure
  still returns ok; an unknown Stream user counts as done.
- `infra/supabase/tests/account-deletion-lockdown.test.mjs` (or next to it): on a local stack, upload a file to
  `avatars/{uid}/`, delete through the function, and check the file is gone. Add a sole-admin refusal that keeps
  the file. Stream keys are absent locally, so the function must still answer ok.
- No suite asserts the old strings (`grep` of `apps/mobile/e2e` and `e2e-web`), so QA reads the screen in the
  three locales on web and on the simulator, including the new "What stays" card.

## Hosted

Merging doesn't deploy the function. **An edge function deploy is a founder step.** The shipped app works
before the deploy, so the CTO merges, then sends the founder the deploy steps the same day. Until it's deployed,
web says something the server doesn't yet do, so don't let that wait.
