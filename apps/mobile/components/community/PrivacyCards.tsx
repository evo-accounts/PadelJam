/**
 * The community privacy choice. Only the values and their copy live here now —
 * the cards themselves are `RadioCardGroup` in `components/ui`.
 */
import { PRIVACY } from '@padel/api';
import { useT } from '@padel/i18n';
import { StyleSheet } from 'react-native';

import { RadioCardGroup, type RadioCardOption } from '../ui';
import { space } from '../../theme';

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
  const options: RadioCardOption<Privacy>[] = PRIVACY.map((privacy) => ({
    value: privacy,
    title: t(COPY[privacy].title),
    description: t(COPY[privacy].desc),
  }));

  return (
    <RadioCardGroup
      options={options}
      value={value}
      onChange={onChange}
      disabled={disabled}
      style={styles.spacing}
      testID="community-privacy"
    />
  );
}

const styles = StyleSheet.create({
  spacing: { marginBottom: space[4] },
});
