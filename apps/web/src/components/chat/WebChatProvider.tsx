'use client';
import type { PropsWithChildren } from 'react';
import { Chat } from 'stream-chat-react';
import { useSession } from '@padel/auth';
import { streamClient } from '@/lib/streamClient';
import 'stream-chat-react/dist/css/index.css';

/**
 * The stream-chat-react context for the /app/chat pages. The connection itself is made once for
 * the whole app by `StreamConnection` in the app layout.
 */
export function WebChatProvider({ children }: PropsWithChildren) {
  const uid = useSession().session?.user.id;
  if (!uid) return <>{children}</>;
  return <Chat client={streamClient}>{children}</Chat>;
}
