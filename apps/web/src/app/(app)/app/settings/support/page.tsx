'use client';
import { useState } from 'react';
import { useT } from '@padel/i18n';
import { useCreateSupportTicket } from '@padel/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export default function SupportPage() {
  const { t } = useT('settings');
  const create = useCreateSupportTicket();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sent, setSent] = useState(false);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate({ title, description }, { onSuccess: () => setSent(true) });
  };

  const disabled = create.isPending || !title.trim() || !description.trim();

  return (
    <div className="p-6 max-w-md space-y-6">
      <h1 className="text-2xl font-semibold">{t('supportTitle')}</h1>
      <p className="text-sm text-muted-foreground">{t('supportDescription')}</p>

      <Card>
        <CardContent>
          {sent ? (
            <p className="text-sm text-green-600">{t('supportSent')}</p>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">{t('supportTitle')}</Label>
                <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">{t('supportDescription')}</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <Button type="submit" className="w-full" disabled={disabled}>
                {t('supportSend')}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
