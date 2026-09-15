/**
 * The community type choice. Only the values and their copy live here now — the
 * bar itself is `Segmented` in `components/ui`.
 */
import { COMMUNITY_TYPES } from '@padel/api';
import { useT } from '@padel/i18n';
import { StyleSheet } from 'react-native';

import { Segmented, type SegmentedOption } from '../ui';
import { space } from '../../theme';

type CommunityType = (typeof COMMUNITY_TYPES)[number];

const LABEL_KEY: Record<CommunityType, string> = {
  club: 'typeClub',
  team: 'typeTeam',
  friends: 'typeFriends',
};

export function SegmentedType({
  value,
  onChange,
  disabled,
}: {
  value: CommunityType;
  onChange: (value: CommunityType) => void;
  disabled?: boolean;
}) {
  const { t } = useT('community');
  const options: SegmentedOption<CommunityType>[] = COMMUNITY_TYPES.map((type) => ({
    value: type,
    label: t(LABEL_KEY[type]),
  }));

  return (
    <Segmented
      options={options}
      value={value}
      onChange={onChange}
      disabled={disabled}
      style={styles.spacing}
      testID="community-type"
    />
  );
}

const styles = StyleSheet.create({
  spacing: { marginBottom: space[4] },
});
