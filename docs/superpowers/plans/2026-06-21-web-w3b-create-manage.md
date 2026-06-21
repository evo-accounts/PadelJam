# Web W3b — Create Group + Manage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group creation + the group-admin manage area (hub, settings, members, invite, seasons, archive) on web, mirroring the mobile screens, on the existing `@padel/api` backend.

**Architecture:** New client routes under `apps/web/src/app/(app)/app/community/[id]/group-create/` and `apps/web/src/app/(app)/app/group/[id]/manage/**`, plus extending the existing `group` i18n namespace and wiring the two "New group" entry points (W3a left them as placeholders). All data via existing group/community hooks; one direct `@padel/db` write for the new-group thumbnail (hooks-rule constraint).

**Tech Stack:** Next.js 16 App Router (client components), React 19, `@padel/api` (TanStack Query), `@padel/db`, shadcn/ui, i18next.

**Verified facts (confirm in source before relying):**
- `useCreateGroup().mutateAsync({ communityId, name, description, isPrivate, thumbnailPath? })` → returns the new group **uuid** (`create_group` RPC returns `data`). `CreateGroupInput`: `communityId(uuid)`, `name(1–80)`, `description?(≤2000)`, `isPrivate(default false)`, `thumbnailPath?`.
- `useUpdateGroup(id).mutate(patch)` — patch is `Partial<{ name; description: string|null; is_private: boolean; thumbnail_path: string|null }>` (snake_case), does `db.from('groups').update(patch).eq('id', id)`.
- `useGroup(id)` → groups row (`id, community_id, name, description, thumbnail_path, is_private, is_general, archived_at, created_by, created_at`).
- `useGroupMembers(id)` → `{ user_id, created_at?, profiles: {id, full_name, avatar_url}|null }[]`.
- `useGroupSeasons(id)` → `group_seasons[]` (`id, group_id, season_number, started_at, ended_at`) ordered `season_number` desc.
- `useCommunityMembers(communityId)` → `{ user_id, role, profiles: {id, full_name, avatar_url}|null }[]`.
- `useCanCreateGroup(communityId)` → query of a boolean entitlement (treat `data === true` as allowed; while loading, don't redirect).
- `useStartNewSeason(id).mutate()`; `useArchiveGroup()/useUnarchiveGroup().mutate({ groupId, communityId })`; `useRemoveGroupMember(id).mutate(userId)`; `useInviteToGroup(id).mutate(inviteeId)`; `useGroupRealtime(id)`.
- `useDb()` (from `@padel/api`, `packages/api/src/client.ts`) → the typed Supabase client (`useSession().client`).
- `uploadCommunityImage(file: File, id: string, bucket: 'community-thumbnails'|'community-covers')` → returns the storage `path` string.
- `useSession()` from `@padel/auth` → `{ session?.user.id }` (used elsewhere on web; confirm import path — `useSession` is re-exported from `@padel/auth`).
- shadcn present: `switch`, `textarea`, `alert-dialog`, `input`, `card`, `avatar`, `button`, `skeleton`, `label`, `select`. `GroupCard` already accepts `{ id, name, communityName?, memberCount?, thumbnailPath?, archived? }`.

---

## Task 1: Extend the `group` i18n namespace

**Files:**
- Modify: `apps/web/src/lib/i18n-web.ts` (the `webGroup` bundle — three locale blocks `en`, `pt-PT`, `pt-BR` — and nothing else; `registerWebGroupCopy` already wired in `Providers.tsx`).

- [ ] **Step 1: Add the new keys to all three locales**

In `apps/web/src/lib/i18n-web.ts`, locate the `webGroup` object. It has `en`, `pt-PT`, `pt-BR` sub-objects. Add the following keys to **each** locale block (English values shown; translate for pt-PT / pt-BR — reuse the tone of the existing community-namespace pt strings). Keep existing keys untouched.

English values to add:
```
createTitle: 'New group',
createCta: 'Create group',
thumbnailLabel: 'Thumbnail',
groupName: 'Name',
groupNamePlaceholder: 'Group name',
descriptionLabel: 'Description',
privateLabel: 'Private group',
privateHint: 'Private groups are invite-only.',
manageTitle: 'Manage group',
settingsRow: 'Settings',
membersRow: 'Members',
seasonsRow: 'Seasons',
save: 'Save',
saving: 'Saving…',
saveError: 'Could not save. Please try again.',
archive: 'Archive group',
unarchive: 'Unarchive group',
archivedNotice: 'This group is archived.',
inviteMembersCta: 'Invite members',
removeMemberCta: 'Remove',
removeMemberConfirm: 'Remove {{name}} from this group?',
invitedLabel: 'Invited',
inviteCta: 'Invite',
noOneToInvite: 'Everyone in this community is already a member.',
currentSeasonLabel: 'Current season',
seasonTag: 'Season {{number}}',
startSeasonCta: 'Start new season',
startSeasonConfirm: 'End season {{current}} and start season {{next}}? This cannot be undone.',
confirm: 'Confirm',
cancel: 'Cancel',
errorTitle: 'Something went wrong',
forbidden: 'You do not have permission to do this.',
sole_admin_must_add_another: 'Add another admin before leaving or removing this member.',
sole_owner_must_transfer: 'Transfer ownership before removing this member.',
not_a_member: 'That person is not a member.',
group_not_found: 'Group not found.',
groups_per_community: 'This community has reached its group limit.',
unknown_error: 'Something went wrong. Please try again.',
```
pt-PT suggestions (translate similarly for pt-BR): `createTitle: 'Novo grupo'`, `createCta: 'Criar grupo'`, `groupName: 'Nome'`, `groupNamePlaceholder: 'Nome do grupo'`, `descriptionLabel: 'Descrição'`, `privateLabel: 'Grupo privado'`, `privateHint: 'Os grupos privados são apenas por convite.'`, `manageTitle: 'Gerir grupo'`, `settingsRow: 'Definições'`, `membersRow: 'Membros'`, `seasonsRow: 'Épocas'`, `save: 'Guardar'`, `saving: 'A guardar…'`, `saveError: 'Não foi possível guardar. Tente novamente.'`, `archive: 'Arquivar grupo'`, `unarchive: 'Desarquivar grupo'`, `archivedNotice: 'Este grupo está arquivado.'`, `inviteMembersCta: 'Convidar membros'`, `removeMemberCta: 'Remover'`, `removeMemberConfirm: 'Remover {{name}} deste grupo?'`, `invitedLabel: 'Convidado'`, `inviteCta: 'Convidar'`, `noOneToInvite: 'Todos nesta comunidade já são membros.'`, `currentSeasonLabel: 'Época atual'`, `seasonTag: 'Época {{number}}'`, `startSeasonCta: 'Iniciar nova época'`, `startSeasonConfirm: 'Terminar a época {{current}} e iniciar a época {{next}}? Esta ação não pode ser anulada.'`, `confirm: 'Confirmar'`, `cancel: 'Cancelar'`, `errorTitle: 'Algo correu mal'`, `forbidden: 'Não tem permissão para fazer isto.'`, `sole_admin_must_add_another: 'Adicione outro administrador antes de sair ou remover este membro.'`, `sole_owner_must_transfer: 'Transfira a propriedade antes de remover este membro.'`, `not_a_member: 'Essa pessoa não é membro.'`, `group_not_found: 'Grupo não encontrado.'`, `groups_per_community: 'Esta comunidade atingiu o limite de grupos.'`, `unknown_error: 'Algo correu mal. Tente novamente.'`.
For pt-BR use the Brazilian variants (e.g. `'Definições'` → `'Configurações'`, `'A guardar…'` → `'Salvando…'`, `'Guardar'` → `'Salvar'`, `'Gerir grupo'` → `'Gerenciar grupo'`, `'Época'` → `'Temporada'`, `'anular'` → `'desfazer'`).

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: PASS (13/13 or current project count).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/i18n-web.ts
git commit -m "feat(web): extend group i18n for create + manage (W3b)"
```

---

## Task 2: Create-group route + wire the two entry points

**Files:**
- Create: `apps/web/src/app/(app)/app/community/[id]/group-create/page.tsx`
- Modify: `apps/web/src/app/(app)/app/groups/page.tsx` (add a **New group** affordance — but note: `/app/groups` has no single community context, so link it to `/app/community` discovery rather than a create route). 
- Modify: `apps/web/src/app/(app)/app/community/[id]/page.tsx` (add a **New group** button in the Groups tab, gated by `useCanCreateGroup(id)`).

- [ ] **Step 1: Create the create-group page**

Create `apps/web/src/app/(app)/app/community/[id]/group-create/page.tsx`. This mirrors the community manage/settings form pattern (object-URL preview, non-fatal thumbnail upload). The new-group thumbnail update uses a **direct `useDb()` write** because `useUpdateGroup(newId)` can't be called mid-handler (hooks rule).

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useT } from '@padel/i18n';
import { useCanCreateGroup, useCreateGroup, useDb } from '@padel/api';
import { uploadCommunityImage } from '@/lib/upload';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';

export default function GroupCreatePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t } = useT('group');
  const db = useDb();
  const canCreate = useCanCreateGroup(id);
  const create = useCreateGroup();

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Redirect if the entitlement check resolves to "not allowed".
  useEffect(() => {
    if (!canCreate.isLoading && canCreate.data === false) {
      router.replace(`/app/community/${id}`);
    }
  }, [canCreate.isLoading, canCreate.data, id, router]);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const onFileChange = (f: File | null) => {
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return f ? URL.createObjectURL(f) : null;
    });
    setFile(f);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const newId = (await create.mutateAsync({
        communityId: id,
        name: name.trim(),
        description: description.trim() || undefined,
        isPrivate,
      })) as string;
      if (file) {
        // Non-fatal: group already exists; thumbnail can be set later in Settings.
        try {
          const path = await uploadCommunityImage(file, newId, 'community-thumbnails');
          await db.from('groups').update({ thumbnail_path: path }).eq('id', newId);
        } catch {
          // ignore — thumbnail optional
        }
      }
      router.replace(`/app/group/${newId}`);
    } catch {
      setError(t('unknown_error'));
      setBusy(false);
    }
  };

  if (canCreate.isLoading) return <Skeleton className="m-6 h-40" />;
  if (canCreate.data === false) return null;

  return (
    <div className="p-6 max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">{t('createTitle')}</h1>
      <Card>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name">{t('groupName')}</Label>
              <Input
                id="name"
                value={name}
                placeholder={t('groupNamePlaceholder')}
                maxLength={80}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">{t('descriptionLabel')}</Label>
              <Textarea
                id="description"
                value={description}
                maxLength={2000}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <Label htmlFor="private">{t('privateLabel')}</Label>
                <p className="text-xs text-muted-foreground">{t('privateHint')}</p>
              </div>
              <Switch id="private" checked={isPrivate} onCheckedChange={setIsPrivate} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="thumbnail">{t('thumbnailLabel')}</Label>
              <input
                id="thumbnail"
                type="file"
                accept="image/*"
                onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
              />
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="" className="h-24 w-24 rounded object-cover" />
              ) : null}
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={busy || !name.trim()}>
              {busy ? t('saving') : t('createCta')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```
Note: `thumbnailLabel` is added to the `group` bundle in Task 1 (pt-PT/pt-BR `'Miniatura'`). It is consumed here and in the Task 3 settings form.

- [ ] **Step 2: Wire the community Groups-tab "New group" button**

In `apps/web/src/app/(app)/app/community/[id]/page.tsx`: the page already calls `useCommunityGroups(id)` and renders the `groups` `TabsContent`. Add `const canCreateGroup = useCanCreateGroup(id);` alongside the other hooks (unconditional, before any early return). Then inside the `<TabsContent value="groups" ...>`, render a **New group** link **above** the list when `canCreateGroup.data === true`:
```tsx
{canCreateGroup.data === true ? (
  <Button asChild variant="outline" className="self-start">
    <Link href={`/app/community/${id}/group-create`}>{t('newGroup')}</Link>
  </Button>
) : null}
```
Ensure `Link` (`next/link`) and `Button` are imported in that file (add if missing). `t` here is the `community` namespace instance on that page — the `newGroup` key lives in the `group` namespace, so use a dedicated `const { t: tg } = useT('group');` (add near the other `useT` call) and render `{tg('newGroup')}`.

- [ ] **Step 3: Wire the `/app/groups` "New group" affordance**

In `apps/web/src/app/(app)/app/groups/page.tsx`, add a header link next to the title. Since this page spans all communities (no single create target), link to community discovery:
```tsx
import Link from 'next/link';
import { Button } from '@/components/ui/button';
// ...in the header row, beside the <h1>:
<Button asChild variant="outline">
  <Link href="/app/community">{t('newGroup')}</Link>
</Button>
```
Wrap the existing `<h1>` and this button in a `<div className="flex items-center justify-between">`.

- [ ] **Step 4: Typecheck + build**

Run: `pnpm --filter web typecheck && pnpm --filter web build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/app/(app)/app/community/[id]/group-create/page.tsx" "apps/web/src/app/(app)/app/community/[id]/page.tsx" "apps/web/src/app/(app)/app/groups/page.tsx"
git commit -m "feat(web): create-group form + New-group entry points (W3b)"
```

---

## Task 3: Manage hub + settings

**Files:**
- Create: `apps/web/src/app/(app)/app/group/[id]/manage/page.tsx`
- Create: `apps/web/src/app/(app)/app/group/[id]/manage/settings/page.tsx`

- [ ] **Step 1: Create the manage hub**

Create `apps/web/src/app/(app)/app/group/[id]/manage/page.tsx`. Gate on `is_managing` from `useMyGroups()`. Links to Settings / Members / Seasons + Archive/Unarchive toggle. Mirrors the community manage hub.

```tsx
'use client';
import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useT } from '@padel/i18n';
import { useMyGroups, useGroup, useArchiveGroup, useUnarchiveGroup } from '@padel/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export default function GroupManageHubPage() {
  const { t } = useT('group');
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const mine = useMyGroups();
  const group = useGroup(id);
  const archive = useArchiveGroup();
  const unarchive = useUnarchiveGroup();

  const myRow = (mine.data ?? []).find((r) => r.group_id === id);
  const isManaging = !!myRow?.is_managing;
  useEffect(() => {
    if (!mine.isLoading && mine.data && !isManaging) router.replace(`/app/group/${id}`);
  }, [mine.isLoading, mine.data, isManaging, id, router]);

  if (mine.isLoading) return <Skeleton className="m-6 h-40" />;
  if (!isManaging) return null;

  const archived = !!group.data?.archived_at;
  const communityId = group.data?.community_id ?? '';
  const busy = archive.isPending || unarchive.isPending;

  const links = [
    { key: 'settings', href: `/app/group/${id}/manage/settings`, label: t('settingsRow') },
    { key: 'members', href: `/app/group/${id}/manage/members`, label: t('membersRow') },
    { key: 'seasons', href: `/app/group/${id}/manage/seasons`, label: t('seasonsRow') },
  ];

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">{t('manageTitle')}</h1>
      {archived ? <p className="text-sm text-muted-foreground">{t('archivedNotice')}</p> : null}
      <Card className="divide-y p-0">
        {links.map((l) => (
          <Link
            key={l.key}
            href={l.href}
            className="flex items-center justify-between px-6 py-4 text-sm font-medium hover:bg-muted/50"
          >
            {l.label}
          </Link>
        ))}
      </Card>
      <Button
        variant="outline"
        disabled={busy || !communityId}
        onClick={() =>
          archived
            ? unarchive.mutate({ groupId: id, communityId })
            : archive.mutate({ groupId: id, communityId })
        }
      >
        {archived ? t('unarchive') : t('archive')}
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: Create manage settings**

Create `apps/web/src/app/(app)/app/group/[id]/manage/settings/page.tsx`. Gate on `is_managing`; seed from `useGroup(id)`; save via `useUpdateGroup(id)` (snake_case). Mirrors the community settings form.

```tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useT } from '@padel/i18n';
import { useMyGroups, useGroup, useUpdateGroup } from '@padel/api';
import { uploadCommunityImage } from '@/lib/upload';
import { communityImageUrl } from '@/lib/community-images';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';

export default function GroupManageSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { t } = useT('group');
  const mine = useMyGroups();
  const group = useGroup(id);
  const update = useUpdateGroup(id);

  const myRow = (mine.data ?? []).find((r) => r.group_id === id);
  const isManaging = !!myRow?.is_managing;
  useEffect(() => {
    if (!mine.isLoading && mine.data && !isManaging) router.replace(`/app/group/${id}`);
  }, [mine.isLoading, mine.data, isManaging, id, router]);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !group.data) return;
    seeded.current = true;
    setName(group.data.name ?? '');
    setDescription(group.data.description ?? '');
    setIsPrivate(group.data.is_private ?? false);
  }, [group.data]);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const onFileChange = (f: File | null) => {
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return f ? URL.createObjectURL(f) : null;
    });
    setFile(f);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    let thumbnail_path: string | undefined;
    try {
      if (file) thumbnail_path = await uploadCommunityImage(file, id, 'community-thumbnails');
    } catch {
      // image upload failed; still save the text fields
    }
    try {
      await update.mutateAsync({
        name: name.trim(),
        description: description.trim() || null,
        is_private: isPrivate,
        ...(thumbnail_path ? { thumbnail_path } : {}),
      });
      router.push(`/app/group/${id}`);
    } catch {
      setError(t('saveError'));
      setBusy(false);
    }
  };

  if (mine.isLoading || group.isLoading) return <Skeleton className="m-6 h-40" />;
  if (!isManaging || !group.data) return null;

  const currentThumb = communityImageUrl(group.data.thumbnail_path, 'community-thumbnails');

  return (
    <div className="p-6 max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">{t('settingsRow')}</h1>
      <Card>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name">{t('groupName')}</Label>
              <Input id="name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">{t('descriptionLabel')}</Label>
              <Textarea
                id="description"
                value={description}
                maxLength={2000}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label htmlFor="private">{t('privateLabel')}</Label>
              <Switch id="private" checked={isPrivate} onCheckedChange={setIsPrivate} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="thumbnail">{t('thumbnailLabel')}</Label>
              <input
                id="thumbnail"
                type="file"
                accept="image/*"
                onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
              />
              {preview ?? currentThumb ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={preview ?? currentThumb ?? undefined}
                  alt=""
                  className="h-24 w-24 rounded object-cover"
                />
              ) : null}
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? t('saving') : t('save')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + build**

Run: `pnpm --filter web typecheck && pnpm --filter web build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/(app)/app/group/[id]/manage/page.tsx" "apps/web/src/app/(app)/app/group/[id]/manage/settings/page.tsx"
git commit -m "feat(web): group manage hub + settings + archive (W3b)"
```

---

## Task 4: Manage members + invite

**Files:**
- Create: `apps/web/src/app/(app)/app/group/[id]/manage/members/page.tsx`
- Create: `apps/web/src/app/(app)/app/group/[id]/manage/invite/page.tsx`

- [ ] **Step 1: Create the members management page**

Create `apps/web/src/app/(app)/app/group/[id]/manage/members/page.tsx`. List members (+ realtime), Invite link, per-row Remove (AlertDialog, hidden for self), known-error mapping.

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useT } from '@padel/i18n';
import { useSession } from '@padel/auth';
import {
  useMyGroups,
  useGroupMembers,
  useGroupRealtime,
  useRemoveGroupMember,
} from '@padel/api';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { avatarUrl } from '@/lib/upload';

const KNOWN = new Set([
  'forbidden',
  'sole_admin_must_add_another',
  'sole_owner_must_transfer',
  'not_a_member',
  'group_not_found',
]);

export default function GroupManageMembersPage() {
  const { t } = useT('group');
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const uid = useSession().session?.user.id;
  useGroupRealtime(id);
  const mine = useMyGroups();
  const members = useGroupMembers(id);
  const remove = useRemoveGroupMember(id);
  const [error, setError] = useState<string | null>(null);

  const myRow = (mine.data ?? []).find((r) => r.group_id === id);
  const isManaging = !!myRow?.is_managing;
  useEffect(() => {
    if (!mine.isLoading && mine.data && !isManaging) router.replace(`/app/group/${id}`);
  }, [mine.isLoading, mine.data, isManaging, id, router]);

  const onRemove = async (userId: string) => {
    setError(null);
    try {
      await remove.mutateAsync(userId);
    } catch (e) {
      const code = e instanceof Error ? e.message : 'unknown_error';
      setError(t(KNOWN.has(code) ? code : 'unknown_error'));
    }
  };

  if (mine.isLoading) return <Skeleton className="m-6 h-40" />;
  if (!isManaging) return null;

  const rows = members.data ?? [];

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t('membersRow')}</h1>
        <Button asChild variant="outline">
          <Link href={`/app/group/${id}/manage/invite`}>{t('inviteMembersCta')}</Link>
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {members.isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <Card className="divide-y p-0">
          {rows.map((m) => {
            const name = m.profiles?.full_name ?? '—';
            const initials = name.slice(0, 2).toUpperCase();
            return (
              <div key={m.user_id} className="flex items-center justify-between px-4 py-3">
                <Link
                  href={`/app/profile/${m.user_id}`}
                  className="flex min-w-0 items-center gap-3"
                >
                  <Avatar className="size-9">
                    <AvatarImage src={avatarUrl(m.profiles?.avatar_url) ?? undefined} />
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>
                  <span className="truncate text-sm font-medium">{name}</span>
                </Link>
                {m.user_id === uid ? null : (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" className="text-destructive">
                        {t('removeMemberCta')}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t('removeMemberConfirm', { name })}</AlertDialogTitle>
                        <AlertDialogDescription />
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                        <AlertDialogAction onClick={() => onRemove(m.user_id)}>
                          {t('removeMemberCta')}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
```
Note: `avatarUrl(path)` is exported from `@/lib/upload` and returns the public avatars-bucket URL (or null). This `avatarUrl(m.profiles?.avatar_url)` usage matches `apps/web/src/components/group/GroupMembersList.tsx` (W3a) exactly — keep it consistent.

- [ ] **Step 2: Create the invite page**

Create `apps/web/src/app/(app)/app/group/[id]/manage/invite/page.tsx`. List community members not already in the group; per-row Invite.

```tsx
'use client';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useT } from '@padel/i18n';
import {
  useMyGroups,
  useGroup,
  useGroupMembers,
  useCommunityMembers,
  useInviteToGroup,
} from '@padel/api';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { avatarUrl } from '@/lib/upload';

export default function GroupInvitePage() {
  const { t } = useT('group');
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const mine = useMyGroups();
  const group = useGroup(id);
  const groupMembers = useGroupMembers(id);
  const communityId = group.data?.community_id ?? '';
  const communityMembers = useCommunityMembers(communityId);
  const invite = useInviteToGroup(id);
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const myRow = (mine.data ?? []).find((r) => r.group_id === id);
  const isManaging = !!myRow?.is_managing;
  useEffect(() => {
    if (!mine.isLoading && mine.data && !isManaging) router.replace(`/app/group/${id}`);
  }, [mine.isLoading, mine.data, isManaging, id, router]);

  const candidates = useMemo(() => {
    const memberIds = new Set((groupMembers.data ?? []).map((m) => m.user_id));
    return (communityMembers.data ?? []).filter((m) => !memberIds.has(m.user_id));
  }, [communityMembers.data, groupMembers.data]);

  const onInvite = async (userId: string) => {
    setError(null);
    try {
      await invite.mutateAsync(userId);
      setInvited((prev) => new Set(prev).add(userId));
    } catch (e) {
      const code = e instanceof Error ? e.message : 'unknown_error';
      setError(t(['forbidden', 'not_a_member', 'group_not_found'].includes(code) ? code : 'unknown_error'));
    }
  };

  if (mine.isLoading) return <Skeleton className="m-6 h-40" />;
  if (!isManaging) return null;

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t('inviteMembersCta')}</h1>
        <Button asChild variant="ghost">
          <Link href={`/app/group/${id}/manage/members`}>{t('membersRow')}</Link>
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {communityMembers.isLoading || groupMembers.isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : candidates.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('noOneToInvite')}</p>
      ) : (
        <Card className="divide-y p-0">
          {candidates.map((m) => {
            const name = m.profiles?.full_name ?? '—';
            const initials = name.slice(0, 2).toUpperCase();
            const done = invited.has(m.user_id);
            return (
              <div key={m.user_id} className="flex items-center justify-between px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar className="size-9">
                    <AvatarImage src={avatarUrl(m.profiles?.avatar_url) ?? undefined} />
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>
                  <span className="truncate text-sm font-medium">{name}</span>
                </div>
                <Button size="sm" variant="outline" disabled={done} onClick={() => onInvite(m.user_id)}>
                  {done ? t('invitedLabel') : t('inviteCta')}
                </Button>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + build**

Run: `pnpm --filter web typecheck && pnpm --filter web build`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/src/app/(app)/app/group/[id]/manage/members/page.tsx" "apps/web/src/app/(app)/app/group/[id]/manage/invite/page.tsx"
git commit -m "feat(web): group manage members + invite (W3b)"
```

---

## Task 5: Manage seasons

**Files:**
- Create: `apps/web/src/app/(app)/app/group/[id]/manage/seasons/page.tsx`

- [ ] **Step 1: Create the seasons management page**

Create `apps/web/src/app/(app)/app/group/[id]/manage/seasons/page.tsx`. Current-season card, Start-new-season (AlertDialog), previous-seasons list. Archive lives on the hub (not duplicated here).

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useT } from '@padel/i18n';
import { useMyGroups, useGroupSeasons, useStartNewSeason } from '@padel/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const KNOWN = new Set(['forbidden', 'not_a_member', 'group_not_found']);

export default function GroupManageSeasonsPage() {
  const { t } = useT('group');
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const mine = useMyGroups();
  const seasons = useGroupSeasons(id);
  const startSeason = useStartNewSeason(id);
  const [error, setError] = useState<string | null>(null);

  const myRow = (mine.data ?? []).find((r) => r.group_id === id);
  const isManaging = !!myRow?.is_managing;
  useEffect(() => {
    if (!mine.isLoading && mine.data && !isManaging) router.replace(`/app/group/${id}`);
  }, [mine.isLoading, mine.data, isManaging, id, router]);

  const current = (seasons.data ?? []).find((s) => s.ended_at == null);
  const previous = (seasons.data ?? []).filter((s) => s.ended_at != null);
  const currentNumber = current?.season_number ?? 0;

  const onStart = async () => {
    setError(null);
    try {
      await startSeason.mutateAsync();
    } catch (e) {
      const code = e instanceof Error ? e.message : 'unknown_error';
      setError(t(KNOWN.has(code) ? code : 'unknown_error'));
    }
  };

  if (mine.isLoading) return <Skeleton className="m-6 h-40" />;
  if (!isManaging) return null;

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">{t('seasonsRow')}</h1>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">{t('currentSeasonLabel')}</p>
        <Card>
          <CardContent className="py-4">
            {current ? t('seasonTag', { number: current.season_number }) : '—'}
          </CardContent>
        </Card>
      </div>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button disabled={startSeason.isPending}>{t('startSeasonCta')}</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('startSeasonCta')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('startSeasonConfirm', { current: currentNumber, next: currentNumber + 1 })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={onStart}>{t('confirm')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {previous.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">{t('previousSeasons')}</p>
          <Card className="divide-y p-0">
            {previous.map((s) => (
              <div key={s.id} className="px-4 py-3 text-sm">
                {t('seasonTag', { number: s.season_number })}
              </div>
            ))}
          </Card>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + build**

Run: `pnpm --filter web typecheck && pnpm --filter web build`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/src/app/(app)/app/group/[id]/manage/seasons/page.tsx"
git commit -m "feat(web): group manage seasons + start-new-season (W3b)"
```

---

## Task 6: End-to-end verification (browser)

No code. `pnpm --filter web dev` against local Supabase; headless Chrome / browser as a community owner/admin.

- [ ] **Step 1:** `pnpm --filter web typecheck && pnpm --filter web build` → PASS.
- [ ] **Step 2:** Community detail → **Groups** tab → **New group** → create with a name + thumbnail → redirected to the new group detail, thumbnail visible, you're a member + manager.
- [ ] **Step 3:** Group detail → **Manage** → hub renders (Settings/Members/Seasons + Archive). Settings → change name + privacy + re-upload thumbnail → Save → reflected on the group detail.
- [ ] **Step 4:** Members → Remove a non-self member (confirm dialog); known errors (e.g. sole-admin) surface inline. **Invite members** → a community member not in the group appears → Invite → row shows "Invited"; the member then appears in the members list.
- [ ] **Step 5:** Seasons → **Start new season** (confirm) → current season number increments, the prior season moves to "previous".
- [ ] **Step 6:** Hub → **Archive group** → group detail shows the archived badge; **Unarchive** reverts. A non-admin visiting `/app/group/[id]/manage` or `/app/community/[id]/group-create` is redirected.

---

## Verification (summary)
Per-task typecheck; build after Tasks 2–5; browser smoke (Task 6). Finish via superpowers:finishing-a-development-branch.

## Out of scope
Accept group invitation UI (W6); `add_group_admins` UI; group events (W4); transfer-group-ownership; cross-community discovery.
