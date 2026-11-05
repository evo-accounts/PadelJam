import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Privacy Policy — PadelJam' };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-4 px-6 py-16">
      <h1 className="text-2xl font-semibold">Privacy Policy</h1>
      <p>Last updated: 6 November 2026</p>
      <h2 className="mt-6 text-lg font-medium">What we collect</h2>
      <p>
        Account identifiers (name, email, phone), profile details you provide (playing
        preferences, avatar, location text), content you create (events, groups, posts,
        chat messages), and device push tokens when you enable notifications.
      </p>
      <p>
        This includes the playing level you choose for yourself (getting started, casual,
        intermediate or advanced), which we don&apos;t verify. It is stored with your
        profile, and other signed-in PadelJam members can read it, except anyone you have
        blocked or who has blocked you. We ask for it to help match you with players and
        games, though no PadelJam feature uses it yet. You can change it in Game
        preferences, and deleting your account erases it.
      </p>
      <h2 className="mt-6 text-lg font-medium">How we use it</h2>
      <p>
        To run PadelJam: organizing events, matchmaking, community features, chat, and
        notifications. We do not sell personal data.
      </p>
      <h2 className="mt-6 text-lg font-medium">Where it lives</h2>
      <p>
        Data is stored with Supabase (database, auth, storage) and Stream (chat).
        Transactional email is delivered via Resend.
      </p>
      <h2 className="mt-6 text-lg font-medium">Your rights</h2>
      <p>
        You can edit your profile in the app and delete your account from Settings →
        Delete account, which anonymizes your personal data. For any request, contact{' '}
        <a href="mailto:support@padeljam.app">support@padeljam.app</a>.
      </p>
    </main>
  );
}
