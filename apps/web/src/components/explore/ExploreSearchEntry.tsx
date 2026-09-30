'use client';
import { forwardRef } from 'react';
import { Search } from 'lucide-react';
import { useT } from '@padel/i18n';
import { Button } from '@/components/ui/button';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';

/**
 * Explore's search input (UX-EXPL-01): full width under the title, the app's one global search.
 * Inactive on arrival; focusing it activates search mode, and "Cancel" appears on its right to
 * return to the feed. The search states themselves (For you, recents, suggestions, results) come
 * with W3 — this is only the entry.
 */
export const ExploreSearchEntry = forwardRef<
  HTMLInputElement,
  {
    active: boolean;
    value: string;
    onChange: (value: string) => void;
    onActivate: () => void;
    onCancel: () => void;
  }
>(function ExploreSearchEntry({ active, value, onChange, onActivate, onCancel }, ref) {
  const { t } = useT('explore');
  return (
    <div className="flex items-center gap-2" role="search">
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
          onFocus={onActivate}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onCancel();
          }}
          data-testid="explore-search-input"
        />
      </InputGroup>
      {active ? (
        <Button variant="tertiary" size="sm" className="h-11 px-2" onClick={onCancel} data-testid="explore-search-cancel">
          {t('cancel')}
        </Button>
      ) : null}
    </div>
  );
});
