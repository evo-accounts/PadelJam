-- Re-point user-identity FKs on the Communities social tables from auth.users(id) to public.profiles(id)
-- so PostgREST can embed profile data (member lists, post authors, reviewers, requesters, inviters).
-- profiles.id is 1:1 with auth.users.id (profiles.id FK auth.users on delete cascade), so referential
-- integrity is preserved transitively, and auth.uid() (= profiles.id) keeps every RLS policy valid.
-- Every authenticated actor has a profile (created at onboarding), so inserts are unaffected.

alter table community_members
  drop constraint if exists community_members_user_id_fkey,
  add  constraint community_members_user_id_fkey foreign key (user_id) references profiles(id) on delete cascade;

alter table community_reviews
  drop constraint if exists community_reviews_user_id_fkey,
  add  constraint community_reviews_user_id_fkey foreign key (user_id) references profiles(id) on delete cascade;

alter table community_join_requests
  drop constraint if exists community_join_requests_user_id_fkey,
  add  constraint community_join_requests_user_id_fkey foreign key (user_id) references profiles(id) on delete cascade;

alter table community_posts
  drop constraint if exists community_posts_author_id_fkey,
  add  constraint community_posts_author_id_fkey foreign key (author_id) references profiles(id) on delete cascade;

alter table post_comments
  drop constraint if exists post_comments_author_id_fkey,
  add  constraint post_comments_author_id_fkey foreign key (author_id) references profiles(id) on delete cascade;

alter table community_invitations
  drop constraint if exists community_invitations_invitee_id_fkey,
  add  constraint community_invitations_invitee_id_fkey foreign key (invitee_id) references profiles(id) on delete cascade,
  drop constraint if exists community_invitations_inviter_id_fkey,
  add  constraint community_invitations_inviter_id_fkey foreign key (inviter_id) references profiles(id) on delete cascade;
