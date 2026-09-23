'use client';
/**
 * Legal (UX-SET-13), the web half.
 *
 * Terms and the Privacy Policy were two external links tucked inside the Settings hub's Support
 * card — grouped with "Contact support", which is a different kind of thing. They get their own
 * screen, with a line under each explaining what it is before the user leaves for it.
 *
 * `target="_blank"` with `rel="noreferrer"`, which is the web equivalent of mobile's decision to
 * use `Linking` over an in-app browser: the document should visibly be the website's, addressable
 * and shareable, not something the app wrapped.
 */
import { useT } from '@padel/i18n';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { PRIVACY_URL, TERMS_URL } from '@/lib/externalUrls';

const rowClass =
  'flex items-center justify-between gap-4 px-6 py-3 text-sm hover:bg-accent/50 transition-colors';

export default function LegalPage() {
  const { t } = useT('settings');

  const row = (href: string, title: string, description: string) => (
    <a href={href} target="_blank" rel="noreferrer" className={rowClass}>
      <span className="min-w-0">
        <span className="block">{title}</span>
        <span className="block text-muted-foreground">{description}</span>
      </span>
      <span aria-hidden className="text-muted-foreground">
        ↗
      </span>
    </a>
  );

  return (
    <div className="p-6 max-w-md space-y-6">
      <h1 className="text-2xl font-semibold">{t('legal')}</h1>

      <Card className="gap-0 py-0">
        <CardContent className="px-0 py-2">
          {row(TERMS_URL, t('terms'), t('termsDescription'))}
          <Separator />
          {row(PRIVACY_URL, t('privacy'), t('privacyPolicyDescription'))}
        </CardContent>
      </Card>
    </div>
  );
}
