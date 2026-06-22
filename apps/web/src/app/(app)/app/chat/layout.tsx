'use client';
import type { ReactNode } from 'react';
import { WebChatProvider } from '@/components/chat/WebChatProvider';

export default function ChatLayout({ children }: { children: ReactNode }) {
  return <WebChatProvider>{children}</WebChatProvider>;
}
