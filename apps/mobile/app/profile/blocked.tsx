/**
 * Blocked users (UX-SET-06).
 *
 * New. You could block someone from their profile and then never see or undo it — `useUnblock`
 * existed in `packages/api` and was imported by nothing.
 *
 * The list cannot read `profiles`: the read policy (migration 0055) hides a row when a block
 * exists in EITHER direction, so the blocker cannot see the person they blocked any more than the
 * other way round. `list_my_blocks` (migration 0102) is a security-definer function scoped to
 * `blocker_id = auth.uid()` that returns exactly the name and avatar these rows render.
 *
 * "When there are no blocked users, hide the search input and show the empty state" — a filter
 * over nothing is a control that cannot do anything, and the audit is explicit about it.
 */
import { useMyBlocks, useUnblock } from '@padel/api';
import { useT } from '@padel/i18n';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { avatarUrl } from '@/lib/community-images';
import { colors, space } from '../../theme';
import {
  Avatar,
  Button,
  EmptyState,
  ListRow,
  Loading,
  SearchInput,
  TopBar,
  emptyIcon,
  listEmptyContent,
} from '../../components/ui';

export default function BlockedUsersScreen() {
  const { t } = useT('profile');
  const router = useRouter();
  const [search, setSearch] = useState('');
  const query = useMyBlocks(search);
  const unblock = useUnblock();
  const rows = query.data ?? [];

  // Gate the search on whether there are blocks AT ALL, not on the current result — otherwise
  // typing something that matches nothing would remove the box you were typing into.
  const hasAny = search.trim().length > 0 || rows.length > 0;

  if (query.isLoading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <TopBar variant="nav" title={t('blockedTitle')} onBack={() => router.back()} />
        <Loading testID="blocked-loading" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TopBar variant="nav" title={t('blockedTitle')} onBack={() => router.back()} />
      {hasAny ? (
        <SearchInput
          containerStyle={styles.search}
          value={search}
          onChangeText={setSearch}
          placeholder={t('searchPlaceholder')}
          testID="blocked-search"
        />
      ) : null}
      <FlashList
        data={rows}
        keyExtractor={(it) => it.id}
        contentContainerStyle={[{ padding: space[4] }, listEmptyContent]}
        ItemSeparatorComponent={() => <View style={{ height: space[2] }} />}
        ListEmptyComponent={
          query.isError ? (
            <EmptyState
              fill
              tone="error"
              title={t('loadError')}
              action={{ label: t('retry', { ns: 'common' }), onPress: () => void query.refetch() }}
              testID="error-blocked"
            />
          ) : search.trim().length > 0 ? (
            // A search that matched nothing is NOT an empty blocked list. Saying "you haven't
            // blocked anyone" to someone who has, and is looking at the search box they typed
            // into, tells them something false about their own account.
            <EmptyState fill icon={emptyIcon('magnifyingglass')} title={t('blockedNoResults')} testID="empty-blocked-search" />
          ) : (
            // No CTA: the audit says none is needed, and there is nothing useful to offer —
            // "go and block someone" is not an action to suggest.
            <EmptyState
              fill
              icon={emptyIcon('person.2')}
              title={t('blockedEmpty')}
              body={t('blockedEmptyBody')}
              testID="empty-blocked"
            />
          )
        }
        renderItem={({ item }) => (
          <ListRow
            variant="card"
            title={item.full_name}
            leading={
              <Avatar uri={avatarUrl(item.avatar_url)} name={item.full_name} colourKey={item.id} size="md" />
            }
            trailing={
              <Button
                size="sm"
                variant="outline"
                label={t('unblock')}
                loading={unblock.isPending}
                // Removes the row immediately: `useUnblock` invalidates, and this list is the
                // query it invalidates, so the person is gone from it as soon as the write lands.
                onPress={() => unblock.mutate(item.id)}
                testID={`unblock-${item.id}`}
              />
            }
            // Tapping the row does nothing on purpose: the profile behind it is still hidden by
            // row-level security until the unblock lands, so it would only reach a dead end.
            testID={`blocked-${item.id}`}
          />
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  search: { margin: space[4], marginBottom: 0 },
});
