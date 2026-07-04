import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Terms of Service — PadelJam' };

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-4 px-6 py-16">
      <h1 className="text-2xl font-semibold">Terms of Service</h1>
      <p>Last updated: 4 July 2026</p>
      <h2 className="mt-6 text-lg font-medium">The service</h2>
      <p>
        PadelJam helps players organize padel communities, groups, and events. You must
        be at least 16 years old and provide accurate account information.
      </p>
      <h2 className="mt-6 text-lg font-medium">Your content &amp; conduct</h2>
      <p>
        You are responsible for content you post. Harassment, impersonation, and abuse
        are not tolerated; accounts may be suspended for violations.
      </p>
      <h2 className="mt-6 text-lg font-medium">Payments between players</h2>
      <p>
        Entrance fees shown in events are arranged between organizers and players.
        PadelJam does not process these payments and is not a party to them.
      </p>
      <h2 className="mt-6 text-lg font-medium">Liability</h2>
      <p>
        The service is provided “as is”. To the maximum extent permitted by law,
        PadelJam is not liable for indirect or consequential damages, including
        injuries at events organized through the app.
      </p>
      <h2 className="mt-6 text-lg font-medium">Contact</h2>
      <p>
        Questions? <a href="mailto:support@padeljam.app">support@padeljam.app</a>.
      </p>
    </main>
  );
}
