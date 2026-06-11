# Home — Navigation, Home Screen, Chat & Notifications

*Padel Jam — Version 1.0 • May 2026 • Wireframe-derived requirements*

This document defines the app shell of Padel Jam — the bottom navigation and the floating action button — together with the Home landing screen and the two screens that hang off the Home header: Chat and Notifications. Search and the Explore screen are specified in a separate Discovery document. Each bottom-nav destination (Events, Community, Profile) is specified in its own module document.

**Confirmed design decisions**

- The app shell is a 5-tab bottom navigation: Home, Events, Explore, Community, Profile.

- A floating "+" button — Create Event — appears on the main Home, Events, and Explore screens.

- Home is the landing screen: quick actions, the user’s upcoming events and groups. A brand-new user with no events or groups sees location-based suggestions.

- When a new user has no location set, Home shows the platform’s top events and groups plus a banner prompting them to add their location.

- Every group, every private event, and every standalone event automatically has a chat. Users can also start direct chats — with people they follow, or anyone via name search.

- Chat messages support text and photo. Audio messages are not in the MVP.

- Notifications cover invitations (with a Join CTA), event lifecycle events, community-request acceptance, and social events (follows, followed users joining events).

- Search and the Explore screen are specified in the separate Discovery document.

## Overview

**What this document covers**

Three things: the app shell (the bottom navigation and the floating action button that frame every screen), the Home landing screen, and the two utility screens reached from the Home header — Chat and Notifications.

**How it fits**

- Home is one of five bottom-nav destinations; the other four (Events, Explore, Community, Profile) are specified elsewhere.

- Chat and Notifications are not bottom-nav tabs — they are reached from icons in the Home header and behave as overlay / pushed screens.

- Home is an aggregator: it surfaces the user’s events and groups, which are owned by the Events and Groups modules.

**Out of scope**

- Search (the Home header search icon, and the destination of the Find quick actions) and the Explore tab — both specified in the Discovery document.

- The Events list, Community page, and Profile screen — each specified in its own module document.

- The follow system itself (following / followers, "players you might know") — referenced here, specified in the Profile document.

- Partner Requests — surfaced as an entry in the Notifications screen, but specified in the Events Join / In-progress docs.

## Data model

Four new tables. profiles, groups, events and communities are referenced as foreign keys and defined in their own docs. Home itself stores no new data — it aggregates existing tables. Full SQL is in section 08.

| **Table** | **Purpose** |
|----|----|
| chats | A conversation — automatic (group / event) or direct (between users). |
| chat_members | Who is in a chat, plus each member’s last-read marker. |
| chat_messages | Messages in a chat — text and / or photo. |
| notifications | Per-user notifications, with optional Join action state. |

## Navigation — the app shell

**Bottom navigation**

Every primary screen sits under a fixed 5-tab bottom navigation bar:

| **Tab** | **Destination** | **Specified in** |
|----|----|----|
| Home | The Home landing screen. | This document |
| Events | The user’s events list (All / Organizing / Going). | Join & Manage Event doc |
| Explore | The discovery screen — suggested players, events, communities, groups. | Discovery doc |
| Community | The current community page (Posts / Events / Groups / Members / About). | Communities doc |
| Profile | The user’s profile. | Profile doc |

**Floating action button**

- A floating "+" button is anchored bottom-right on the main Home, Events, and Explore screens.

- It opens Create Event (the Create Event wizard, starting at the group selector). It does not appear on Community or Profile.

**Home header**

- The Home screen header carries three icons: Notifications (bell), Chat, and Search.

- Notifications and Chat are specified in this document (sections 05–06); Search is in the Discovery doc.

## Home screen

### 4.1 Layout

- Header: the "Home" title and the three header icons (notifications, chat, search).

- Quick actions: a row of four shortcuts — Create Event, Find Event, Find Group, Find Community.

- Next Events: a horizontally scrollable preview of the user’s upcoming confirmed events, with a "See all" into the Events list.

- My groups: a preview of the user’s groups, with a "See all" into the groups list.

- The floating Create Event button overlays the screen (section 03).

| **4.2 Quick actions** |  |
|----|----|
| **Create Event** | Opens the Create Event wizard, starting at the group / community selector. |
| **Find Event** | Opens the Search screen on the Events tab (Search — Discovery doc). |
| **Find Group** | Opens the Search screen on the Groups tab. |
| **Find Community** | Opens the Search screen on the Community tab. |

| **4.3 First-access & empty state** |  |
|----|----|
| **Trigger** | A user who has no events and belongs to no groups — typically right after onboarding. |
| **What replaces the sections** | Instead of "Next Events" and "My groups", Home shows "Suggested events" and "Suggested groups". |
| **With a location** | Suggestions are based on the user’s location — events and groups near them. |
| **Without a location** | Home falls back to the platform’s top events and groups, and shows a banner prompting the user to add their location for better, nearer suggestions. |
| **After the user has activity** | Once the user has any event or group, Home shows the normal "Next Events" / "My groups" sections. |

## Chat

Reached from the chat icon in the Home header. Chat has three screens: the chat list, New Chat, and the conversation.

| **5.1 Automatic chats** |  |
|----|----|
| **Group chat** | Every group has a chat, automatically, named after the group. Its members are the group’s members. |
| **Private event chat** | Every private event has a chat, named after the event. Its members are the event’s participants. |
| **Standalone event chat** | Every standalone (group-less) event has a chat, named after the event. |
| **Lifecycle** | An automatic chat is created with its parent (group / event) and its membership tracks the parent’s membership. |

| **5.2 Direct chats** |  |
|----|----|
| **New Chat** | A "New Chat" screen lists, by default, the people the user follows. |
| **Anyone else** | To message someone the user does not follow, they search by name. |
| **Result** | Selecting a person opens (or creates) a one-to-one direct chat. |

| **5.3 Chat list & conversation** |  |
|----|----|
| **Chat list** | All of the user’s chats — automatic and direct — with a search field. Each row shows the last message and an unread indicator. |
| **Unread state** | Tracked per member via chat_members.last_read_at; the list shows unread chats. |
| **Conversation** | A standard message thread: a header with the chat name, message bubbles, and a composer. |
| **Message content** | A message supports text and / or a photo. Audio messages are not in the MVP. |
| **Realtime** | Messages and the chat list update in real time via Supabase Realtime. |
| **Swipe — group / event chats** | For group chats and event chats (group / private event / standalone event), the user cannot leave or delete the chat. Swiping left on a chat row reveals a single Archive action that moves the chat to the Archived tab. |
| **Swipe — direct chats** | For direct (one-to-one) chats, swiping left on a chat row reveals two actions: Archive and Delete. Archive moves the chat to the Archived tab; Delete removes the chat from the user’s list and erases their message history (per-user, soft delete — see Delete confirmation below). |
| **Archived tab** | The Chat list has two tabs: Active (default) and Archived. The Archived tab lists every chat the user has archived — group, event, and direct — with the same row layout as the Active tab. A swipe-left on an archived row reveals an Unarchive action that returns the chat to the Active tab. New messages in an archived chat do not automatically unarchive it; they update the row in place. |
| **Archive confirmation** | Tapping Archive on any chat (group, event, or direct) opens a confirmation modal. Title: “Archive this chat?”. Body: “You can find it later in the Archived tab.”. Actions: Cancel (dismisses the modal, leaves the chat in Active) / Archive (moves it to Archived). |
| **Delete confirmation** | Tapping Delete on a direct chat opens a confirmation modal. Title: “Delete this chat?”. Body: “All messages will be permanently removed and this action cannot be undone.”. Actions: Cancel / Delete (destructive, red). Confirming removes the chat from the user’s Active and Archived tabs and erases their message history. Delete is not available on group or event chats. |

| **5.4 Chat details** |  |
|----|----|
| **Entry point** | Tapping the chat name / header inside any conversation (group, event, or direct) opens the Chat details screen. The conversation’s header is the affordance — no separate icon. |
| **Layout** | A pushed screen with a back arrow returning to the conversation, the chat name as the title, and a single section: Media. The Media section contains the chat’s image bank. |
| **Media gallery** | A square grid (3 columns on mobile) of every image ever sent in the chat, newest first, scrolled vertically. The grid is sourced from chat_messages where image_path is not null. An empty state (“No photos shared yet.”) is shown when no images exist. |
| **Tap on image** | Tapping a thumbnail opens the image full-screen with a back to close it; swiping horizontally pages between images in the chat. |

## Notifications

Reached from the bell icon in the Home header — the bell shows a red dot whenever the user has any unread notification. The screen is a pushed view with a header (back arrow, “Notification” title centered, and a settings ‘…’ icon top right). Below the header sits a pinned Partner Requests entry, followed by a single chronological list of notifications, newest first. The settings icon opens a modal with two options — Mark all as read and Clear all — both detailed in 6.3 below.

### 6.1 Partner Requests entry

- The top of the Notifications screen has a "Partner Requests" row showing the pending count (e.g. "3 pendings") and opening the Partner Requests screen (specified in the Events Join doc). The count and the screen aggregate two sources: (a) partner / join requests for events the user organizes, and (b) — only when the user owns one or more communities — join requests for those communities. When the user owns more than one community, each community-join request row on the Partner Requests screen must surface the target community name (e.g. "wants to join Padel do Porto") so the owner knows which community they are accepting into.

### 6.2 Notification types

| **Notification** | **CTA / behaviour** |
|----|----|
| Invited to a private event | Join CTA inline. |
| Invited to a group | Join CTA inline. |
| Invited to a community | Join CTA inline. |
| A group’s general event (you can join) | Join CTA inline. |
| Your request to join a community was accepted | Informational; taps through to the community. |
| An event you are confirmed in has started | Informational; taps through to the live event. |
| Someone followed your profile | Social; taps through to that profile. |
| Someone you follow joined an event | Social; taps through to that event. |

| **6.3 Behaviour** |  |
|----|----|
| **Join CTA** | Invitation notifications carry an inline Join button. Acting on it joins the event / group / community and flips the button to a "Joined" state on the notification. |
| **Navigation** | Tapping a notification routes to the relevant screen (event, group, community, or profile). |
| **Read state** | Notifications have a read / unread state; opening the screen / a notification marks it read. The bell icon in the Home header displays a red dot whenever the user has at least one unread notification; the dot disappears once every notification has been read (either by opening individual rows or via Mark all as read — see Settings menu below). |
| **Settings menu** | The settings ‘…’ icon top-right of the Notifications header opens a modal sheet with two options. Mark all as read — flips every notification on the screen to read state and clears the red dot on the bell; rows remain visible. Clear all — removes every notification from the user’s list (the Partner Requests pinned row is not affected, as it reflects pending requests, not notifications). The Partner Requests row is never affected by either action. |
| **Realtime** | New notifications arrive in real time via Supabase Realtime. |

## Functional requirements

Must = MVP. Should = V2. Could = V3. IDs are prefixed HN (Home & Navigation).

| **ID** | **Requirement** | **Priority** | **Notes** |
|----|----|----|----|
| HN-01 | The app uses a fixed 5-tab bottom navigation: Home / Events / Explore / Community / Profile. | **Must** |  |
| HN-02 | A floating Create Event button appears on the main Home, Events, and Explore screens. | **Must** |  |
| HN-03 | The Home header has Notifications, Chat, and Search entry points. | **Must** | Search → Discovery doc. |
| HN-04 | Home shows a quick-actions row: Create Event, Find Event, Find Group, Find Community. | **Must** |  |
| HN-05 | Home shows the user’s upcoming events ("Next Events") with See all → Events. | **Must** |  |
| HN-06 | Home shows the user’s groups ("My groups") with See all → groups list. | **Must** |  |
| HN-07 | A first-access user with no events and no groups sees Suggested events and Suggested groups. | **Must** |  |
| HN-08 | Suggestions are location-based; with no location set, Home shows platform top events / groups plus an add-location banner. | **Must** |  |
| HN-09 | Find Event / Group / Community open the Search screen on the matching tab. | **Should** | Search in the Discovery doc. |
| HN-10 | Every group has an automatic chat named after the group. | **Must** |  |
| HN-11 | Every private event and every standalone event has an automatic chat named after the event. | **Must** |  |
| HN-12 | A user can start a direct chat — from their follow list, or anyone via name search. | **Must** |  |
| HN-13 | Chat messages support text and photo; audio is not in the MVP. | **Must** |  |
| HN-14 | The chat list shows the user’s chats with an unread indicator. | **Must** |  |
| HN-15 | Chat messages and the chat list update in real time. | **Must** | Supabase Realtime. |
| HN-16 | The Notifications screen lists notifications with a Partner Requests entry pinned at the top. | **Must** |  |
| HN-17 | Invitation notifications (private event / group / community / group general event) carry an inline Join CTA. | **Must** |  |
| HN-18 | Acting on a Join-CTA notification flips it to a "Joined" state. | **Should** |  |
| HN-19 | Notifications cover: an event you are confirmed in started; your community request was accepted. | **Must** |  |
| HN-20 | Social notifications: someone followed you; someone you follow joined an event. | **Should** |  |
| HN-21 | Tapping a notification navigates to the relevant screen. | **Must** |  |
| HN-22 | Notifications have a read / unread state; the bell shows an unread badge. | **Should** |  |

## Database schema

profiles, groups, events and communities are referenced as foreign keys and defined in their own docs.

**chats**

| **Column** | **Type** | **Nullable** | **Notes** |
|----|----|----|----|
| id | UUID | No | gen_random_uuid() |
| kind | TEXT | No | CHECK IN (group, event, direct) |
| group_id | UUID | Yes | FK groups — set when kind = group |
| event_id | UUID | Yes | FK events — set when kind = event |
| name | TEXT | Yes | Group / event name; null for direct chats |
| created_at | TIMESTAMPTZ | No | default now() |

CREATE TABLE chats (

id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

kind TEXT NOT NULL CHECK (kind IN ('group','event','direct')),

group_id UUID REFERENCES groups(id) ON DELETE CASCADE,

event_id UUID REFERENCES events(id) ON DELETE CASCADE,

name TEXT,

created_at TIMESTAMPTZ DEFAULT now(),

CHECK (

(kind = 'group' AND group_id IS NOT NULL) OR

(kind = 'event' AND event_id IS NOT NULL) OR

(kind = 'direct')

)

);

**chat_members**

CREATE TABLE chat_members (

id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,

user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

last_read_at TIMESTAMPTZ,

joined_at TIMESTAMPTZ DEFAULT now(),

UNIQUE (chat_id, user_id)

);

-- For automatic chats, chat_members is kept in sync with the parent

-- group's / event's membership.

**chat_messages**

CREATE TABLE chat_messages (

id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,

sender_id UUID NOT NULL REFERENCES profiles(id),

body TEXT,

image_path TEXT,

created_at TIMESTAMPTZ DEFAULT now(),

CHECK (body IS NOT NULL OR image_path IS NOT NULL)

);

**notifications**

| **Column** | **Type** | **Nullable** | **Notes** |
|----|----|----|----|
| id | UUID | No | Primary key |
| user_id | UUID | No | FK profiles — the recipient |
| type | TEXT | No | See the CHECK below |
| actor_id | UUID | Yes | FK profiles — who triggered it |
| event_id | UUID | Yes | FK events — context, if any |
| group_id | UUID | Yes | FK groups — context, if any |
| community_id | UUID | Yes | FK communities — context, if any |
| action_state | TEXT | Yes | pending / done — for Join-CTA notifications |
| is_read | BOOLEAN | No | default false |
| created_at | TIMESTAMPTZ | No | default now() |

CREATE TABLE notifications (

id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

type TEXT NOT NULL CHECK (type IN (

'invite_event','invite_group','invite_community',

'group_general_event','community_request_accepted',

'event_started','followed','followed_user_joined_event')),

actor_id UUID REFERENCES profiles(id),

event_id UUID REFERENCES events(id) ON DELETE CASCADE,

group_id UUID REFERENCES groups(id) ON DELETE CASCADE,

community_id UUID REFERENCES communities(id) ON DELETE CASCADE,

action_state TEXT CHECK (action_state IS NULL OR action_state IN ('pending','done')),

is_read BOOLEAN NOT NULL DEFAULT false,

created_at TIMESTAMPTZ DEFAULT now()

);

**Realtime**

ALTER PUBLICATION supabase_realtime ADD TABLE chats;

ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;

ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

## Row Level Security policies

**chats / chat_messages**

ALTER TABLE chats ENABLE ROW LEVEL SECURITY;

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- READ a chat: the user must be a member of it.

CREATE POLICY "chats: read" ON chats FOR SELECT

USING (EXISTS (

SELECT 1 FROM chat_members cm

WHERE cm.chat_id = chats.id AND cm.user_id = auth.uid()

));

-- READ messages: members of the chat.

CREATE POLICY "messages: read" ON chat_messages FOR SELECT

USING (EXISTS (

SELECT 1 FROM chat_members cm

WHERE cm.chat_id = chat_messages.chat_id AND cm.user_id = auth.uid()

));

-- SEND a message: a member, posting as themselves.

CREATE POLICY "messages: send" ON chat_messages FOR INSERT

WITH CHECK (

sender_id = auth.uid()

AND EXISTS (

SELECT 1 FROM chat_members cm

WHERE cm.chat_id = chat_messages.chat_id AND cm.user_id = auth.uid()

)

);

**notifications**

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- A user reads and updates (mark read / act) only their own notifications.

CREATE POLICY "notifications: read" ON notifications FOR SELECT

USING (user_id = auth.uid());

CREATE POLICY "notifications: update" ON notifications FOR UPDATE

USING (user_id = auth.uid());

-- Notifications are created server-side (service role / triggers),

-- not directly by clients.

## Component & file map

Assumes the default Padel Jam stack — Next.js (App Router) + Supabase + shadcn/ui + Tailwind.

src/components/shell/BottomNav.tsx 5-tab navigation

src/components/shell/CreateEventFab.tsx Floating + button

src/components/shell/AppShell.tsx Wraps tab screens

src/app/(app)/home/page.tsx Home screen

src/components/home/HomeHeader.tsx Title + bell / chat / search

src/components/home/QuickActions.tsx Create / Find Event / Group / Community

src/components/home/NextEvents.tsx Upcoming events preview

src/components/home/MyGroups.tsx Groups preview

src/components/home/HomeEmptyState.tsx Suggested events / groups + location banner

src/lib/hooks/useHomeFeed.ts Aggregates events + groups (+ suggestions)

src/app/(app)/chat/page.tsx Chat list

src/app/(app)/chat/\[id\]/page.tsx Conversation

src/components/chat/ChatList.tsx

src/components/chat/NewChatSheet.tsx Follow list + name search

src/components/chat/Conversation.tsx

src/components/chat/MessageComposer.tsx Text + photo

src/lib/hooks/useChats.ts

src/lib/hooks/useChatMessages.ts

src/app/(app)/notifications/page.tsx

src/components/notifications/NotificationList.tsx

src/components/notifications/NotificationRow.tsx inline Join CTA

src/components/notifications/PartnerRequestsEntry.tsx

src/lib/hooks/useNotifications.ts

## Claude Code prompts

Run the section 08 schema and section 09 RLS as Supabase migrations first. Then run the two prompts in order.

**Prompt 1 — Navigation & Home**

**Build the app shell and Home screen for Padel Jam.**

1.  Build AppShell with BottomNav — a fixed 5-tab bar (Home, Events, Explore, Community, Profile) — and CreateEventFab, a floating "+" button that opens the Create Event wizard, shown only on the Home, Events, and Explore screens.

2.  Build the Home screen (/home): HomeHeader with the title and the notifications / chat / search icons; QuickActions with Create Event, Find Event, Find Group, Find Community (Find actions route to the Search screen on the matching tab).

3.  Build NextEvents (the user’s upcoming confirmed events, horizontal, See all → Events) and MyGroups (the user’s groups, See all). Create useHomeFeed.ts to aggregate them.

4.  Build HomeEmptyState: when the user has no events and no groups, show Suggested events and Suggested groups. Use the user’s location when set; otherwise show the platform’s top events / groups and a banner prompting them to add a location.

**Prompt 2 — Chat & Notifications**

**Build Chat and Notifications for Padel Jam.**

5.  Create useChats.ts and useChatMessages.ts with Supabase Realtime. Ensure an automatic chat exists for every group, every private event, and every standalone event (created with the parent; membership synced from the parent); a direct chat is created on demand between two users.

6.  Build the chat list (/chat) — ChatList with a search field, last message, and unread indicator (from chat_members.last_read_at) — and NewChatSheet, which lists the people the user follows and searches anyone by name.

7.  Build the Conversation screen (/chat/\[id\]) with MessageComposer supporting text and a photo (no audio). Update last_read_at when the conversation is opened.

8.  Build the Notifications screen (/notifications): NotificationList newest-first, a pinned PartnerRequestsEntry with the pending count, and NotificationRow rendering each type (see section 06). Invitation rows carry an inline Join CTA that joins and flips to "Joined"; tapping any row navigates to its context. Mark notifications read; show an unread badge on the bell.

9.  Write a Playwright spec: bottom-nav routing, the Home empty state with and without location, sending a chat message, and acting on a Join-CTA notification.
