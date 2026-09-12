import { useCommunityMembers, useDb, useInviteMembers } from '@padel/api';
import { useT } from '@padel/i18n';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { avatarUrl } from '@/lib/community-images';
import { colors, palette } from '../../../../theme';
import { Chip, TopBar, useBanner, useConfirm } from '../../../../components/ui';

type Profile = { id: string; full_name: string | null; avatar_url: string | null };
type Group = { id: string; name: string; is_general: boolean };

export default function ManageInviteScreen() {
  const { t } = useT('community');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useDb();

  const { data: members } = useCommunityMembers(id);
  const invite = useInviteMembers(id);
  const confirm = useConfirm();
  const banner = useBanner();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Record<string, Profile>>({});

  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<Record<string, boolean>>({});

  const memberIds = useMemo(
    () => new Set((members ?? []).map((m) => m.user_id)),
    [members],
  );

  // Load the community's active groups for the picker.
  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await db
        .from('groups')
        .select('id, name, is_general')
        .eq('community_id', id)
        .is('archived_at', null)
        .returns<Group[]>();
      if (!active || error) return;
      const list = data ?? [];
      setGroups(list);
      // Default-select the general group(s) so a single-group community needs no picking.
      const general: Record<string, boolean> = {};
      for (const g of list) if (g.is_general) general[g.id] = true;
      setSelectedGroups(general);
    })();
    return () => {
      active = false;
    };
  }, [db, id]);

  // Debounced people search, excluding existing members from the visible list.
  useEffect(() => {
    const q = query.trim();
    if (q.length === 0) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const handle = setTimeout(async () => {
      const { data, error } = await db
        .from('profiles')
        .select('id, full_name, avatar_url')
        .ilike('full_name', `%${q}%`)
        .limit(20)
        .returns<Profile[]>();
      if (!error) {
        setResults((data ?? []).filter((p) => !memberIds.has(p.id)));
      }
      setSearching(false);
    }, 300);
    return () => clearTimeout(handle);
  }, [query, db, memberIds]);

  const toggleSelect = (p: Profile) => {
    setSelected((s) => {
      const next = { ...s };
      if (next[p.id]) delete next[p.id];
      else next[p.id] = p;
      return next;
    });
  };

  const toggleGroup = (gid: string) => {
    setSelectedGroups((s) => ({ ...s, [gid]: !s[gid] }));
  };

  const selectedList = Object.values(selected);
  const dirty = selectedList.length > 0;
  const hasMultipleGroups = groups.length > 1;
  const chosenGroupIds = Object.entries(selectedGroups)
    .filter(([, v]) => v)
    .map(([k]) => k);

  const doInvite = async () => {
    try {
      await invite.mutateAsync({
        inviteeIds: selectedList.map((p) => p.id),
        groupIds: chosenGroupIds,
      });
      banner.show(t('inviteSentBody'), 'success');
      router.back();
    } catch (e) {
      const code = e instanceof Error ? e.message : 'unknown_error';
      banner.show(t(code, { defaultValue: t('unknown_error') }));
    }
  };

  const onConfirm = async () => {
    if (selectedList.length === 0) return;

    if (hasMultipleGroups && chosenGroupIds.length === 0) {
      banner.show(t('inviteGroupRequired'));
      return;
    }

    const body = hasMultipleGroups ? t('inviteConfirmGroups') : t('inviteConfirmGeneral');
    const ok = await confirm({
      title: t('inviteConfirmTitle'),
      body,
      confirmLabel: t('invite'),
      cancelLabel: t('cancel'),
    });
    if (ok) await doInvite();
  };

  return (
    <SafeAreaView style={[styles.container, { paddingBottom: insets.bottom }]} edges={['top']}>
      <TopBar variant="edit" title={t('manageInvite')} onClose={() => router.back()} dirty={dirty} />
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.search}
          value={query}
          onChangeText={setQuery}
          placeholder={t('inviteSearchPlaceholder')}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {selectedList.length > 0 ? (
        <View style={styles.chips}>
          {selectedList.map((p) => (
            <Chip
              key={p.id}
              label={`${p.full_name ?? '—'} ✕`}
              selected
              onPress={() => toggleSelect(p)}
            />
          ))}
        </View>
      ) : null}

      <FlatList
        data={results}
        keyExtractor={(p) => p.id}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          searching ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.foreground} />
            </View>
          ) : query.trim().length > 0 ? (
            <View style={styles.center}>
              <Text style={styles.empty}>{t('inviteNoResults')}</Text>
            </View>
          ) : (
            <View style={styles.center}>
              <Text style={styles.empty}>{t('inviteSearchHint')}</Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const name = item.full_name ?? '—';
          const url = avatarUrl(item.avatar_url);
          const isSelected = !!selected[item.id];
          return (
            <Pressable style={styles.personRow} onPress={() => toggleSelect(item)}>
              {url ? (
                <Image source={{ uri: url }} style={styles.avatar} contentFit="cover" transition={120} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarInitial}>{(name.charAt(0) || '?').toUpperCase()}</Text>
                </View>
              )}
              <Text style={styles.name} numberOfLines={1}>
                {name}
              </Text>
              <View style={[styles.check, isSelected && styles.checkOn]}>
                {isSelected ? <Text style={styles.checkMark}>✓</Text> : null}
              </View>
            </Pressable>
          );
        }}
        ListFooterComponent={
          hasMultipleGroups ? (
            <View style={styles.groupsSection}>
              <Text style={styles.groupsTitle}>{t('inviteGroupsTitle')}</Text>
              {groups.map((g) => {
                const on = !!selectedGroups[g.id];
                const label = g.is_general ? t('generalGroup') : g.name;
                return (
                  <Pressable key={g.id} style={styles.groupRow} onPress={() => toggleGroup(g.id)}>
                    <Text style={styles.groupLabel}>{label}</Text>
                    <View style={[styles.check, on && styles.checkOn]}>
                      {on ? <Text style={styles.checkMark}>✓</Text> : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ) : null
        }
      />

      <Pressable
        style={[
          styles.cta,
          (selectedList.length === 0 || invite.isPending) && styles.ctaDisabled,
        ]}
        onPress={onConfirm}
        disabled={selectedList.length === 0 || invite.isPending}
        accessibilityRole="button"
      >
        {invite.isPending ? (
          <ActivityIndicator color={colors.card} />
        ) : (
          <Text style={styles.ctaText}>
            {t('inviteCta', { count: selectedList.length })}
          </Text>
        )}
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.card },
  searchWrap: { padding: 16 },
  search: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  chip: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    maxWidth: 180,
  },
  center: { alignItems: 'center', justifyContent: 'center', padding: 32 },
  empty: { fontSize: 15, color: colors.mutedForeground, textAlign: 'center' },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.muted },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  avatarInitial: { color: colors.card, fontSize: 16, fontWeight: '700' },
  name: { flex: 1, fontSize: 16, color: colors.foreground, fontWeight: '500' },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  checkMark: { color: colors.card, fontSize: 14, fontWeight: '700' },
  groupsSection: { padding: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  groupsTitle: { fontSize: 13, fontWeight: '700', color: palette.slate[400], textTransform: 'uppercase', marginBottom: 8 },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  groupLabel: { fontSize: 16, color: colors.foreground },
  cta: {
    backgroundColor: colors.primary,
    margin: 16,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  ctaDisabled: { opacity: 0.5 },
  ctaText: { color: colors.card, fontSize: 16, fontWeight: '700' },
});
