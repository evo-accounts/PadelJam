'use client';

import { useState } from 'react';
import { useT } from '@padel/i18n';
import { useBlastTemplates, useCanCustomizeBlast, useSendBlast } from '@padel/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const NO_TEMPLATE = '__none__';

export function BlastComposer({ eventId }: { eventId: string }) {
  const { t } = useT('event');
  const templates = useBlastTemplates();
  const canCustom = useCanCustomizeBlast(eventId);
  const send = useSendBlast(eventId);

  const [templateId, setTemplateId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const editable = canCustom.data === true;
  const list = templates.data ?? [];

  const onTemplateChange = (value: string) => {
    const id = value === NO_TEMPLATE ? '' : value;
    setTemplateId(id);
    const tpl = list.find((x) => x.id === id) ?? null;
    if (tpl) {
      setTitle(tpl.title);
      setDescription(tpl.description);
    } else if (editable) {
      setTitle('');
      setDescription('');
    }
  };

  // When customizing is not allowed, a template must be selected. When it is
  // allowed, either a template or a typed title is enough.
  const canSend = editable ? title.trim().length > 0 || templateId !== '' : templateId !== '';

  const onSend = async () => {
    setBusy(true);
    setError(null);
    setSent(false);
    try {
      await send.mutateAsync({
        sourceTemplateId: templateId || null,
        title: title.trim(),
        description: description.trim(),
        imagePath: null,
        channels: ['email'],
      });
      setSent(true);
      setTemplateId('');
      setTitle('');
      setDescription('');
    } catch (e) {
      setError(t(e instanceof Error ? e.message : 'unknown_error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('blastCustomizeTitle')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="blast-template">{t('blastTemplateLabel')}</Label>
          <Select
            value={templateId === '' ? NO_TEMPLATE : templateId}
            onValueChange={onTemplateChange}
          >
            <SelectTrigger id="blast-template">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_TEMPLATE}>{t('blastNoTemplate')}</SelectItem>
              {list.map((tpl) => (
                <SelectItem key={tpl.id} value={tpl.id}>
                  {tpl.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="blast-title">{t('blastTitleLabel')}</Label>
          <Input
            id="blast-title"
            value={title}
            maxLength={80}
            readOnly={!editable}
            onChange={(ev) => setTitle(ev.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="blast-desc">{t('blastDescLabel')}</Label>
          <Textarea
            id="blast-desc"
            value={description}
            maxLength={1000}
            readOnly={!editable}
            rows={5}
            onChange={(ev) => setDescription(ev.target.value)}
          />
        </div>

        <p className="text-sm text-muted-foreground">{t('blastSendToAll')}</p>

        {error ? <p className="text-sm font-medium text-destructive">{error}</p> : null}
        {sent ? (
          <p className="text-sm font-medium text-success">{t('blastSentTitle')}</p>
        ) : null}

        <Button onClick={onSend} disabled={busy || !canSend} className="self-start">
          {t('blastSendCta')}
        </Button>
      </CardContent>
    </Card>
  );
}
