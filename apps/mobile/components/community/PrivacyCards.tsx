import { useT } from '@padel/i18n';
import { PRIVACY } from '@padel/api';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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
    borderColor: '#ccc',
    borderRadius: 12,
    padding: 14,
    backgroundColor: '#fff',
  },
  cardSelected: { borderColor: '#0B1F3A', backgroundColor: '#F2F5FA' },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#ccc',
    marginRight: 12,
  },
  radioSelected: { borderColor: '#0B1F3A', borderWidth: 6 },
  cardText: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '600', color: '#0B1F3A' },
  cardDesc: { fontSize: 13, color: '#666', marginTop: 2 },
});
