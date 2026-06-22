'use client';
import { useParams } from 'next/navigation';
import { ChatShell } from '@/components/chat/ChatShell';

export default function ChatThreadPage() {
  const { cid } = useParams<{ cid: string }>();
  return <ChatShell activeCid={decodeURIComponent(cid)} />;
}
