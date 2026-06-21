'use client';
import { useT } from '@padel/i18n';
import { useMyGroups } from '@padel/api';
import { GroupCard } from '@/components/group/GroupCard';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import type { MyGroup } from '@padel/api';

export default function GroupsPage() {
  const { t } = useT('group');
  const mine = useMyGroups();
  const rows = mine.data ?? [];

  const renderList = (list: MyGroup[]) => {
    if (mine.isLoading) {
      return <Skeleton className="h-24 w-full" />;
    }
    if (list.length === 0) {
      return <p className="text-sm text-muted-foreground">{t('emptyGroups')}</p>;
    }
    return list.map((r) => (
      <GroupCard
        key={r.group_id}
        group={{
          id: r.group_id,
          name: r.name,
          communityName: r.community_name,
          memberCount: r.member_count,
        }}
      />
    ));
  };

  return (
    <div className="flex flex-col gap-4 p-6">
      <h1 className="text-2xl font-semibold">{t('title')}</h1>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">{t('all')}</TabsTrigger>
          <TabsTrigger value="managing">{t('managing')}</TabsTrigger>
          <TabsTrigger value="participating">{t('participating')}</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="flex flex-col gap-3 pt-4">
          {renderList(rows)}
        </TabsContent>

        <TabsContent value="managing" className="flex flex-col gap-3 pt-4">
          {renderList(rows.filter((r) => r.is_managing))}
        </TabsContent>

        <TabsContent value="participating" className="flex flex-col gap-3 pt-4">
          {renderList(rows.filter((r) => !r.is_managing))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
