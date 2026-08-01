import { useT } from '@padel/i18n';
import { PRIVACY } from '@padel/api';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../../theme';

type Privacy = (typeof PRIVACY)[number];

const COPY: Record<Privacy, { title: string; desc: string }> = {
  public: { title: 'privacyPublicTitle', desc: 'privacyPublicDesc' },
  request_to_join: { title: 'privacyRequestTitle', desc: 'privacyRequestDesc' },
  private: { title: 'privacyPrivateTitle', desc: 'privacyPrivateDesc' },
};

export function PrivacyCards({
  value,
  onChange,
  disabled,
}: {
  value: Privacy;
  onChange: (value: Privacy) => void;
  disabled?: boolean;
}) {
  const { t } = useT('community');
  return (
    <View style={styles.list}>
      {PRIVACY.map((privacy) => {
        const selected = privacy === value;
        return (
          <Pressable
            key={privacy}
            style={[styles.card, selected && styles.cardSelected]}
            onPress={() => onChange(privacy)}
            disabled={disabled}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
          >
            <View style={[styles.radio, selected && styles.radioSelected]} />
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>{t(COPY[privacy].title)}</Text>
              <Text style={styles.cardDesc}>{t(COPY[privacy].desc)}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { marginBottom: 16, gap: 10 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 14,
    backgroundColor: colors.card,
  },
  cardSelected: { borderColor: colors.foreground, backgroundColor: colors.background },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    marginRight: 12,
  },
  radioSelected: { borderColor: colors.foreground, borderWidth: 6 },
  cardText: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: colors.foreground },
  cardDesc: { fontSize: 13, color: colors.mutedForeground, marginTop: 2 },
});
