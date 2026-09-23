'use client';
/**
 * Badges on web, in two shapes.
 *
 * `BadgeStatCard` is the third card in the other-profile stats grid, matching the two beside it.
 * `BadgeCard` is a standalone card for the OWN-profile page, which has no stats grid at all — it
 * renders a header and a Preferences card and nothing else. Without this, your own badges would be
 * invisible on the one surface where they matter most, which is the sort of asymmetry that only
 * shows up when someone asks "where are mine?".
 *
 * Both read the same counters and evaluate them with the same registry as mobile. The thresholds
 * live in `@padel/utils`, so web and mobile cannot disagree about what is earned.
 */
import { usePlayerBadgeFacts } from '@padel/api';
import { evaluateBadges, sortBadges, type BadgeFacts } from '@padel/utils';
import { useT } from '@padel/i18n';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

function useBadgeStates(userId: string | undefined) {
  const q = usePlayerBadgeFacts(userId);
  const states = q.data ? sortBadges(evaluateBadges(q.data as BadgeFacts)) : null;
  return { q, states, earned: states?.filter((s) => s.unlocked).length ?? null };
}

/** The third card in the other-profile stats grid. */
export function BadgeStatCard({ userId }: { userId: string }) {
  const { t } = useT('profile');
  const { earned } = useBadgeStates(userId);
  return (
    <Card>
      <CardContent className="pt-6 text-center">
        {/* An em dash, not 0, while the query is in flight: zero is a real value here, so showing
            it before it is known states something false for a moment. */}
        <p className="text-2xl font-semibold">{earned ?? '—'}</p>
        <p className="text-sm text-muted-foreground">{t('badgesTitle')}</p>
      </CardContent>
    </Card>
  );
}

/** The standalone card for the own-profile page. */
export function BadgeCard({ userId }: { userId: string }) {
  const { t } = useT('profile');
  const { q, states, earned } = useBadgeStates(userId);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('badgesTitle')}</CardTitle>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : !states ? null : earned === 0 ? (
          <p className="text-sm text-muted-foreground">{t('badgesEmpty')}</p>
        ) : (
          <>
            <p className="pb-3 text-sm text-muted-foreground">
              {t('badgesEarnedOf', { earned, total: states.length })}
            </p>
            <ul className="flex flex-wrap gap-2">
              {states
                .filter((s) => s.unlocked)
                .map((s) => (
                  <li
                    key={s.id}
                    className="rounded-full bg-accent px-3 py-1 text-sm"
                    // Tier is in the accessible name because the pill only shows a word, and
                    // "Court Regular" at tier 1 and tier 4 are meaningfully different things.
                    aria-label={
                      s.tiers > 1
                        ? t('badgeEarnedTier', { name: t(`badge_${s.id}`), tier: s.tier, total: s.tiers })
                        : t('badgeEarned', { name: t(`badge_${s.id}`) })
                    }
                  >
                    {t(`badge_${s.id}`)}
                  </li>
                ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}
