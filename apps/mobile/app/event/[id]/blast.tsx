import {
  blastSchema,
  useBlastTemplates,
  useCanCustomizeBlast,
  useEventBlasts,
  useSendBlast,
  type BlastTemplate,
} from '@padel/api';
import { useT } from '@padel/i18n';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Channel = 'email' | 'whatsapp';

export default function BlastScreen() {
  const { t } = useT('event');
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: canCustomize, isLoading: loadingTier } = useCanCustomizeBlast(id);
  const { data: templates } = useBlastTemplates();
  const { data: yourBlasts } = useEventBlasts(id);
  const sendBlast = useSendBlast(id);

  const [tab, setTab] = useState<'templates' | 'yours'>('templates');
  const [editing, setEditing] = useState<{ template: BlastTemplate | null; title: string; description: string } | null>(null);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [sentCount, setSentCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const toggleChannel = (c: Channel) =>
    setChannels((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));

  const defaultTemplate = (templates ?? []).find((tpl) => tpl.is_default) ?? (templates ?? [])[0] ?? null;

  const openCustomize = (tpl: BlastTemplate) => {
    setEditing({ template: tpl, title: tpl.title, description: tpl.description });
    setChannels([]);
    setError(null);
  };

  const submit = async (args: {
    template: BlastTemplate | null;
    title: string;
    description: string;
  }) => {
    const parsed = blastSchema.safeParse({ title: args.title, description: args.description, channels });
    if (!parsed.success) {
      setError(t('blastChannelsRequired'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const count = await sendBlast.mutateAsync({
        sourceTemplateId: args.template?.id ?? null,
        title: parsed.data.title,
        description: parsed.data.description,
        imagePath: args.template?.image_path ?? null,
        channels: parsed.data.channels,
      });
      setEditing(null);
      setSentCount(count);
    } catch (e) {
      setError(t(e instanceof Error ? e.message : 'unknown_error'));
    } finally {
      setBusy(false);
    }
  };

  // --- Sent confirmation ---
  if (sentCount != null) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <View style={styles.sentBox}>
          <Text style={styles.sentTitle}>{t('blastSentTitle')}</Text>
          <Text style={styles.sentBody}>{t('blastSentBody', { count: sentCount })}</Text>
          <Pressable style={[styles.btn, styles.primaryBtn]} onPress={() => router.back()} accessibilityRole="button">
            <Text style={styles.primaryLabel}>{t('back')}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  if (loadingTier) {
    return (
      <SafeAreaView style={[styles.container, styles.center]} edges={['top']}>
        <ActivityIndicator color="#0B1F3A" />
      </SafeAreaView>
    );
  }

  const channelRow = (
    <View style={styles.channelRow}>
      {(['email', 'whatsapp'] as const).map((c) => (
        <Pressable
          key={c}
          style={[styles.channel, channels.includes(c) ? styles.channelOn : null]}
          onPress={() => toggleChannel(c)}
          accessibilityRole="button"
        >
          <Text style={[styles.channelText, channels.includes(c) ? styles.channelTextOn : null]}>
            {t(c === 'email' ? 'blastChannelEmail' : 'blastChannelWhatsapp')}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={12}>
          <Text style={styles.back}>‹</Text>
        </Pressable>
        <Text style={styles.topTitle}>{t('blastTitle')}</Text>
        <View style={{ width: 32 }} />
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {!canCustomize ? (
        // --- Starter: read-only default template + channels + send ---
        <ScrollView contentContainerStyle={styles.content}>
          {defaultTemplate ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{defaultTemplate.title}</Text>
              <Text style={styles.cardBody}>{defaultTemplate.description}</Text>
            </View>
          ) : null}
          <Text style={styles.label}>{t('blastSendToLabel')}</Text>
          <Text style={styles.readonly}>{t('blastSendToAll')}</Text>
          {channelRow}
          <Pressable
            style={[styles.btn, styles.primaryBtn, (busy || !defaultTemplate || channels.length === 0) && styles.btnDisabled]}
            disabled={busy || !defaultTemplate || channels.length === 0}
            onPress={() =>
              defaultTemplate &&
              submit({ template: defaultTemplate, title: defaultTemplate.title, description: defaultTemplate.description })
            }
            accessibilityRole="button"
          >
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryLabel}>{t('blastSendCta')}</Text>}
          </Pressable>
        </ScrollView>
      ) : (
        // --- Basic/Pro: tabs + customize modal ---
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.tabs}>
            {(['templates', 'yours'] as const).map((tb) => (
              <Pressable key={tb} style={[styles.tab, tab === tb ? styles.tabOn : null]} onPress={() => setTab(tb)} accessibilityRole="button">
                <Text style={[styles.tabText, tab === tb ? styles.tabTextOn : null]}>
                  {t(tb === 'templates' ? 'blastTemplatesTab' : 'blastYourBlastsTab')}
                </Text>
              </Pressable>
            ))}
          </View>

          {tab === 'templates' ? (
            (templates ?? []).map((tpl) => (
              <Pressable key={tpl.id} style={styles.card} onPress={() => openCustomize(tpl)} accessibilityRole="button">
                <Text style={styles.cardTitle}>{tpl.title}</Text>
                <Text style={styles.cardBody} numberOfLines={2}>{tpl.description}</Text>
              </Pressable>
            ))
          ) : (yourBlasts ?? []).length === 0 ? (
            <Text style={styles.empty}>{t('blastYourEmpty')}</Text>
          ) : (
            (yourBlasts ?? []).map((b) => (
              <Pressable
                key={b.id}
                style={styles.card}
                onPress={() =>
                  setEditing({
                    template: b.source_template_id
                      ? (templates ?? []).find((tp) => tp.id === b.source_template_id) ?? null
                      : null,
                    title: b.title,
                    description: b.description,
                  })
                }
                accessibilityRole="button"
              >
                <Text style={styles.cardTitle}>{b.title}</Text>
                <Text style={styles.cardBody} numberOfLines={1}>{b.description}</Text>
              </Pressable>
            ))
          )}
        </ScrollView>
      )}

      {/* Customize modal (Basic/Pro) */}
      <Modal visible={editing != null} transparent animationType="slide" onRequestClose={() => setEditing(null)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>{t('blastCustomizeTitle')}</Text>
            <Text style={styles.label}>{t('blastTitleLabel')}</Text>
            <TextInput
              style={styles.input}
              value={editing?.title ?? ''}
              maxLength={80}
              onChangeText={(v) => setEditing((s) => (s ? { ...s, title: v } : s))}
            />
            <Text style={styles.label}>{t('blastDescLabel')}</Text>
            <TextInput
              style={[styles.input, styles.inputMulti]}
              value={editing?.description ?? ''}
              maxLength={1000}
              multiline
              onChangeText={(v) => setEditing((s) => (s ? { ...s, description: v } : s))}
            />
            <Text style={styles.label}>{t('blastSendToLabel')}</Text>
            <Text style={styles.readonly}>{t('blastSendToAll')}</Text>
            {channelRow}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <Pressable
              style={[styles.btn, styles.primaryBtn, busy && styles.btnDisabled]}
              disabled={busy}
              onPress={() => editing && submit(editing)}
              accessibilityRole="button"
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryLabel}>{t('blastSendCta')}</Text>}
            </Pressable>
            <Pressable style={[styles.btn, styles.secondaryBtn]} onPress={() => setEditing(null)} accessibilityRole="button">
              <Text style={styles.secondaryLabel}>{t('cancel')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F6FA' },
  center: { alignItems: 'center', justifyContent: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#fff' },
  back: { fontSize: 32, color: '#0B1F3A', lineHeight: 32, width: 32 },
  topTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: '#0B1F3A', textAlign: 'center' },
  content: { padding: 16, gap: 12 },
  error: { color: '#D7263D', fontSize: 14, fontWeight: '600', textAlign: 'center', paddingHorizontal: 16, paddingTop: 8 },

  tabs: { flexDirection: 'row', backgroundColor: '#EEF1F6', borderRadius: 10, padding: 3 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  tabOn: { backgroundColor: '#fff' },
  tabText: { fontSize: 14, fontWeight: '600', color: '#6B7685' },
  tabTextOn: { color: '#0B1F3A' },

  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, gap: 4 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#0B1F3A' },
  cardBody: { fontSize: 14, color: '#6B7685' },
  empty: { fontSize: 15, color: '#6B7685', textAlign: 'center', paddingVertical: 24 },

  label: { fontSize: 13, fontWeight: '700', color: '#8A95A5', textTransform: 'uppercase' },
  readonly: { fontSize: 15, color: '#0B1F3A', fontWeight: '600' },
  channelRow: { flexDirection: 'row', gap: 10 },
  channel: { flex: 1, minHeight: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderWidth: StyleSheet.hairlineWidth, borderColor: '#E6EAF0' },
  channelOn: { backgroundColor: '#0B7BFF', borderColor: '#0B7BFF' },
  channelText: { fontSize: 15, fontWeight: '600', color: '#0B1F3A' },
  channelTextOn: { color: '#fff' },

  input: { minHeight: 48, borderRadius: 12, backgroundColor: '#fff', borderWidth: StyleSheet.hairlineWidth, borderColor: '#E6EAF0', paddingHorizontal: 14, paddingTop: 12, fontSize: 16, color: '#0B1F3A' },
  inputMulti: { minHeight: 100, textAlignVertical: 'top' },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#F4F6FA', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, gap: 10, maxHeight: '90%' },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: '#0B1F3A' },

  sentBox: { paddingHorizontal: 32, alignItems: 'center', gap: 12 },
  sentTitle: { fontSize: 22, fontWeight: '700', color: '#0B1F3A' },
  sentBody: { fontSize: 16, color: '#6B7685', textAlign: 'center' },

  btn: { minHeight: 48, paddingHorizontal: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnDisabled: { opacity: 0.5 },
  primaryBtn: { backgroundColor: '#0B7BFF' },
  primaryLabel: { fontSize: 16, fontWeight: '700', color: '#fff' },
  secondaryBtn: { backgroundColor: '#F0F3F8' },
  secondaryLabel: { fontSize: 16, fontWeight: '600', color: '#0B1F3A' },
});
