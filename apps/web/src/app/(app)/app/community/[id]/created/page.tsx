'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { QRCodeSVG } from 'qrcode.react';
import { useT } from '@padel/i18n';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function CommunityCreatedPage() {
  const { t } = useT('community');
  const { id } = useParams<{ id: string }>();
  const warn = useSearchParams().get('warn');

  const [url, setUrl] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setUrl(`${window.location.origin}/app/community/${id}`);
  }, [id]);

  const onShare = async () => {
    if (!url) return;
    if (navigator.share) {
      await navigator.share({ url });
    } else {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    }
  };

  const onCopy = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
  };

  return (
    <div className="p-6 max-w-md space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold">{t('createdTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('createdBody')}</p>
        {warn ? <p className="text-sm text-destructive">{t('imageWarning')}</p> : null}
      </div>

      <Card>
        <CardContent className="flex flex-col items-center gap-4">
          {url ? <QRCodeSVG value={url} size={200} /> : null}
          <div className="flex w-full gap-2">
            <Button type="button" variant="secondary" className="flex-1" onClick={onShare}>
              {t('share')}
            </Button>
            <Button type="button" variant="secondary" className="flex-1" onClick={onCopy}>
              {copied ? t('linkCopied') : t('copyLink')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-2">
        <Button asChild>
          <Link href={`/app/community/${id}`}>{t('viewCommunity')}</Link>
        </Button>
        <Button variant="secondary" disabled>
          {t('manage')}
        </Button>
        <Button variant="secondary" disabled>
          {t('createEvent')}
        </Button>
      </div>
    </div>
  );
}
