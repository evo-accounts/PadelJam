'use client';
import { useRef, useState } from 'react';
import { useT } from '@padel/i18n';
import { useCreateSupportTicket } from '@padel/api';
import { SUPPORT_DESCRIPTION_MAX, SUPPORT_TITLE_MAX } from '@padel/config';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type FieldKey = 'title' | 'description';

export default function ContactSupportPage() {
  const { t } = useT('settings');
  const { t: tc } = useT('common');
  const create = useCreateSupportTicket();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sent, setSent] = useState(false);
  const [failed, setFailed] = useState(false);
  const [missing, setMissing] = useState<Partial<Record<FieldKey, true>>>({});
  const titleRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  // Send is never disabled for an empty field. It used to be, and a dimmed button states that
  // something is wrong without saying what — the pattern UX-GLOB-06 removed from every mobile form,
  // including this one's mobile twin. Now a tap on an incomplete form marks each empty field
  // (`aria-invalid` turns it red, and "Required" is tied to it with `aria-describedby`) and moves
  // focus to the first, so a screen reader announces the field and its error together.
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: Partial<Record<FieldKey, true>> = {};
    if (!title.trim()) next.title = true;
    if (!description.trim()) next.description = true;
    setMissing(next);
    if (next.title || next.description) {
      (next.title ? titleRef : descriptionRef).current?.focus();
      return;
    }

    setFailed(false);
    // Trimmed, as mobile sends it: the validation above judged the trimmed text, so that is what
    // gets stored.
    create.mutate(
      { title: title.trim(), description: description.trim() },
      { onSuccess: () => setSent(true), onError: () => setFailed(true) },
    );
  };

  /** Typing into a field clears its error — the complaint no longer applies. */
  const clear = (key: FieldKey) => {
    if (missing[key]) setMissing((m) => ({ ...m, [key]: undefined }));
  };

  return (
    <div className="p-6 max-w-md space-y-6">
      {/* The heading names the SCREEN. It used to reuse `supportTitle`, the field label, so the
          page read "Title" as its own title and again over the first input — and `supportDescription`
          did the same thing one line down. */}
      <h1 className="text-2xl font-semibold">{t('contactSupport')}</h1>
      <p className="text-sm text-muted-foreground">{t('contactSupportDescription')}</p>

      <Card>
        <CardContent>
          {sent ? (
            <p className="text-sm text-success-strong">{t('supportSent')}</p>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">{t('supportTitle')}</Label>
                <Input
                  id="title"
                  ref={titleRef}
                  value={title}
                  maxLength={SUPPORT_TITLE_MAX}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    clear('title');
                  }}
                  aria-invalid={missing.title || undefined}
                  aria-describedby={missing.title ? 'title-error' : undefined}
                />
                {missing.title ? (
                  <p id="title-error" className="text-sm text-destructive">
                    {tc('required')}
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">{t('supportDescription')}</Label>
                <Textarea
                  id="description"
                  ref={descriptionRef}
                  value={description}
                  maxLength={SUPPORT_DESCRIPTION_MAX}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    clear('description');
                  }}
                  aria-invalid={missing.description || undefined}
                  aria-describedby={missing.description ? 'description-error' : undefined}
                />
                {missing.description ? (
                  <p id="description-error" className="text-sm text-destructive">
                    {tc('required')}
                  </p>
                ) : null}
              </div>

              {/* A failed insert used to do nothing at all: the mutation had no onError, so the
                  button simply re-enabled and the message sat there looking sent. Mobile has always
                  shown a banner here. `role="alert"` so a screen reader hears it without the
                  focus moving. */}
              {failed ? (
                <p role="alert" className="text-sm text-destructive">
                  {t('supportFailed')}
                </p>
              ) : null}

              <Button type="submit" className="w-full" disabled={create.isPending}>
                {t('supportSend')}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
