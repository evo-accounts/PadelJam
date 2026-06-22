'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import type { ChannelFilters, ChannelOptions, ChannelSort } from 'stream-chat';
import {
  Channel,
  ChannelList,
  MessageComposer,
  MessageList,
  Thread,
  Window,
  useChatContext,
} from 'stream-chat-react';
import { useStreamToken } from '@padel/api';
import { useSession } from '@padel/auth';
import { useT } from '@padel/i18n';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

function ActiveChannelSetter({ cid }: { cid: string }) {
  const { client, setActiveChannel } = useChatContext();
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [type, id] = cid.split(':');
      if (!type || !id) return;
      const ch = client.channel(type, id);
      await ch.watch();
      if (!cancelled) setActiveChannel(ch);
    })();
    return () => {
      cancelled = true;
    };
  }, [cid, client, setActiveChannel]);
  return null;
}

function ConversationPane() {
  const { t } = useT('chat');
  const { channel } = useChatContext();

  if (!channel) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <p className="text-sm text-muted-foreground">{t('selectConversation')}</p>
      </div>
    );
  }

  return (
    <Channel>
      <Window>
        <MessageList />
        <MessageComposer />
      </Window>
      <Thread />
    </Channel>
  );
}

export function ChatShell({ activeCid }: { activeCid?: string }) {
  const { t } = useT('chat');
  const uid = useSession().session?.user.id;
  const tokenQ = useStreamToken();

  if (tokenQ.isError) {
    return (
      <div className="flex flex-col items-start gap-3 p-6">
        <p className="text-sm text-muted-foreground">{t('chatUnavailable')}</p>
        <Button variant="outline" onClick={() => void tokenQ.refetch()}>
          {t('retry')}
        </Button>
      </div>
    );
  }
  if (!uid || !tokenQ.data) return <Skeleton className="m-6 h-[70vh]" />;

  const filters: ChannelFilters = { type: 'messaging', members: { $in: [uid] } };
  const sort: ChannelSort = { last_message_at: -1 };
  const options: ChannelOptions = { state: true, watch: true, presence: true };

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <div className="flex items-center justify-between border-b p-3">
        <h1 className="text-lg font-semibold">{t('title')}</h1>
        <Button asChild size="sm">
          <Link href="/app/chat/new">{t('newMessage')}</Link>
        </Button>
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-[320px_1fr]">
        <div className="min-h-0 overflow-y-auto border-r">
          <ChannelList filters={filters} sort={sort} options={options} />
        </div>
        <div className="min-h-0">
          {activeCid ? <ActiveChannelSetter cid={activeCid} /> : null}
          <ConversationPane />
        </div>
      </div>
    </div>
  );
}
