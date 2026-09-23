'use client';
/**
 * App preferences (UX-SET-08), the web half.
 *
 * Language and Appearance were inline controls sitting in the Settings hub's Preferences card,
 * mixed in with a link row to Notifications. Neither is an account setting — they change how this
 * browser presents the app, not the account behind it — so they move here as titled blocks with a
 * description each, matching the mobile screen.
 *
 * No app icon row: that is an iOS alternate-icon feature with no web equivalent.
 *
 * Both apply immediately. There is no Save, for the same reason mobile has none — a confirmation
 * step for something the user can already see has happened.
 */
import { useTranslation } from 'react-i18next';
import { useT } from '@padel/i18n';
import { useUpdateProfile } from '@padel/api';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function AppPreferencesPage() {
  const { t } = useT('settings');
  const { i18n } = useTranslation();
  const update = useUpdateProfile();

  const onLanguageChange = async (value: string) => {
    // Persisted to `profiles.locale` so the choice follows the account to another device, and so
    // server-sent notifications are written in the language the user actually picked.
    await update.mutateAsync({ locale: value });
    await i18n.changeLanguage(value);
  };

  return (
    <div className="p-6 max-w-md space-y-6">
      <h1 className="text-2xl font-semibold">{t('appPreferences')}</h1>

      <section className="space-y-2">
        <h2 className="font-medium">{t('language')}</h2>
        <p className="text-sm text-muted-foreground">{t('languageDescription')}</p>
        <Card>
          <CardContent className="py-4">
            <Select value={i18n.language} onValueChange={onLanguageChange}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="pt-PT">Português (PT)</SelectItem>
                <SelectItem value="pt-BR">Português (BR)</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">{t('appearance')}</h2>
        <p className="text-sm text-muted-foreground">{t('appearanceDescription')}</p>
        <Card>
          <CardContent className="py-4">
            <ThemeToggle />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
