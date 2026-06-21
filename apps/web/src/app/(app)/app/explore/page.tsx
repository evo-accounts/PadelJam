'use client';
import { useT } from '@padel/i18n';
export default function ExplorePage() {
  const { t } = useT('app');
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">{t('nav.explore')}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{t('comingSoon')}</p>
    </div>
  );
}
