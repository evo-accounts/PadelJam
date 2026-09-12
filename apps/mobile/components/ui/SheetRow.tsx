/**
 * SheetRow — one action inside a BottomSheet. A ListRow with the destructive tone wired in, so
 * every sheet's rows look the same and destructive ones read as such.
 */
import type { ReactNode } from 'react';

import { ListRow } from './ListRow';

type Props = {
  label: string;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
  leading?: ReactNode;
  /** For rows in a multi-select sheet — see `ListRow`'s `selected`. */
  selected?: boolean;
  /** Badge, checkmark, chevron — see `ListRow`'s `trailing`. */
  trailing?: ReactNode;
  testID?: string;
};

export function SheetRow({ label, onPress, destructive = false, disabled = false, leading, selected, trailing, testID }: Props) {
  return (
    <ListRow
      title={label}
      titleTone={destructive ? 'destructive' : 'default'}
      leading={leading}
      trailing={trailing}
      selected={selected}
      onPress={onPress}
      disabled={disabled}
      testID={testID}
    />
  );
}
