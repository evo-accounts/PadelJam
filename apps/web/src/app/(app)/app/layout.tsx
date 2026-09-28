'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useT } from '@padel/i18n';
import {
  CalendarDays,
  Compass,
  Home,
  MessageCircle,
  User,
  Users,
  type LucideIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { StreamConnection } from '@/components/chat/StreamConnection';
import { Toaster } from '@/components/ui/toaster';
import ProfileDropdown from '@/components/shadcn-studio/blocks/dropdown-profile';

type NavItem = { key: string; href: string; labelKey: string; icon: LucideIcon };

const APP_NAV: NavItem[] = [
  { key: 'home', href: '/app', labelKey: 'nav.home', icon: Home },
  { key: 'events', href: '/app/events', labelKey: 'nav.events', icon: CalendarDays },
  { key: 'chat', href: '/app/chat', labelKey: 'nav.messages', icon: MessageCircle },
  { key: 'explore', href: '/app/explore', labelKey: 'nav.explore', icon: Compass },
  { key: 'community', href: '/app/community', labelKey: 'nav.community', icon: Users },
  { key: 'profile', href: '/app/profile', labelKey: 'nav.profile', icon: User },
];

const isActive = (pathname: string, href: string) =>
  href === '/app' ? pathname === '/app' : pathname.startsWith(href);

export default function AppLayout({ children }: { children: ReactNode }) {
  const { t } = useT('app');
  const pathname = usePathname() ?? '/app';

  return (
    <SidebarProvider>
      <StreamConnection />
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild>
                <Link href="/app">
                  <span className="text-lg font-semibold">Padel Jam</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {APP_NAV.map((item) => (
                  <SidebarMenuItem key={item.key}>
                    <SidebarMenuButton asChild isActive={isActive(pathname, item.href)} tooltip={t(item.labelKey)}>
                      <Link href={item.href}>
                        <item.icon />
                        <span>{t(item.labelKey)}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>

      <SidebarInset>
        <header className="sticky top-0 z-50 flex items-center justify-between gap-2 border-b bg-background px-4 py-2">
          <div className="flex items-center gap-2">
            <SidebarTrigger className="[&_svg]:size-5!" />
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="tertiary" size="icon" asChild aria-label={t('chat')}>
              <Link href="/app/chat">
                <MessageCircle />
              </Link>
            </Button>
            <NotificationBell />
            <ProfileDropdown
              trigger={
                <Button variant="tertiary" size="icon" className="size-9.5" aria-label={t('nav.profile')}>
                  <Avatar className="size-9.5 rounded-md">
                    <AvatarFallback>PJ</AvatarFallback>
                  </Avatar>
                </Button>
              }
            />
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <Toaster />
      </SidebarInset>
    </SidebarProvider>
  );
}
