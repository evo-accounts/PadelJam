import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Privacy Policy — PadelJam' };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-4 px-6 py-16">
      <h1 className="text-2xl font-semibold">Privacy Policy</h1>
      <p>Last updated: 4 July 2026</p>
      <h2 className="mt-6 text-lg font-medium">What we collect</h2>
      <p>
        Account identifiers (name, email, phone), profile details you provide (playing
        preferences, avatar, location text), content you create (events, groups, posts,
        chat messages), and device push tokens when you enable notifications.
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
