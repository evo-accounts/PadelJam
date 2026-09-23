'use client';
/**
 * Support and feedback (UX-SET-12), the web half.
 *
 * `/app/settings/support` used to BE the ticket form. It is now a hub, and the form moved to
 * `/app/settings/support/contact`.
 *
 * Three rows, not mobile's four: "Rate the app" is a mobile store action and has no web
 * equivalent. Web also gains Help center and Share the app, which existed only on mobile until
 * now — Share uses the Web Share API where the browser has it, and falls back to copying the link,
 * because `navigator.share` is absent on most desktop browsers and a row that does nothing there
 * would be worse than one that does something quieter.
 */
import { useState } from 'react';
import Link from 'next/link';
import { useT } from '@padel/i18n';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { HELP_URL } from '@/lib/externalUrls';

const rowClass =
  'flex items-center justify-between gap-4 px-6 py-3 text-sm hover:bg-accent/50 transition-colors w-full text-left';

export default function SupportHubPage() {
  const { t } = useT('settings');
  const [shared, setShared] = useState(false);

  const onShare = async () => {
    const url = 'https://padeljam.app';
    const text = t('shareMessage');
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${url}`);
      setShared(true);
    } catch {
      // A dismissed share sheet and a denied clipboard both land here. Neither is an error worth
      // shouting about — the user simply did not share.
    }
  };

  const label = (title: string, description: string) => (
    <span className="min-w-0">
      <span className="block">{title}</span>
      <span className="block text-muted-foreground">{description}</span>
    </span>
  );

  return (
    <div className="p-6 max-w-md space-y-6">
      <h1 className="text-2xl font-semibold">{t('support')}</h1>

      <Card className="gap-0 py-0">
        <CardContent className="px-0 py-2">
          <a href={HELP_URL} target="_blank" rel="noreferrer" className={rowClass}>
            {label(t('helpCenter'), t('helpCenterDescription'))}
            <span aria-hidden className="text-muted-foreground">
              ↗
            </span>
          </a>
          <Separator />
          <Link href="/app/settings/support/contact" className={rowClass}>
            {label(t('contactSupport'), t('contactSupportDescription'))}
            <span aria-hidden className="text-muted-foreground">
              ›
            </span>
          </Link>
          <Separator />
          <button type="button" onClick={onShare} className={rowClass}>
            {label(t('shareApp'), t('shareAppDescription'))}
            <span aria-hidden className="text-muted-foreground">
              {shared ? '✓' : '↗'}
            </span>
          </button>
        </CardContent>
      </Card>

      {shared ? <p className="text-sm text-success-strong">{t('shareCopied')}</p> : null}
    </div>
  );
}
