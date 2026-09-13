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
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { CommunityCard } from '../explore/CommunityCard';
import { PlayerCard } from '../explore/PlayerCard';
import { EventCard } from '../event/EventCard';
import { GroupCard } from '../group/GroupCard';
import { colors, radius, space, type as typeScale } from '../../theme';
import { Avatar } from './Avatar';
import { Badge } from './Badge';
import { useBanner } from './Banner';
import { Button } from './Button';
import { Card } from './Card';
import { Chip } from './Chip';
import { Checkbox } from './Checkbox';
import { CodeField } from './CodeField';
import { Dots } from './Dots';
import { EmptyState } from './EmptyState';
import { IconButton } from './IconButton';
import { Illustration } from './Illustration';
import { ListRow } from './ListRow';
import { useActionSheet, useConfirm } from './SheetHost';
import { TopBar } from './TopBar';
import { Field } from './Field';
import { PasswordField } from './PasswordField';
import { PhoneField } from './PhoneField';
import { Loading, Screen } from './Screen';
import { Text } from './Text';

/**
 * One fixture per card kind (UX-GLOB-09), named distinctly from every other
 * gallery fixture ("Ana Silva", "Maria Costa", …) so a screen-reader dump of
 * this section is never ambiguous about which control belongs to which demo.
 */
const GALLERY_EVENT = {
  id: 'gallery-event',
  name: 'Card Gallery Open',
  event_type: 'americano',
  specification: 'classic',
  status: 'scheduled',
  starts_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 3).toISOString(),
  distance_m: 2400,
} as never;
const GALLERY_GROUP = {
  id: 'gallery-group',
  name: 'Card Gallery League',
  thumbnail_path: null,
  is_private: false,
  is_general: true,
  archived_at: null,
};
const GALLERY_COMMUNITY = {
  id: 'gallery-community',
  name: 'Card Gallery Club',
  description: null,
  privacy: 'request_to_join',
  location: 'Lisbon, Portugal',
  cover_image_path: null,
  thumbnail_path: null,
};
const GALLERY_PLAYER = {
  id: 'gallery-player',
  full_name: 'Marta Duarte',
  avatar_url: null,
  dominant_hand: 'right',
  court_side: 'left',
};

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
        <Row>
          <Avatar name="Rui Trindade" colourKey="user-a" size="lg" />
          <Avatar name="Sara Lima" colourKey="user-b" size="lg" />
        </Row>
        {/* decorative: the visible name is the accessible text, so the avatar
            itself must not also announce "image, Ana Silva". */}
        <Row>
          <Avatar name="Ana Silva" size="md" decorative />
          <Text variant="body">Ana Silva</Text>
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
          <TopBar variant="top" title="Home" actions={[{ icon: '⌕', label: 'Search', onPress: () => {} }]} />
        </Card>
        <Card padding="none" style={styles.stacked}>
          <TopBar
            variant="top"
            title="Home"
            actions={[
              { icon: '💬', label: 'Chat', onPress: () => {} },
              { icon: '🔔', label: 'Notifications', onPress: () => {} },
              { icon: '⌕', label: 'Search', onPress: () => {} },
            ]}
          />
        </Card>
        <Card padding="none" style={styles.stacked}>
          <TopBar variant="nav" title="Members" onBack={() => {}} />
        </Card>
        <Card padding="none" style={styles.stacked}>
          <TopBar variant="nav" onBack={() => {}} actions={[{ icon: '⋯', label: 'More', onPress: () => {} }]} />
        </Card>
        <Card padding="none" style={styles.stacked}>
          {/* UX-GLOB-08: the search screen's nav bar carries the search Field
              in place of a title — no separate title text is rendered. */}
          <TopBar
            variant="nav"
            onBack={() => {}}
            centre={<Field placeholder="Search" accessibilityLabel="Search" testID="gallery-topbar-search" />}
          />
        </Card>
        <Card padding="none" style={styles.stacked}>
          <TopBar variant="edit" title="Edit profile" onClose={() => {}} />
        </Card>
        <Card padding="none">
          <TopBar variant="wizard" title="Create event" onBack={() => {}} onClose={() => {}} />
        </Card>
      </Section>

      <Section title="BottomSheet">
        <GallerySheetDemo />
      </Section>

      <Section title="Banner">
        <GalleryBannerDemo />
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

      {/*
        UX-GLOB-09: every card that carries an `orientation` prop, shown at
        both values — `vertical` (a rail's fixed-width card) above its
        `horizontal` (a list screen's full-width row) counterpart. Each pair
        gets its own labelled heading so `scrollUntilVisible` in suite 00 has
        an unambiguous, unique target per card kind, the same rule the module
        doc above already calls out for the primitive sections.
      */}
      <Section title="Cards">
        <Text variant="label" tone="muted" style={styles.cardKindLabel}>
          EventCard — vertical
        </Text>
        <Row>
          <EventCard event={GALLERY_EVENT} orientation="vertical" onPress={() => {}} />
        </Row>
        <Text variant="label" tone="muted" style={styles.cardKindLabel}>
          EventCard — horizontal
        </Text>
        <EventCard event={GALLERY_EVENT} orientation="horizontal" onPress={() => {}} />

        <Text variant="label" tone="muted" style={styles.cardKindLabel}>
          GroupCard — vertical
        </Text>
        <Row>
          <GroupCard group={GALLERY_GROUP} orientation="vertical" onPress={() => {}} />
        </Row>
        <Text variant="label" tone="muted" style={styles.cardKindLabel}>
          GroupCard — horizontal
        </Text>
        <GroupCard group={GALLERY_GROUP} orientation="horizontal" onPress={() => {}} />

        <Text variant="label" tone="muted" style={styles.cardKindLabel}>
          CommunityCard — vertical
        </Text>
        <Row>
          <CommunityCard
            community={GALLERY_COMMUNITY}
            orientation="vertical"
            onOpen={() => {}}
            onRequestJoin={() => {}}
          />
        </Row>
        <Text variant="label" tone="muted" style={styles.cardKindLabel}>
          CommunityCard — horizontal
        </Text>
        <CommunityCard
          community={GALLERY_COMMUNITY}
          orientation="horizontal"
          onOpen={() => {}}
          onRequestJoin={() => {}}
        />

        <Text variant="label" tone="muted" style={styles.cardKindLabel}>
          PlayerCard — vertical
        </Text>
        <Row>
          <PlayerCard player={GALLERY_PLAYER} orientation="vertical" onPress={() => {}} />
        </Row>
        <Text variant="label" tone="muted" style={styles.cardKindLabel}>
          PlayerCard — horizontal
        </Text>
        <PlayerCard player={GALLERY_PLAYER} orientation="horizontal" onPress={() => {}} />
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

      <Section title="PasswordField">
        <GalleryPasswordFieldDemo />
      </Section>

      {/*
        The sign-in redesign's primitives, kept in ONE section: they are
        adopted together by the same flow, and a reviewer judging the OTP
        screen wants the code field, its error state and the terms tick in a
        single frame rather than four scroll positions apart.
      */}
      <Section title="Sign-in primitives">
        <GallerySignInDemo />
      </Section>

      <Section title="PhoneField">
        <GalleryPhoneFieldDemo />
      </Section>

      <Section title="EmptyState">
        <Card padding="none" style={styles.stacked}>
          <EmptyState
            title="No matches yet"
            body="When someone books a court near you, it shows up here."
            action={{ label: 'Find a court', onPress: () => {} }}
          />
        </Card>
        <Card padding="none">
          <EmptyState
            tone="error"
            title="Couldn't load events"
            body="Check your connection and try again."
            action={{ label: 'Retry', onPress: () => {} }}
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

function GallerySheetDemo() {
  const confirm = useConfirm();
  const show = useActionSheet();
  const [last, setLast] = useState<string>('');
  return (
    <View style={{ gap: space[2] }}>
      <Button
        label="Open confirm"
        variant="outline"
        onPress={async () =>
          setLast(
            (await confirm({ title: 'Delete this?', body: 'It cannot be undone.', confirmLabel: 'Delete', destructive: true }))
              ? 'confirmed'
              : 'cancelled',
          )
        }
      />
      <Button
        label="Open action sheet"
        variant="outline"
        onPress={async () =>
          setLast(
            (await show({
              title: 'Ana Silva',
              actions: [
                { key: 'msg', label: 'Message' },
                { key: 'remove', label: 'Remove', destructive: true },
              ],
            })) ?? 'dismissed',
          )
        }
      />
      <Text variant="caption" tone="muted">
        Last result: {last || '—'}
      </Text>
    </View>
  );
}

function GalleryBannerDemo() {
  const banner = useBanner();
  return <Button label="Show banner" variant="outline" onPress={() => banner.show('Missing information')} />;
}

function GallerySignInDemo() {
  // Three fixed values, not one live field: the empty / partly filled / error
  // states have to be on screen TOGETHER for the screenshot to be worth
  // anything, and a single interactive field can only ever be in one of them.
  const [code, setCode] = useState('');
  const [agreed, setAgreed] = useState(false);

  return (
    <>
      <Text variant="label" tone="muted" style={styles.cardKindLabel}>
        CodeField — empty
      </Text>
      <CodeField
        label="Verification code"
        value={code}
        onChangeText={setCode}
        hint="Enter the six digits we sent you."
        autofill="sms"
        containerStyle={styles.stacked}
        testID="gallery-code-empty"
      />

      <Text variant="label" tone="muted" style={styles.cardKindLabel}>
        CodeField — partly filled
      </Text>
      <CodeField
        label="Code in progress"
        value="123"
        onChangeText={() => {}}
        containerStyle={styles.stacked}
        testID="gallery-code-partial"
      />

      <Text variant="label" tone="muted" style={styles.cardKindLabel}>
        CodeField — error
      </Text>
      <CodeField
        label="Code with an error"
        value="123456"
        onChangeText={() => {}}
        error="That code isn't right. Try again."
        containerStyle={styles.stacked}
        testID="gallery-code-error"
      />

      <Text variant="label" tone="muted" style={styles.cardKindLabel}>
        Dots
      </Text>
      <Row>
        <Dots count={3} index={1} testID="gallery-dots-3" />
      </Row>
      <Row>
        <Dots count={5} index={0} testID="gallery-dots-5" />
      </Row>

      <Text variant="label" tone="muted" style={styles.cardKindLabel}>
        Illustration — hero and inline
      </Text>
      {/* Both are PLACEHOLDERS until the artwork lands — a muted block with a
          glyph is meant to look unfinished, so it cannot ship unnoticed. */}
      <Illustration name="welcomeFind" size="hero" style={styles.stacked} />
      <Row>
        <Illustration name="welcomeCommunity" size="inline" />
        <Illustration name="welcomePlay" size="inline" />
        <Illustration name="passwordChanged" size="inline" />
      </Row>

      <Text variant="label" tone="muted" style={styles.cardKindLabel}>
        Checkbox
      </Text>
      <Checkbox
        checked={agreed}
        onChange={setAgreed}
        label="Email me when a match near me opens up"
        style={styles.stacked}
        testID="gallery-checkbox-live"
      />
      <Checkbox
        checked
        onChange={() => {}}
        label="Already ticked"
        style={styles.stacked}
        testID="gallery-checkbox-checked"
      />
      <Checkbox
        checked={false}
        onChange={() => {}}
        label="I accept the terms"
        error="You have to accept the terms to continue."
        testID="gallery-checkbox-error"
      />
    </>
  );
}


function GalleryPhoneFieldDemo() {
  // Two live inputs and one error state, matching how the Field section above
  // is laid out. The filled one starts from an E.164 value so the screenshot
  // shows the selector resolving 🇧🇷 +55 out of the number rather than from the
  // device region.
  const [empty, setEmpty] = useState('');
  const [filled, setFilled] = useState('+5511961234567');
  return (
    <>
      <PhoneField
        label="Phone"
        value={empty}
        onChangeValue={(e164) => setEmpty(e164)}
        defaultRegion="PT"
        testID="gallery-phone"
        containerStyle={styles.stacked}
      />
      <PhoneField
        label="Phone"
        value={filled}
        onChangeValue={(e164) => setFilled(e164)}
        hint="We only use this for match reminders."
        testID="gallery-phone-filled"
        containerStyle={styles.stacked}
      />
      <PhoneField
        label="Phone"
        value=""
        onChangeValue={() => {}}
        error="That number is too short."
        defaultRegion="GB"
        testID="gallery-phone-error"
      />
    </>
  );
}

function GalleryPasswordFieldDemo() {
  // 'Padel12': 7 chars (< 8, minLength unmet), has an uppercase and a digit,
  // no symbol — exactly two of the four rules ticked, so the screenshot shows
  // both the met and unmet states of the checklist.
  const [withRules, setWithRules] = useState('Padel12');
  const [plain, setPlain] = useState('');
  return (
    <>
      <PasswordField
        label="New password"
        value={withRules}
        onChangeText={setWithRules}
        showRules
        testID="gallery-password-with-rules"
        containerStyle={styles.stacked}
      />
      <PasswordField
        label="Current password"
        value={plain}
        onChangeText={setPlain}
        testID="gallery-password-plain"
      />
    </>
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
  cardKindLabel: { marginTop: space[4], marginBottom: space[2] },
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
