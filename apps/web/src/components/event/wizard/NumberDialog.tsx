'use client';
import { useState } from 'react';
import { parseWholeInRange } from '@padel/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * A Custom value (UX-CEVT-08's duration, the same pattern as Scoring's custom points): a centred
 * numeric input and Save, validated on Save — never a disabled button (UX-GLOB-06). The form is
 * mounted fresh each time the dialog opens, so it starts from the current custom value.
 */
export function NumberDialog({
  open,
  title,
  hint,
  error,
  saveLabel,
  min,
  max,
  initial,
  onClose,
  onSave,
  testId,
}: {
  open: boolean;
  title: string;
  hint: string;
  error: string;
  saveLabel: string;
  min: number;
  max: number;
  initial: number | null;
  onClose: () => void;
  onSave: (n: number) => void;
  testId: string;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="sm:max-w-sm" data-testid={`${testId}-dialog`}>
        {open ? (
          <NumberForm
            title={title}
            hint={hint}
            error={error}
            saveLabel={saveLabel}
            min={min}
            max={max}
            initial={initial}
            onSave={onSave}
            testId={testId}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function NumberForm({
  title,
  hint,
  error,
  saveLabel,
  min,
  max,
  initial,
  onSave,
  testId,
}: {
  title: string;
  hint: string;
  error: string;
  saveLabel: string;
  min: number;
  max: number;
  initial: number | null;
  onSave: (n: number) => void;
  testId: string;
}) {
  const [text, setText] = useState(initial != null ? String(initial) : '');
  const [invalid, setInvalid] = useState(false);
  const digits = String(max).length;
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const n = parseWholeInRange(text, min, max);
    if (n == null) {
      setInvalid(true);
      return;
    }
    onSave(n);
  };
  return (
    <form onSubmit={save} className="flex flex-col gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription className={cn(invalid && 'text-destructive')}>{invalid ? error : hint}</DialogDescription>
      </DialogHeader>
      <Input
        autoFocus
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={digits}
        value={text}
        onChange={(e) => {
          setText(e.target.value.replace(/[^0-9]/g, '').slice(0, digits));
          setInvalid(false);
        }}
        aria-label={title}
        aria-invalid={invalid}
        className="mx-auto h-14 w-28 text-center text-2xl font-semibold"
        data-testid={`${testId}-input`}
      />
      <Button type="submit" className="w-full" data-testid={`${testId}-save`}>
        {saveLabel}
      </Button>
    </form>
  );
}
