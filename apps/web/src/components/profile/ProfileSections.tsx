'use client';
/**
 * The three sections UX-PROF-01 adds to a profile, mirrored on web.
 *
 * Same rules as mobile, and for the same reason — they are enforced in the database, not here.
 * `usePlayerGroups` shows only shared communities when the profile is not your own, and
 * `usePlayerResults` defers to `event_is_visible`. Web renders them; it does not re-decide them.
 */
import Link from 'next/link';
import { usePlayerGroups, usePlayerResults } from '@padel/api';
import { useT } from '@padel/i18n';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function Empty({ title, body }: { title: string; body?: string }) {
  return (
    <div className="py-8 text-center text-sm text-muted-foreground">
      <p>{title}</p>
      {body ? <p className="mt-1">{body}</p> : null}
    </div>
  );
}

/** All three cards render even when unset — the audit is explicit that an unset preference shows
 *  its empty state rather than disappearing. */
export function ProfilePreferences({
  dominantHand,
  courtSide,
  preferredTime,
}: {
  dominantHand: string | null;
  courtSide: string | null;
  preferredTime: string | null;
}) {
  const { t } = useT('profile');
  const known = ['left', 'right', 'any', 'morning', 'afternoon', 'night'];
  const show = (v: string | null) => (v && known.includes(v) ? t(v) : null);

  const cards = [
    { key: 'hand', label: t('dominantHand'), value: show(dominantHand) },
    { key: 'side', label: t('courtSide'), value: show(courtSide) },
    { key: 'time', label: t('preferredTime'), value: show(preferredTime) },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {cards.map((c) => (
        <Card key={c.key}>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{c.label}</p>
            <p className={c.value ? 'font-medium' : 'font-medium text-muted-foreground'}>
              {c.value ?? t('preferenceUnset')}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function ProfileGroups({ userId }: { userId: string }) {
  const { t } = useT('profile');
  const q = usePlayerGroups(userId);
  const groups = q.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('groupsTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        {q.isLoading ? null : groups.length === 0 ? (
          <Empty title={t('groupsEmpty')} />
        ) : (
          <ul className="divide-y">
            {groups.map((g) => (
              <li key={g.group_id}>
                <Link href={`/app/group/${g.group_id}`} className="flex justify-between gap-4 py-3 text-sm hover:underline">
                  <span>{g.name}</span>
                  <span className="text-muted-foreground">{g.community_name}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

export function ProfileResults({ userId }: { userId: string }) {
  const { t } = useT('profile');
  const q = usePlayerResults(userId);
  const rows = q.data ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('resultsTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        {q.isLoading ? null : rows.length === 0 ? (
          <Empty title={t('resultsEmpty')} body={t('resultsEmptyBody')} />
        ) : (
          <ul className="divide-y">
            {rows.map((r) => {
              const won =
                r.player_side === 'a' ? r.side_a_score > r.side_b_score : r.side_b_score > r.side_a_score;
              const score = (side: 'a' | 'b') => (
                <span className={won && r.player_side === side ? 'font-semibold text-green-600' : 'font-semibold'}>
                  {side === 'a' ? r.side_a_score : r.side_b_score}
                </span>
              );
              return (
                <li key={r.match_id} className="space-y-1 py-3 text-sm">
                  <div className="flex justify-between gap-4 text-muted-foreground">
                    <span>{r.event_name}</span>
                    <span>{r.court_label}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>{r.side_a_names.join(' · ')}</span>
                    {score('a')}
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>{r.side_b_names.join(' · ')}</span>
                    {score('b')}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
