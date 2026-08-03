/**
 * The whole design system on one scrollable surface.
 *
 * THIS IS THE ACCEPTANCE GATE. `apps/mobile/e2e/suites/00-design-system.e2e.ts`
 * opens this story and screenshots it top to bottom, so the redesign can be
 * judged from a real device render before any of the 136 screens adopt it.
 *
 * Deliberately one story rather than a story per state: a reviewer comparing
 * navy-to-purple needs everything in one frame, and the E2E harness gets a
 * single deterministic target instead of having to drive Storybook's navigation.
 * Per-component stories live alongside this for interactive exploration.
 *
 * What to look for, since these are the decisions being ratified:
 *   - purple where navy used to be (buttons, avatars, selected chips)
 *   - card borders, which get LIGHTER and may read as flat
 *   - dark label on the purple fill, not white — the light purple demands it
 */
import { StyleSheet, View } from 'react-native';

import { colors, radius, space, type as typeScale } from '../../theme';
import { Avatar } from './Avatar';
import { Badge } from './Badge';
import { Button } from './Button';
import { Card } from './Card';
import { Chip } from './Chip';
import { EmptyState } from './EmptyState';
import { IconButton } from './IconButton';
import { ListRow } from './ListRow';
import { TopBar } from './TopBar';
import { Field } from './Field';
import { Loading, Screen } from './Screen';
import { Text } from './Text';
import { useColors, useScheme } from '../../theme';

/**
 * Renders the ACTIVE scheme and the colour it resolved to.
 *
 * Screenshots prove a dark capture looks different; they cannot prove WHY, and
 * "different" would also be satisfied by a half-applied theme. This puts the
 * resolved value in the accessibility tree, so suite 00 can assert that
 * useThemedStyles produced the dark token rather than merely something else.
 */
function SchemeProbe() {
  const scheme = useScheme();
  const c = useColors();
  return <Text variant="caption" tone="muted">{`scheme=${scheme} background=${c.background}`}</Text>;
}

/** A titled block. `testID` gives the screenshot suite something to scroll to. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section} testID={`section-${title}`}>
      <Text variant="heading" tone="default" style={styles.sectionTitle}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

const SEMANTIC: { name: string; value: string }[] = [
  { name: 'primary', value: colors.primary },
  { name: 'secondary', value: colors.secondary },
  { name: 'background', value: colors.background },
  { name: 'card', value: colors.card },
  { name: 'foreground', value: colors.foreground },
  { name: 'muted', value: colors.muted },
  { name: 'mutedForeground', value: colors.mutedForeground },
  { name: 'accent', value: colors.accent },
  { name: 'border', value: colors.border },
  { name: 'destructive', value: colors.destructive },
  { name: 'success', value: colors.success },
  { name: 'warning', value: colors.warning },
  { name: 'info', value: colors.info },
];

const TYPE_ROLES = Object.keys(typeScale) as (keyof typeof typeScale)[];
const RADII = Object.entries(radius).filter(([name]) => name !== 'full');

export function Overview() {
  return (
    <Screen scroll testID="design-system-gallery">
      <Text variant="display" tone="default" style={styles.pageTitle}>
        Design system
      </Text>

      <Section title="Colour">
        <View style={styles.swatchGrid}>
          {SEMANTIC.map((s) => (
            <View key={s.name} style={styles.swatch}>
              <View style={[styles.swatchChip, { backgroundColor: s.value }]} />
              {/* Shown as the ACCESSOR, not the bare name: it is what you type
                  at a call site, and it keeps these labels from colliding with
                  the section headings below — `card` the swatch vs `Card` the
                  section sent the screenshot suite chasing the wrong element. */}
              <Text variant="hint" tone="muted">
                colors.{s.name}
              </Text>
              <Text variant="hint" tone="subtle">
                {s.value}
              </Text>
            </View>
          ))}
        </View>
      </Section>

      <Section title="Type">
        {TYPE_ROLES.map((role) => (
          <Text key={role} variant={role} tone="default" style={styles.typeRow}>
            {role} — {typeScale[role].fontSize}/{typeScale[role].lineHeight}
          </Text>
        ))}
      </Section>

      <Section title="Radius">
        <Row>
          {RADII.map(([name, value]) => (
            <View key={name} style={styles.radiusItem}>
              <View style={[styles.radiusBox, { borderRadius: value }]} />
              <Text variant="hint" tone="muted">
                {name} {value}
              </Text>
            </View>
          ))}
        </Row>
      </Section>

      <Section title="Spacing">
        {([1, 2, 3, 4, 5, 6, 8, 10] as const).map((step) => (
          <View key={step} style={styles.spaceRow}>
            <Text variant="hint" tone="muted" style={styles.spaceLabel}>
              {step}
            </Text>
            <View style={[styles.spaceBar, { width: space[step] * 4 }]} />
            <Text variant="hint" tone="subtle">
              {space[step]}
            </Text>
          </View>
        ))}
      </Section>

      <Section title="Button">
        <Row>
          <Button label="Primary" variant="primary" />
          <Button label="Secondary" variant="secondary" />
          <Button label="Outline" variant="outline" />
        </Row>
        <Row>
          <Button label="Ghost" variant="ghost" />
          <Button label="Destructive" variant="destructive" />
        </Row>
        <Row>
          <Button label="Small" size="sm" />
          <Button label="Medium" size="md" />
          <Button label="Large" size="lg" />
        </Row>
        <Row>
          <Button label="Disabled" disabled />
          {/* Not labelled "Loading" — that would collide with the Loading
              section heading further down and misdirect the screenshot suite. */}
          <Button label="Saving…" loading />
        </Row>
        <Button label="Full width" fullWidth style={styles.stacked} />
      </Section>

      <Section title="Avatar">
        <Row>
          <Avatar name="Ana Silva" size="xs" />
          <Avatar name="Ana Silva" size="sm" />
          <Avatar name="Ana Silva" size="md" />
          <Avatar name="Ana Paula Silva" size="lg" />
          <Avatar name="Ana Paula Silva" size="xl" />
        </Row>
        <Row>
          <Avatar name="No Name Given" size="lg" />
          <Avatar size="lg" />
        </Row>
      </Section>

      <Section title="Badge">
        <Row>
          <Badge label="Neutral" tone="neutral" />
          <Badge label="Primary" tone="primary" />
          <Badge label="Success" tone="success" />
          <Badge label="Warning" tone="warning" />
          <Badge label="Error" tone="destructive" />
          <Badge label="Info" tone="info" />
        </Row>
      </Section>

      <Section title="Chip">
        <Row>
          <Chip label="Unselected" />
          <Chip label="Selected" selected />
          <Chip label="Disabled" disabled />
        </Row>
      </Section>

      <Section title="TopBar">
        <Card padding="none" style={styles.stacked}>
          <TopBar title="Members" onBack={() => {}} backLabel="Back" />
        </Card>
        <Card padding="none">
          <TopBar
            title="Event"
            onBack={() => {}}
            backLabel="Back"
            action={{ icon: '⋯', label: 'More', onPress: () => {} }}
          />
        </Card>
      </Section>

      <Section title="Scheme">
        <SchemeProbe />
      </Section>

      <Section title="IconButton">
        <Row>
          <IconButton icon="‹" accessibilityLabel="Back" size="sm" />
          <IconButton icon="‹" accessibilityLabel="Back" size="md" />
          <IconButton icon="‹" accessibilityLabel="Back" size="lg" />
          <IconButton icon="×" accessibilityLabel="Close" filled />
          <IconButton icon="⋯" accessibilityLabel="More" disabled />
        </Row>
      </Section>

      <Section title="ListRow">
        <Card padding="none" style={styles.stacked}>
          <ListRow
            title="Ana Silva"
            subtitle="See you Tuesday!"
            leading={<Avatar name="Ana Silva" size="md" />}
            trailing={<Badge label="2" tone="primary" />}
            // The gallery had this row WITHOUT a trailingLabel, i.e. modelling
            // the exact defect that shipped to four screens: the badge is not
            // announced, so the row reads "Ana Silva. See you Tuesday!" and the
            // unread count is invisible to a screen reader. Suite 00 now asserts
            // on this row's announced name.
            trailingLabel="2 unread"
            onPress={() => {}}
          />
          <ListRow
            title="Maria Costa"
            subtitle="Can I bring a friend?"
            leading={<Avatar name="Maria Costa" size="md" />}
            onPress={() => {}}
          />
        </Card>
        <ListRow
          variant="card"
          title="Your match starts soon"
          subtitle="Court 3, in 30 minutes"
          highlighted
          onPress={() => {}}
        />
      </Section>

      <Section title="Card">
        <Card style={styles.stacked}>
          <Text variant="sectionTitle">Bordered</Text>
          <Text variant="body" tone="muted">
            The default surface. Watch the edge weight here.
          </Text>
        </Card>
        <Card elevated style={styles.stacked}>
          <Text variant="sectionTitle">Elevated</Text>
          <Text variant="body" tone="muted">
            Shadow instead of a border.
          </Text>
        </Card>
      </Section>

      <Section title="Field">
        <Field label="Name" placeholder="Ana Silva" required containerStyle={styles.stacked} />
        <Field
          label="Email"
          placeholder="you@example.com"
          hint="We only use this for match reminders."
          containerStyle={styles.stacked}
        />
        <Field
          label="Phone"
          value="12345"
          error="That number is too short."
          containerStyle={styles.stacked}
        />
        <Field label="Locked" value="Read only" editable={false} containerStyle={styles.stacked} />
      </Section>

      <Section title="EmptyState">
        <Card padding="none">
          <EmptyState
            title="No matches yet"
            body="When someone books a court near you, it shows up here."
            action={{ label: 'Find a court', onPress: () => {} }}
          />
        </Card>
      </Section>

      <Section title="Loading">
        <Card>
          <Loading label="Loading matches…" fill={false} />
        </Card>
      </Section>
    </Screen>
  );
}

export default {
  title: 'Design System/Overview',
};

const styles = StyleSheet.create({
  pageTitle: { marginTop: space[6], marginBottom: space[2] },
  section: { marginBottom: space[8] },
  sectionTitle: { marginBottom: space[3] },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginBottom: space[2] },
  stacked: { marginBottom: space[3] },
  swatchGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
  swatch: { width: 96 },
  swatchChip: {
    height: 48,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: space[1],
  },
  typeRow: { marginBottom: space[2] },
  radiusItem: { alignItems: 'center', gap: space[1] },
  radiusBox: {
    width: 56,
    height: 56,
    backgroundColor: colors.muted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  spaceRow: { flexDirection: 'row', alignItems: 'center', gap: space[2], marginBottom: space[1] },
  spaceLabel: { width: 20 },
  spaceBar: { height: 12, borderRadius: radius.sm, backgroundColor: colors.primary },
});
