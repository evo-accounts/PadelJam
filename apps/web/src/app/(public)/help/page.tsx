import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Help — PadelJam' };

export default function HelpPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-4 px-6 py-16">
      <h1 className="text-2xl font-semibold">Help &amp; Support</h1>
      <h2 className="mt-6 text-lg font-medium">Getting started</h2>
      <p>
        Sign in with your phone or email, join a community, and jump into events from
        the Explore tab. Organizers can create groups and schedule recurring events.
      </p>
      <h2 className="mt-6 text-lg font-medium">Common questions</h2>
      <p>
        <strong>Can’t join an event?</strong> Joining closes 6 hours before start;
        leaving closes 12 hours before.
      </p>
      <p>
        <strong>Not receiving notifications?</strong> Check Settings → Notifications in
        the app and your device notification permissions.
      </p>
      <h2 className="mt-6 text-lg font-medium">Contact us</h2>
      <p>
        In-app: Profile → Settings → Contact support. Or email{' '}
        <a href="mailto:support@padeljam.app">support@padeljam.app</a>.
      </p>
    </main>
  );
}
