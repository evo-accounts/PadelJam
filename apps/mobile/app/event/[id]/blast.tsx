/**
 * Send blast (UX-MEVT-18) — reached from the event page's chip row and the Manage Event dashboard,
 * on group and group-less events alike (decision 6). Organizer only.
 *
 * Without customisation (can_customize_event_blast false): one Templates grid, each card with a
 * preview image and "Select". The selected template opens read-only — it is sent as it is (B10) —
 * and a card under the grid leads to the plan that unlocks customising (UX-GLOB-10: plans are
 * granted on request during the MVP). A group event's plan is its community's; a group-less
 * event's is the organizer's account plan (Jammer+).
 *
 * With customisation: tabs Templates / Your blasts. Selecting a template, or a saved blast, opens
 * "Customize your blast" — image, Title, Description — with "Save blast" pinned above Send.
 *
 * Both: Send to (all members / confirmed only / invited only / waiting list), Channels (Email,
 * WhatsApp), Send. WhatsApp is not sent by the server: once the blast is recorded, the organizer's
 * WhatsApp opens with the text prefilled (wa.me). Success is a full-screen "Blast sent!" with OK.
 *
 * Template artwork does not exist yet (blast_templates.image_path is NULL, 0124), so every preview
 * is a neutral placeholder, and a custom image cannot be picked until there is somewhere to put it.
 *
 * Sent blasts are listed under the grid with their email delivery state, so a failed delivery can
 * still be retried (retry_blast) as before.
 */
import {
  useBlastTemplates,
  useCanCustomizeBlast,
  useCommunityMembers,
  useDeleteSavedBlast,
  useEvent,
  useEventBlastDeliveries,
  useEventBlasts,
  useGroup,
  useRetryBlast,
  useSavedBlasts,
  useSendBlast,
  useUpdateSavedBlast,
  type BlastChannel,
  type BlastSendTo,
  type BlastTemplate,
  type SavedBlast,
} from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { UpgradePrompt } from '@/components/community/UpgradePrompt';
import { blastPlan, validateBlast, whatsappUrl, type BlastDraft, type BlastFieldKey } from '@/components/event/manage/blastForm';
import { ManageSheet } from '@/components/event/manage/ManageSheet';
import { useGoBack } from '@/lib/useGoBack';
import { colors, radius, space } from '../../../theme';
import {
  BottomSheet,
  Button,
  Card,
  Checkbox,
  EmptyState,
  emptyIcon,
  Field,
  Illustration,
  ListRow,
  Segmented,
  Text,
  TopBar,
  useBanner,
  useConfirm,
} from '../../../components/ui';

const SEND_TO: readonly BlastSendTo[] = ['all', 'confirmed', 'invited', 'waiting_list'];

type Sent = { email: boolean; whatsapp: boolean; sentToCount: number };

export default function BlastScreen() {
  const { t } = useT('event');
  const { t: tc } = useT('common');
  const banner = useBanner();
  const confirm = useConfirm();
  const router = useRouter();
  const goBack = useGoBack();
  const { id } = useLocalSearchParams<{ id: string }>();
  const uid = useSession().session?.user.id;

  const { data: event, isLoading: loadingEvent } = useEvent(id);
  const { data: canCustomize, isLoading: loadingTier } = useCanCustomizeBlast(id);
  const custom = canCustomize === true;
  const { data: templates, isLoading: loadingTemplates } = useBlastTemplates();
  const { data: saved } = useSavedBlasts(id, { enabled: custom });
  const { data: sentBlasts } = useEventBlasts(id);
  const { data: deliveries } = useEventBlastDeliveries(id);
  const sendBlast = useSendBlast(id);
  const updateSaved = useUpdateSavedBlast();
  const deleteSaved = useDeleteSavedBlast();
  const retryBlast = useRetryBlast(id);

  // The locked-customisation prompt needs the event's community, and whether the viewer can act
  // on its Plan section (owners/admins only).
  const { data: group } = useGroup(event?.group_id);
  const communityId = group?.community_id;
  const { data: communityMembers } = useCommunityMembers(communityId);
  const canManagePlan = communityMembers?.find((m) => m.user_id === uid)?.role === 'admin';

  const [tab, setTab] = useState<'templates' | 'saved'>('templates');
  const [draft, setDraft] = useState<BlastDraft | null>(null);
  const [sendTo, setSendTo] = useState<BlastSendTo>('all');
  const [sendToOpen, setSendToOpen] = useState(false);
  const [channels, setChannels] = useState<BlastChannel[]>(['email']);
  const [save, setSave] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<BlastFieldKey, string>>>({});
  const [sheetError, setSheetError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<Sent | null>(null);
  const [locked, setLocked] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);

  if (loadingEvent || loadingTier) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <ActivityIndicator color={colors.foreground} />
      </SafeAreaView>
    );
  }
  if (event == null || uid == null || uid !== event.organizer_id) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <TopBar onBack={goBack} backLabel={t('back')} title={t('blastTitle')} />
        <EmptyState fill title={t('forbidden')} testID="blast-forbidden" />
      </SafeAreaView>
    );
  }

  // --- Success (UX-MEVT-18: illustration, "Blast sent!", OK) ---
  if (sent) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.sentBox}>
          <Illustration name="blastSent" size="inline" />
          <Text variant="title" accessibilityRole="header" style={styles.centerText}>
            {t('blastSentTitle')}
          </Text>
          {sent.email ? (
            <Text variant="body" tone="muted" style={styles.centerText}>
              {sent.sentToCount > 0 ? t('blastSentEmail', { count: sent.sentToCount }) : t('blastSentEmailNone')}
            </Text>
          ) : null}
          {sent.whatsapp ? (
            <Text variant="body" tone="muted" style={styles.centerText}>
              {t('blastSentWhatsapp')}
            </Text>
          ) : null}
        </View>
        <View style={styles.footer}>
          <Button label={t('blastOkCta')} fullWidth onPress={goBack} testID="blast-sent-ok" />
        </View>
      </SafeAreaView>
    );
  }

  const open = (next: BlastDraft) => {
    setDraft(next);
    setSendTo('all');
    setSendToOpen(false);
    setChannels(['email']);
    setSave(false);
    setErrors({});
    setSheetError(null);
  };
  const openTemplate = (tpl: BlastTemplate) =>
    open({ source: 'template', templateId: tpl.id, savedId: null, title: tpl.title, description: tpl.description, imagePath: tpl.image_path });
  const openSaved = (b: SavedBlast) =>
    open({ source: 'saved', templateId: b.source_template_id, savedId: b.id, title: b.title, description: b.description, imagePath: b.image_path });

  const toggleChannel = (c: BlastChannel) => {
    setChannels((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
    setErrors((e) => ({ ...e, channels: undefined }));
  };

  const shareOnWhatsapp = async (text: string) => {
    try {
      await Linking.openURL(whatsappUrl(text));
    } catch {
      // No handler for the link: the system share sheet still reaches WhatsApp if it is installed.
      try {
        await Share.share({ message: text });
      } catch {
        banner.show(t('blastWhatsappFailed'));
      }
    }
  };

  const submit = async () => {
    if (!draft) return;
    const invalid = validateBlast(draft, channels, custom);
    if (Object.keys(invalid).length) {
      setErrors(invalid);
      setSheetError(invalid.channels && !invalid.title && !invalid.description ? t('blastChannelsRequired') : tc('missingInformation'));
      return;
    }
    setErrors({});
    setSheetError(null);
    setBusy(true);
    try {
      const plan = blastPlan(draft, { custom, channels, sendTo, save });
      if (plan.update) await updateSaved.mutateAsync(plan.update);
      const result = await sendBlast.mutateAsync(plan.send);
      setDraft(null);
      setSent({ email: channels.includes('email'), whatsapp: channels.includes('whatsapp'), sentToCount: result.sentToCount });
      if (channels.includes('whatsapp') && result.shareText) void shareOnWhatsapp(result.shareText);
    } catch (e) {
      // The sheet is a Modal over the banner, so the failure is shown inside it (UX-GLOB-06).
      setSheetError(t(e instanceof Error ? e.message : 'unknown_error'));
    } finally {
      setBusy(false);
    }
  };

  const removeSaved = async (b: SavedBlast) => {
    const ok = await confirm({ title: t('blastDeleteSavedTitle'), body: b.title, confirmLabel: t('blastDeleteSaved'), destructive: true });
    if (!ok) return;
    try {
      await deleteSaved.mutateAsync(b.id);
      banner.show(t('blastDeletedToast'), 'success');
    } catch (e) {
      banner.show(t(e instanceof Error ? e.message : 'unknown_error'));
    }
  };

  const placeholder = (big = false) => (
    <View style={[styles.preview, big && styles.previewBig]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {emptyIcon('megaphone')}
    </View>
  );

  const templatesGrid =
    loadingTemplates ? (
      <ActivityIndicator color={colors.foreground} style={styles.loading} />
    ) : (
      <View style={styles.grid}>
        {(templates ?? []).map((tpl, i) => (
          <Card key={tpl.id} padding="sm" style={styles.gridCard}>
            {placeholder()}
            <Text variant="bodyStrong" numberOfLines={2}>
              {tpl.title}
            </Text>
            <Text variant="caption" tone="muted" numberOfLines={3} style={styles.gridBody}>
              {tpl.description}
            </Text>
            <Button
              label={t('blastSelectCta')}
              variant="secondary"
              size="sm"
              fullWidth
              accessibilityLabel={`${t('blastSelectCta')}: ${tpl.title}`}
              onPress={() => openTemplate(tpl)}
              testID={`blast-template-${i}`}
            />
          </Card>
        ))}
      </View>
    );

  const savedList =
    (saved ?? []).length === 0 ? (
      <EmptyState icon={emptyIcon('megaphone')} title={t('blastSavedEmptyTitle')} body={t('blastSavedEmptyBody')} testID="blast-saved-empty" />
    ) : (
      (saved ?? []).map((b) => (
        <ListRow
          key={b.id}
          variant="card"
          title={b.title}
          subtitle={b.description}
          subtitleLines={2}
          onPress={() => openSaved(b)}
          trailingInteractive
          trailing={<Button label={t('blastDeleteSaved')} variant="tertiary" size="sm" onPress={() => void removeSaved(b)} />}
          testID={`blast-saved-${b.id}`}
        />
      ))
    );

  const sentList = (sentBlasts ?? []).length ? (
    <View style={styles.sentSection}>
      <Text variant="sectionTitle" accessibilityRole="header">
        {t('blastSentSection')}
      </Text>
      {(sentBlasts ?? []).map((b) => {
        const d = deliveries?.[b.id];
        const status = !b.channels.includes('email')
          ? t('blastChannelWhatsapp')
          : !d
            ? t('deliveryPending')
            : d.status === 'sent'
              ? t('deliveryDelivered')
              : t('deliveryFailed');
        return (
          <ListRow
            key={b.id}
            variant="plain"
            title={b.title}
            subtitle={`${t(`blastSendTo_${(SEND_TO as readonly string[]).includes(b.send_to) ? b.send_to : 'all'}` as never)} · ${status}`}
            trailingInteractive={d?.status === 'failed'}
            trailing={
              d?.status === 'failed' ? (
                <Button
                  label={t('retryBlastCta')}
                  variant="tertiary"
                  size="sm"
                  loading={retrying === b.id}
                  onPress={() => {
                    setRetrying(b.id);
                    retryBlast
                      .mutateAsync(b.id)
                      .catch((e) => banner.show(t(e instanceof Error ? e.message : 'unknown_error')))
                      .finally(() => setRetrying(null));
                  }}
                />
              ) : undefined
            }
          />
        );
      })}
    </View>
  ) : null;

  const lockedCard = (
    <Card style={styles.locked}>
      <Text variant="bodyStrong">{t('blastLockedTitle')}</Text>
      <Text variant="caption" tone="muted">
        {t('blastLockedBody')}
      </Text>
      <Button label={t('blastLockedCta')} variant="secondary" fullWidth onPress={() => setLocked(true)} testID="blast-customize-upgrade-cta" />
    </Card>
  );

  const errorText = (key: BlastFieldKey) =>
    errors[key] === 'too_long' ? t('blast_too_long') : errors[key] ? tc('required') : undefined;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar onBack={goBack} backLabel={t('back')} title={t('blastTitle')} />
      <ScrollView contentContainerStyle={styles.content}>
        {custom ? (
          <Segmented
            options={[
              { value: 'templates' as const, label: t('blastTemplatesTab') },
              { value: 'saved' as const, label: t('blastYourBlastsTab') },
            ]}
            value={tab}
            onChange={setTab}
            testID="blast-tabs"
          />
        ) : null}
        {custom && tab === 'saved' ? savedList : templatesGrid}
        {!custom ? lockedCard : null}
        {sentList}
      </ScrollView>

      {draft ? (
        <ManageSheet
          title={custom ? t('blastCustomizeTitle') : draft.title}
          onClose={() => setDraft(null)}
          primaryLabel={t('blastSendCta')}
          onPrimary={() => void submit()}
          busy={busy}
          error={sheetError}
          footerExtra={
            custom ? (
              <Checkbox
                checked={save}
                onChange={setSave}
                label={draft.source === 'saved' ? t('blastUpdateSavedCheckbox') : t('blastSaveCheckbox')}
                testID="blast-save"
              />
            ) : undefined
          }
          testID="blast-compose"
        >
          <View>
            {custom ? (
              <Text variant="label" style={styles.label}>
                {t('blastImageLabel')}
              </Text>
            ) : null}
            {placeholder(true)}
          </View>
          {custom ? (
            <>
              <Field
                label={t('blastTitleLabel')}
                value={draft.title}
                maxLength={80}
                onChangeText={(v) => {
                  setDraft((d) => (d ? { ...d, title: v } : d));
                  setErrors((e) => ({ ...e, title: undefined }));
                }}
                error={errorText('title')}
                testID="blast-title"
              />
              <Field
                label={t('blastDescLabel')}
                value={draft.description}
                maxLength={1000}
                multiline
                onChangeText={(v) => {
                  setDraft((d) => (d ? { ...d, description: v } : d));
                  setErrors((e) => ({ ...e, description: undefined }));
                }}
                error={errorText('description')}
                testID="blast-description"
              />
            </>
          ) : (
            <View style={styles.readOnly}>
              <Text variant="body">{draft.description}</Text>
              <Text variant="hint" tone="muted">
                {t('blastReadOnlyNote')}
              </Text>
            </View>
          )}

          {/* Send to — an inline dropdown: a nested Modal (the action sheet) cannot open over this sheet. */}
          <View>
            <Text variant="label" style={styles.label}>
              {t('blastSendToLabel')}
            </Text>
            <Pressable
              style={styles.dropdown}
              onPress={() => setSendToOpen((o) => !o)}
              accessibilityRole="button"
              accessibilityState={{ expanded: sendToOpen }}
              accessibilityLabel={`${t('blastSendToLabel')}: ${t(`blastSendTo_${sendTo}`)}`}
              testID="blast-send-to"
            >
              <Text variant="body" style={styles.flex}>
                {t(`blastSendTo_${sendTo}`)}
              </Text>
              <Text variant="body" tone="muted">
                {sendToOpen ? '▴' : '▾'}
              </Text>
            </Pressable>
            {sendToOpen
              ? SEND_TO.map((option) => (
                  <ListRow
                    key={option}
                    variant="plain"
                    title={t(`blastSendTo_${option}`)}
                    selected={option === sendTo}
                    trailing={option === sendTo ? <Text variant="body" tone="primary">✓</Text> : undefined}
                    onPress={() => {
                      setSendTo(option);
                      setSendToOpen(false);
                    }}
                    testID={`blast-send-to-${option}`}
                  />
                ))
              : null}
          </View>

          <View style={styles.channels}>
            <Text variant="label">{t('blastChannelsLabel')}</Text>
            <Checkbox
              checked={channels.includes('email')}
              onChange={() => toggleChannel('email')}
              label={t('blastChannelEmail')}
              testID="blast-channel-email"
            />
            <Checkbox
              checked={channels.includes('whatsapp')}
              onChange={() => toggleChannel('whatsapp')}
              label={t('blastChannelWhatsapp')}
              error={errors.channels ? t('blastChannelsRequired') : null}
              testID="blast-channel-whatsapp"
            />
          </View>
        </ManageSheet>
      ) : null}

      {/* Locked customisation (UX-GLOB-10): the community's plan, or the organizer's own. */}
      {communityId ? (
        <UpgradePrompt
          visible={locked}
          onClose={() => setLocked(false)}
          communityId={communityId}
          message={t('blastUpgradeCommunity')}
          canManage={canManagePlan}
        />
      ) : (
        <BottomSheet visible={locked} onClose={() => setLocked(false)} title={t('blastUpgradeAccount')} testID="upgrade-prompt-sheet">
          <Button
            label={t('blastSeePlans')}
            fullWidth
            onPress={() => {
              setLocked(false);
              router.push('/profile/plan' as Href);
            }}
            testID="upgrade-prompt-cta"
          />
        </BottomSheet>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  content: { padding: space[4], gap: space[4], paddingBottom: space[10] },
  loading: { paddingVertical: space[6] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
  gridCard: { width: '47.5%', gap: space[2] },
  gridBody: { flexGrow: 1 },
  preview: {
    height: 88,
    borderRadius: radius.md,
    backgroundColor: colors.muted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewBig: { height: 140 },
  locked: { gap: space[2] },
  sentSection: { gap: space[1] },
  label: { marginBottom: space[1] },
  readOnly: { gap: space[2] },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingHorizontal: space[3],
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.card,
  },
  channels: { gap: space[3] },
  sentBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[3], paddingHorizontal: space[8] },
  centerText: { textAlign: 'center' },
  footer: { paddingHorizontal: space[4], paddingBottom: space[2] },
});
