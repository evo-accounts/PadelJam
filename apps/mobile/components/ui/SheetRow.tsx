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
  testID?: string;
};

export function SheetRow({ label, onPress, destructive = false, disabled = false, leading, testID }: Props) {
  return (
    <ListRow
      title={label}
      titleTone={destructive ? 'destructive' : 'default'}
      leading={leading}
      onPress={disabled ? undefined : onPress}
      testID={testID}
    />
  );
}
