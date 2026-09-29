import {
  blastSchema,
  useBlastTemplates,
  useCanCustomizeBlast,
  useCommunityMembers,
  useEvent,
  useEventBlastDeliveries,
  useEventBlasts,
  useGroup,
  useRetryBlast,
  useSendBlast,
  type BlastTemplate,
} from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFieldErrors } from '@/lib/useFieldErrors';
import { UpgradePrompt } from '@/components/community/UpgradePrompt';
import { colors, palette, space } from '../../../theme';
import { BottomSheet, Button, Card, Chip, EmptyState, emptyIcon, Field, Loading, Screen, Text, TopBar, useBanner } from '../../../components/ui';

type Channel = 'email' | 'whatsapp';
type BlastFieldKey = 'title' | 'description' | 'channels';

/** Pure: mirrors `blastSchema`'s required-ness at the field level. */
function validateBlast(values: {
  title: string;
  description: string;
  channels: Channel[];
}): Partial<Record<BlastFieldKey, string>> {
  const errors: Partial<Record<BlastFieldKey, string>> = {};
  if (!values.title.trim()) errors.title = 'required';
  if (!values.description.trim()) errors.description = 'required';
  if (values.channels.length === 0) errors.channels = 'blastChannelsRequired';
  return errors;
}

export default function BlastScreen() {
  const { t } = useT('event');
  const { t: tc } = useT('common');
  const banner = useBanner();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const uid = useSession().session?.user.id;

  const { data: canCustomize, isLoading: loadingTier } = useCanCustomizeBlast(id);
  const { data: templates } = useBlastTemplates();
  const { data: yourBlasts } = useEventBlasts(id);
  const sendBlast = useSendBlast(id);
  const { data: deliveries } = useEventBlastDeliveries(id);
  const retryBlast = useRetryBlast(id);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);

  // Starter's "Customize" button routes to the Plan section (UX-GLOB-10 Task 6);
  // that needs the event's community, and whether the viewer can act there.
  const { data: event } = useEvent(id);
  const { data: group } = useGroup(event?.group_id);
  const communityId = group?.community_id;
  const { data: communityMembers } = useCommunityMembers(communityId);
  const myRole = communityMembers?.find((m) => m.user_id === uid)?.role;
  const canManagePlan = myRole === 'admin';

  const [tab, setTab] = useState<'templates' | 'yours'>('templates');
  const [editing, setEditing] = useState<{ template: BlastTemplate | null; title: string; description: string } | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const { errors: fieldErrors, setErrors: setFieldErrors, clear: clearFieldError } = useFieldErrors<BlastFieldKey>();
  const [sentCount, setSentCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const toggleChannel = (c: Channel) => {
    setChannels((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
    clearFieldError('channels');
  };

  const defaultTemplate = (templates ?? []).find((tpl) => tpl.is_default) ?? (templates ?? [])[0] ?? null;

  const openCustomize = (tpl: BlastTemplate) => {
    setEditing({ template: tpl, title: tpl.title, description: tpl.description });
    setChannels([]);
    setFieldErrors({});
  };

  const submit = async (args: {
    template: BlastTemplate | null;
    title: string;
    description: string;
  }) => {
    const errors = validateBlast({ title: args.title, description: args.description, channels });
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      banner.show(tc('missingInformation'));
      return;
    }
    const parsed = blastSchema.safeParse({ title: args.title, description: args.description, channels });
    if (!parsed.success) {
      banner.show(tc('missingInformation'));
      return;
    }
    setFieldErrors({});
    setBusy(true);
    try {
      const { sentToCount } = await sendBlast.mutateAsync({
        sourceTemplateId: args.template?.id ?? null,
        title: parsed.data.title,
        description: parsed.data.description,
        imagePath: args.template?.image_path ?? null,
        channels: parsed.data.channels,
      });
      setEditing(null);
      setSentCount(sentToCount);
    } catch (e) {
      banner.show(t(e instanceof Error ? e.message : 'unknown_error'));
    } finally {
      setBusy(false);
    }
  };

  // --- Sent confirmation ---
  if (sentCount != null) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <View style={styles.sentBox}>
          <Text variant="title">{t('blastSentTitle')}</Text>
          <Text variant="body" tone="muted" style={styles.centerText}>{t('blastSentBody', { count: sentCount })}</Text>
          <Button label={t('back')} onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  if (loadingTier) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <Loading />
      </SafeAreaView>
    );
  }

  const channelRow = (
    <View>
      <View style={styles.channelRow}>
        {(['email', 'whatsapp'] as const).map((c) => (
          <Chip
            key={c}
            label={t(c === 'email' ? 'blastChannelEmail' : 'blastChannelWhatsapp')}
            selected={channels.includes(c)}
            onPress={() => toggleChannel(c)}
          />
        ))}
      </View>
      {fieldErrors.channels ? (
        <Text variant="hint" tone="destructive" style={styles.channelError}>
          {t('blastChannelsRequired')}
        </Text>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar title={t('blastTitle')} onBack={() => router.back()} backLabel={t('back')} />

      {!canCustomize ? (
        // --- Starter: read-only default template + channels + send ---
        <Screen scroll padded={false} style={styles.content}>
          {defaultTemplate ? (
            <View style={styles.card}>
              <Text variant="bodyStrong">{defaultTemplate.title}</Text>
              <Text variant="caption" tone="muted">{defaultTemplate.description}</Text>
            </View>
          ) : null}
          <Text variant="hint" tone="subtle" style={styles.label}>{t('blastSendToLabel')}</Text>
          <Text variant="bodyStrong">{t('blastSendToAll')}</Text>
          {channelRow}
          <Button
            label={t('blastSendCta')}
            loading={busy}
            disabled={!defaultTemplate}
            fullWidth
            onPress={() =>
              defaultTemplate &&
              submit({ template: defaultTemplate, title: defaultTemplate.title, description: defaultTemplate.description })
            }
          />
          <Button
            label={t('blastCustomizeTitle')}
            variant="secondary"
            fullWidth
            onPress={() => setShowUpgrade(true)}
            testID="blast-customize-upgrade-cta"
          />
        </Screen>
      ) : (
        // --- Basic/Pro: tabs + customize modal ---
        <Screen scroll padded={false} style={styles.content}>
          <View style={styles.tabs}>
            {(['templates', 'yours'] as const).map((tb) => (
              <Chip
                key={tb}
                label={t(tb === 'templates' ? 'blastTemplatesTab' : 'blastYourBlastsTab')}
                selected={tab === tb}
                onPress={() => setTab(tb)}
              />
            ))}
          </View>

          {tab === 'templates' ? (
            (templates ?? []).map((tpl) => (
              <Card key={tpl.id} style={styles.cardSpacing} onPress={() => openCustomize(tpl)}>
                <Text variant="bodyStrong">{tpl.title}</Text>
                <Text variant="caption" tone="muted" numberOfLines={2}>{tpl.description}</Text>
              </Card>
            ))
          ) : (yourBlasts ?? []).length === 0 ? (
            <EmptyState
              icon={emptyIcon('megaphone')}
              title={t('blastYourEmpty')}
              body={t('blastYoursEmptyBody')}
              testID="empty-blast"
            />
          ) : (
            (yourBlasts ?? []).map((b) => (
              <Card
                key={b.id}
                style={styles.cardSpacing}
                onPress={() =>
                  setEditing({
                    template: b.source_template_id
                      ? (templates ?? []).find((tp) => tp.id === b.source_template_id) ?? null
                      : null,
                    title: b.title,
                    description: b.description,
                  })
                }
              >
                <Text variant="bodyStrong">{b.title}</Text>
                <Text variant="caption" tone="muted" numberOfLines={1}>{b.description}</Text>
                {(() => {
                  const d = deliveries?.[b.id];
                  const label = !d ? t('deliveryPending') : d.status === 'sent' ? t('deliveryDelivered') : t('deliveryFailed');
                  return <Text variant="hint" tone="muted" style={styles.cardMeta}>{label}</Text>;
                })()}
                {deliveries?.[b.id]?.status === 'failed' ? (
                  <Button
                    label={retrying === b.id ? t('blastSendCta') : t('retryBlastCta')}
                    variant="tertiary"
                    size="sm"
                    loading={retrying === b.id}
                    onPress={() => {
                      setRetrying(b.id);
                      retryBlast.mutateAsync(b.id)
                        .catch((e) => banner.show(t(e instanceof Error ? e.message : 'unknown_error')))
                        .finally(() => setRetrying(null));
                    }}
                  />
                ) : null}
              </Card>
            ))
          )}
        </Screen>
      )}

      {/* Customize sheet (Basic/Pro) */}
      <BottomSheet
        visible={editing != null}
        onClose={() => setEditing(null)}
        title={t('blastCustomizeTitle')}
        testID="blast-customize-sheet"
      >
        <Field
          label={t('blastTitleLabel')}
          value={editing?.title ?? ''}
          maxLength={80}
          containerStyle={styles.cardSpacing}
          onChangeText={(v) => { setEditing((st) => (st ? { ...st, title: v } : st)); clearFieldError('title'); }}
          error={fieldErrors.title ? tc('required') : undefined}
        />
        <Field
          label={t('blastDescLabel')}
          value={editing?.description ?? ''}
          maxLength={1000}
          multiline
          containerStyle={styles.cardSpacing}
          onChangeText={(v) => { setEditing((st) => (st ? { ...st, description: v } : st)); clearFieldError('description'); }}
          error={fieldErrors.description ? tc('required') : undefined}
        />
        <Text variant="hint" tone="subtle" style={styles.label}>{t('blastSendToLabel')}</Text>
        <Text variant="bodyStrong">{t('blastSendToAll')}</Text>
        {channelRow}
        <Button
          label={t('blastSendCta')}
          loading={busy}
          fullWidth
          style={styles.cardSpacing}
          onPress={() => editing && submit(editing)}
        />
      </BottomSheet>

      {communityId ? (
        <UpgradePrompt
          visible={showUpgrade}
          onClose={() => setShowUpgrade(false)}
          communityId={communityId}
          message={t('upgradeBlast', { ns: 'community' })}
          canManage={canManagePlan}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { alignItems: 'center', justifyContent: 'center' },
  back: { fontSize: 32, color: colors.foreground, lineHeight: 32, width: 32 },
  content: { padding: 16, gap: 12 },

  tabs: { flexDirection: 'row', backgroundColor: colors.accent, borderRadius: 10, padding: 3 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },

  cardSpacing: { marginBottom: space[3] },
  centerText: { textAlign: 'center' },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 14, gap: 4 },
  cardMeta: { fontSize: 12, color: colors.mutedForeground, marginTop: 4 },

  label: { fontSize: 13, fontWeight: '700', color: palette.slate[400], textTransform: 'uppercase' },
  channelRow: { flexDirection: 'row', gap: 10 },
  channelError: { marginTop: 6 },
  channel: { flex: 1, minHeight: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.card, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },

  sentBox: { paddingHorizontal: 32, alignItems: 'center', gap: 12 },

});
