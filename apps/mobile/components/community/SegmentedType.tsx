import { useT } from '@padel/i18n';
import { COMMUNITY_TYPES } from '@padel/api';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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
  return (
    <View style={styles.row}>
      {COMMUNITY_TYPES.map((type) => {
        const selected = type === value;
        return (
          <Pressable
            key={type}
            style={[styles.segment, selected && styles.segmentSelected]}
            onPress={() => onChange(type)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityState={{ selected }}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>
              {t(LABEL_KEY[type])}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
  },
  segment: { flex: 1, paddingVertical: 12, alignItems: 'center', backgroundColor: '#fff' },
  segmentSelected: { backgroundColor: '#0B1F3A' },
  label: { fontSize: 15, color: '#0B1F3A', fontWeight: '600' },
  labelSelected: { color: '#fff' },
});
