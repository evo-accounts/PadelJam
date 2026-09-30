'use client';
import { forwardRef } from 'react';
import { ArrowLeft, Search } from 'lucide-react';
import { useT } from '@padel/i18n';
import { Button } from '@/components/ui/button';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';

/**
 * Explore's search input (UX-EXPL-01): full width under the title, the app's one global search.
 * Inactive on arrival; focusing it activates search mode, and "Cancel" appears on its right to
 * return to the feed. Enter runs the typed query (UX-EXPL-05). Once results are showing, a back
 * arrow on its left returns to the suggestions (UX-EXPL-06).
 */
export const ExploreSearchEntry = forwardRef<
  HTMLInputElement,
  {
    active: boolean;
    value: string;
    onChange: (value: string) => void;
    onActivate: () => void;
    onCancel: () => void;
    onSubmit: () => void;
    /** Shown only while results are on screen. */
    onBack?: () => void;
  }
>(function ExploreSearchEntry({ active, value, onChange, onActivate, onCancel, onSubmit, onBack }, ref) {
  const { t } = useT('explore');
  return (
    <div className="flex items-center gap-2" role="search">
      {onBack ? (
        <Button
          variant="tertiary"
          size="icon"
          className="-ml-2 shrink-0"
          aria-label={t('backToSuggestions')}
          onClick={onBack}
          data-testid="explore-search-back"
        >
          <ArrowLeft />
        </Button>
      ) : null}
      <form
        className="min-w-0 flex-1"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <InputGroup className="h-11 rounded-[12px] bg-card">
          <InputGroupAddon>
            <Search aria-hidden />
          </InputGroupAddon>
          <InputGroupInput
            ref={ref}
            type="search"
            value={value}
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchLabel')}
            enterKeyHint="search"
            autoComplete="off"
            onFocus={onActivate}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onCancel();
            }}
            data-testid="explore-search-input"
          />
        </InputGroup>
      </form>
      {active ? (
        <Button variant="tertiary" size="sm" className="h-11 shrink-0 px-2" onClick={onCancel} data-testid="explore-search-cancel">
          {t('cancel')}
        </Button>
      ) : null}
    </div>
  );
});
