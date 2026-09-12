import {
  useArchiveCommunity,
  useCommunity,
  useCommunityMembers,
  useCommunityRequests,
  useLeaveCommunity,
  useTransferOwnership,
} from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { avatarUrl } from '@/lib/community-images';
import { colors, palette } from '../../../../theme';
import { Avatar, BottomSheet, SheetRow, TopBar, useBanner, useConfirm } from '../../../../components/ui';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type Member = {
  user_id: string;
  role: string;
  profiles: { id: string; full_name: string | null; avatar_url: string | null } | null;
};

export default function ManageIndexScreen() {
  const { t } = useT('community');
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const uid = useSession().session?.user.id;

  const { data: community } = useCommunity(id);
  const { data: members } = useCommunityMembers(id);
  const { data: requests } = useCommunityRequests(id);

  const archive = useArchiveCommunity(id);
  const transfer = useTransferOwnership(id);
  const leave = useLeaveCommunity();
  const confirm = useConfirm();
  const banner = useBanner();

  const [transferOpen, setTransferOpen] = useState(false);

  const myRole = (members as Member[] | undefined)?.find((m) => m.user_id === uid)?.role;
  const isOwner = myRole === 'owner';
  const isArchived = !!community?.archived_at;
  const pendingCount = requests?.length ?? 0;

  const err = (e: unknown) => {
    const code = e instanceof Error ? e.message : 'unknown_error';
    banner.show(t(code, { defaultValue: t('unknown_error') }));
  };

  const onArchive = async () => {
    const archiving = !isArchived;
    const ok = await confirm({
      title: archiving ? t('archiveConfirmTitle') : t('unarchiveConfirmTitle'),
      body: archiving ? t('archiveConfirmBody') : t('unarchiveConfirmBody'),
      confirmLabel: archiving ? t('archive') : t('unarchive'),
      cancelLabel: t('cancel'),
      destructive: archiving,
    });
    if (!ok) return;
    try {
      const groupCount = await archive.mutateAsync(archiving);
      banner.show(
        `${t(archiving ? 'archivedTitle' : 'unarchivedTitle')} ${t('archiveResult', { count: (groupCount as number) ?? 0 })}`,
        'success',
      );
    } catch (e) {
      err(e);
    }
  };

  const onTransfer = async (newOwnerId: string) => {
    try {
      await transfer.mutateAsync(newOwnerId);
      banner.show(t('transferDoneBody'), 'success');
    } catch (e) {
      err(e);
    }
  };

  const onPickTransfer = async (member: Member) => {
    const ok = await confirm({
      title: t('transferConfirmTitle'),
      body: t('transferConfirmBody', { name: member.profiles?.full_name ?? '—' }),
      confirmLabel: t('transferOwnership'),
      cancelLabel: t('cancel'),
    });
    if (!ok) return;
    setTransferOpen(false);
    await onTransfer(member.user_id);
  };

  const onLeave = async () => {
    const ok = await confirm({
      title: t('leaveConfirmTitle'),
      body: t('leaveConfirmBody'),
      confirmLabel: t('leave'),
      cancelLabel: t('cancel'),
      destructive: true,
    });
    if (!ok) return;
    try {
      await leave.mutateAsync(id);
      // Pop the whole community stack; the user is no longer a member.
      router.dismissAll();
      router.replace('/');
    } catch (e) {
      if (e instanceof Error && e.message === 'transfer_ownership_first') {
        banner.show(t('transfer_ownership_first'));
      } else {
        err(e);
      }
    }
  };

  const showRequests = community?.privacy === 'request_to_join';
  const otherMembers = (members as Member[] | undefined)?.filter((m) => m.user_id !== uid) ?? [];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar title={t('manageTitle')} onBack={() => router.back()} backLabel={t('back')} />
      <ScrollView contentContainerStyle={styles.inner}>
        <Section title={t('manageGroupCommunity')}>
          <NavRow label={t('manageSettings')} onPress={() => router.push(`/community/${id}/manage/settings`)} />
          <NavRow label={t('managePermissions')} onPress={() => router.push(`/community/${id}/manage/permissions`)} />
        </Section>

        <Section title={t('manageGroupPeople')}>
          <NavRow label={t('manageMembers')} onPress={() => router.push(`/community/${id}/manage/members`)} />
          {showRequests ? (
            <NavRow
              label={t('manageRequests')}
              badge={pendingCount}
              onPress={() => router.push(`/community/${id}/manage/requests`)}
            />
          ) : null}
          <NavRow label={t('manageInvite')} onPress={() => router.push(`/community/${id}/manage/invite`)} />
        </Section>

        <Section title={t('manageGroupAdvanced')}>
          <ActionRow
            label={isArchived ? t('unarchive') : t('archive')}
            pending={archive.isPending}
            onPress={onArchive}
          />
          {isOwner ? (
            <ActionRow
              label={t('transferOwnership')}
              pending={transfer.isPending}
              onPress={() => setTransferOpen(true)}
            />
          ) : null}
          <ActionRow
            label={t('leave')}
            destructive
            pending={leave.isPending}
            onPress={onLeave}
          />
        </Section>
      </ScrollView>

      <BottomSheet
        visible={transferOpen}
        onClose={() => setTransferOpen(false)}
        title={t('transferPickTitle')}
        testID="transfer-ownership-sheet"
      >
        {otherMembers.length === 0 ? (
          <Text style={styles.transferEmpty}>{t('transferNoMembers')}</Text>
        ) : (
          otherMembers.map((m) => (
            <SheetRow
              key={m.user_id}
              label={m.profiles?.full_name ?? '—'}
              leading={
                <Avatar
                  name={m.profiles?.full_name}
                  uri={avatarUrl(m.profiles?.avatar_url)}
                  colourKey={m.user_id}
                  size="sm"
                />
              }
              onPress={() => onPickTransfer(m)}
              testID={`transfer-row-${m.user_id}`}
            />
          ))
        )}
      </BottomSheet>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function NavRow({ label, badge, onPress }: { label: string; badge?: number; onPress: () => void }) {
  return (
    <Pressable style={styles.row} onPress={onPress} accessibilityRole="button">
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowRight}>
        {badge && badge > 0 ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        ) : null}
        <Text style={styles.chevron}>›</Text>
      </View>
    </Pressable>
  );
}

function ActionRow({
  label,
  destructive,
  pending,
  onPress,
}: {
  label: string;
  destructive?: boolean;
  pending?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.row} onPress={onPress} disabled={pending} accessibilityRole="button">
      <Text style={[styles.rowLabel, destructive && styles.destructive]}>{label}</Text>
      {pending ? <ActivityIndicator color={colors.foreground} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  inner: { padding: 16, gap: 8 },
  section: { marginBottom: 12 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: palette.slate[400],
    textTransform: 'uppercase',
    marginBottom: 8,
    marginLeft: 4,
  },
  card: { backgroundColor: colors.card, borderRadius: 12, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowLabel: { fontSize: 16, color: colors.foreground, fontWeight: '500' },
  destructive: { color: colors.destructive },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chevron: { fontSize: 22, color: palette.slate[400] },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: colors.card, fontSize: 12, fontWeight: '700' },
  transferEmpty: { fontSize: 15, color: colors.mutedForeground, paddingVertical: 16 },
});
