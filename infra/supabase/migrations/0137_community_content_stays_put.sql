-- Posts, comments, likes and reviews stay in the community they were written in, as they were
-- written, by whoever wrote them. Product call (2026-10-07): posts, comments, likes and reviews must
-- not move between communities; nobody edits a post or a comment through the API (no edit feature
-- exists); reviews are edited through upsert_community_review. This is the follow-up 0135 set aside
-- ("the community_posts update policy letting an author move a post into another community"),
-- widened to every way the API roles could write these four tables beyond what the apps send. Each
-- case below was reproduced in a throwaway copy of the schema (begin … rollback).
--
-- THE RULE THIS FILE ENFORCES. The API roles may write exactly the columns the apps send, and no
-- table here is ever UPDATEd through the API. Both apps write these tables only through
-- packages/api, and the build on TestFlight (17) does the same:
--   community_posts    INSERT only (useCreatePost: community_id, author_id, kind = 'user', body,
--                      image_path). Result posts come from post_event_result, which is SECURITY
--                      DEFINER: it runs as the tables' owner, so no grant or policy below applies.
--   post_comments      INSERT only (useAddComment: post_id, author_id, body).
--   post_likes         INSERT (post_id, user_id) and DELETE (useToggleLike).
--   community_reviews  upsert_community_review only (useUpsertReview), owner-run like
--                      post_event_result; it is how a review is written AND edited (CM-40).
--   No app deletes a post or a comment today. "posts: delete" and "comments: delete" (the author,
--   or an admin of the community) stay as they are: deleting moves nothing and forges nothing, and
--   it is the moderation the product has. Seeds and the E2E fixtures use the service key, which
--   this file does not touch.
--
-- 1. community_posts UPDATE — authors and admins could move posts between communities (MAJOR).
--    "posts: update" (0024) was USING (author_id = auth.uid() OR is_community_admin(community_id))
--    with no WITH CHECK, so the same expression judged the new row, and UPDATE was granted on every
--    column. The author branch never looks at community_id, so an author could PATCH their post
--      * into any PUBLIC community, joined or not, and
--      * into any community they belong to, private ones included, even where members may not
--        post: can_create_post is checked on INSERT only.
--    A private community the author is NOT in was out of reach over the API only because Postgres
--    also checks the new row against "posts: read" when the statement reads a column, and every
--    PATCH does (the authenticator role preloads safeupdate, which demands a WHERE). In raw SQL a
--    column-free UPDATE (no WHERE, RETURNING a constant) put every post the author had into a
--    stranger's private feed. The admin branch was wider still: an admin of two communities could move any post between
--    them, re-attribute a post to another user (author_id passed the check for an admin), or rewrite
--    a member's words under the member's name. An upsert (POST with resolution=merge-duplicates, an
--    INSERT … ON CONFLICT DO UPDATE) went through the same policy and edited a post in place.
--    Now: "posts: update" is dropped and the API roles have no UPDATE on any column.
--
-- 2. community_posts INSERT — anyone who may post could forge what they posted (MEDIUM).
--    INSERT was granted on every column and "posts: create" checked only author_id and
--    can_create_post. So a member who may post could also set
--      * created_at — a post dated 2076 sits at the top of a feed ordered by created_at desc, for
--        everyone, for fifty years;
--      * kind = 'result' — a post the feed renders as an organizer's published result card;
--      * result_event_id — any event's id, another community's private event included. Worse,
--        post_event_result refuses with 'already_posted' once ANY post names the event, so a member
--        who plants an event's id on an ordinary post stops its organizer from ever posting the
--        result. Reproduced: the organizer's "Post to community feed" then answers already_posted.
--    Now: authenticated may INSERT only the five columns useCreatePost sends, and "posts: create"
--    also requires kind = 'user' and result_event_id is null — the column grant alone keeps
--    result_event_id out, the check keeps it out even if a future grant lets it back in. Result
--    posts come only from post_event_result. id, created_at and updated_at take their defaults.
--
-- 3. community_reviews — a review could be moved past the review gate (MINOR).
--    "reviews: edit" (0069) checked user_id = auth.uid() AND is_community_member(community_id) on
--    both rows and nothing else. "reviews: write" also requires can_review_community (three completed
--    events, CM-40); the UPDATE policy did not. So a member eligible in one community could review
--    it, then PATCH the review's community_id to another community they belong to — reproduced into
--    one where can_review_community is false — and rate it without having played there. Editing a
--    review never needed this policy: upsert_community_review keys the row on (community, caller)
--    and is owner-run. Now: "reviews: edit" is dropped, there is no UPDATE, and a direct INSERT
--    (which "reviews: write" still gates on can_review_community) takes only community_id, user_id,
--    rating and body — the columns the RPC itself writes — so created_at cannot be forged either.
--    community_reviews never had a DELETE policy, so its DELETE grant opened nothing and nothing
--    deletes a review through the API; it is not restated.
--
-- 4. post_comments, post_likes — not exploitable through UPDATE today, closed before they are.
--    Neither table has an UPDATE policy, so an UPDATE matched no row. But UPDATE was granted on every
--    column, post_id included, so the first UPDATE policy anyone added (say for "edit comment") would
--    also have let a comment or a like be moved onto another community's post. INSERT accepted
--    created_at, which pins a comment to the top of a thread ordered by created_at. Now: no UPDATE,
--    and INSERT of exactly the columns useAddComment and useToggleLike send.
--
-- 5. Privileges nothing uses (hygiene).
--    0030 granted authenticated SELECT, INSERT, UPDATE, DELETE and anon SELECT. The rest of what the
--    API roles held here — anon's INSERT, UPDATE and DELETE, and TRUNCATE, REFERENCES, TRIGGER and
--    MAINTAIN for both — came from the platform's default privileges for tables postgres creates in
--    public (pg_default_acl), not from any migration, so on a project whose defaults differ some of
--    the revokes below change nothing. None of these is reachable through PostgREST and no invoker
--    function issues them, but TRUNCATE is a write that skips RLS. Every write policy here starts
--    from auth.uid(), so anon never got a row through. The ACL is restated whole, as the exact set
--    the apps use: revoke everything from public, anon and authenticated, then grant back. Reads are
--    unchanged for everyone.
--
-- If "edit post" or "edit comment" ever ships, grant update (body[, image_path]) with an author-only
-- policy — never community_id, post_id, author_id, kind, result_event_id or created_at.
--
-- DEPLOY ORDER. 0139 (event-result visibility, _event_result_posted_to) treats a post as a real
-- result only if it is kind = 'result', authored by the event's organizer, in the event's own
-- community. Until this file lands, a community admin can produce such a row through "posts: update"
-- (re-attribute it to the organizer, set kind and result_event_id, move it into the event's
-- community) and any organizer can write one by hand. So 0137 goes first — 0139's own self-check
-- refuses to run without it — and on hosted the two are pasted in number order. Nothing else
-- conflicts: 0139 only adds an index on community_posts, and 0141 (status gaps) only edits
-- post_event_result's body, which stays SECURITY DEFINER and owner-run as the check below requires.
--
-- NOT HERE (separate changes):
--   * The other UPDATE policies that pin only the row's owner — notifications, user_settings,
--     user_default_community (profiles was narrowed in 0120; blocks has no write policy since 0140) — guard rows that only their
--     owner reads. Nothing there is content another member sees.
--   * community_permissions: the admin UPDATE still covers every column, including the row's
--     community_id (communities itself is limited to its nine settings columns by 0138).
--   * TRUNCATE, REFERENCES, TRIGGER and MAINTAIN on every other public table, which the same default
--     privileges hand out; best closed schema-wide, together with those defaults.

-- 1 + 2. community_posts ------------------------------------------------------------------------
drop policy if exists "posts: update" on community_posts;
drop policy if exists "posts: create" on community_posts;
create policy "posts: create" on community_posts for insert
  with check (author_id = auth.uid() and can_create_post(community_id)
              and kind = 'user' and result_event_id is null);

-- 3. community_reviews --------------------------------------------------------------------------
drop policy if exists "reviews: edit" on community_reviews;

-- 1–5. Privileges, restated whole. A table-level REVOKE also strips the same privileges from every
-- column, so this leaves no column grant behind and running the file twice gives the same ACL.
-- ALL covers MAINTAIN where the server has it (17+) and is valid on older servers too.
revoke all on community_posts, post_comments, post_likes, community_reviews from public, anon, authenticated;
grant select on community_posts, post_comments, post_likes, community_reviews to anon, authenticated;
grant delete on community_posts, post_comments, post_likes to authenticated;
grant insert (community_id, author_id, kind, body, image_path) on community_posts to authenticated;
grant insert (post_id, author_id, body) on post_comments to authenticated;
grant insert (post_id, user_id) on post_likes to authenticated;
grant insert (community_id, user_id, rating, body) on community_reviews to authenticated;

-- Self-check, in the spirit of 0094/0097/0101/0132–0136. Catalog state only: proving the old moves
-- and forgeries fail needs several users and communities, which is what the REST test
-- (infra/supabase/tests/community-content-stays-put.test.mjs) does on a scratch stack. A hosted
-- paste must not create communities. The editor runs the whole paste as one transaction, so if this
-- raises, nothing above it lands.
do $$
declare
  v_t text; v_cols text[]; v_role text; v_col text; v_priv text;
  v_bad text[] := '{}';
  v_pg17 constant boolean := current_setting('server_version_num')::int >= 170000;
begin
  -- 0137: the API roles hold exactly this, per table, and nothing else. Effective privileges (the
  -- has_*_privilege functions), so a grant through PUBLIC or a column counts as much as a table one.
  for v_t, v_cols in
    select * from (values
      ('community_posts',   array['community_id', 'author_id', 'kind', 'body', 'image_path']),
      ('post_comments',     array['post_id', 'author_id', 'body']),
      ('post_likes',        array['post_id', 'user_id']),
      ('community_reviews', array['community_id', 'user_id', 'rating', 'body'])
    ) as x(t, cols)
  loop
    foreach v_role in array array['anon', 'authenticated'] loop
      -- Reads stay for both; DELETE only for authenticated, and not on reviews.
      if not has_table_privilege(v_role, 'public.' || v_t, 'select') then
        v_bad := v_bad || format('%s lost SELECT on %s', v_role, v_t);
      end if;
      if has_table_privilege(v_role, 'public.' || v_t, 'delete')
         <> (v_role = 'authenticated' and v_t <> 'community_reviews') then
        v_bad := v_bad || format('%s DELETE on %s is not as intended', v_role, v_t);
      end if;
      foreach v_priv in array array['truncate', 'trigger'] loop
        if has_table_privilege(v_role, 'public.' || v_t, v_priv) then
          v_bad := v_bad || format('%s can %s %s', v_role, upper(v_priv), v_t);
        end if;
      end loop;
      if v_pg17 and has_table_privilege(v_role, 'public.' || v_t, 'MAINTAIN') then
        v_bad := v_bad || format('%s can MAINTAIN %s', v_role, v_t);
      end if;
      -- Column by column: INSERT exactly the app's columns (authenticated only), never UPDATE or
      -- REFERENCES. A table-level grant would show up here as every column being allowed.
      for v_col in
        select attname from pg_attribute
         where attrelid = ('public.' || v_t)::regclass and attnum > 0 and not attisdropped
      loop
        if has_column_privilege(v_role, 'public.' || v_t, v_col, 'insert')
           <> (v_role = 'authenticated' and v_col = any(v_cols)) then
          v_bad := v_bad || format('%s INSERT on %s.%s is not as intended', v_role, v_t, v_col);
        end if;
        if has_column_privilege(v_role, 'public.' || v_t, v_col, 'update') then
          v_bad := v_bad || format('%s can UPDATE %s.%s', v_role, v_t, v_col);
        end if;
        if has_column_privilege(v_role, 'public.' || v_t, v_col, 'references') then
          v_bad := v_bad || format('%s holds REFERENCES on %s.%s', v_role, v_t, v_col);
        end if;
      end loop;
    end loop;
    if not (select relrowsecurity from pg_class where oid = ('public.' || v_t)::regclass) then
      v_bad := v_bad || format('row level security is off on %s', v_t);
    end if;
  end loop;
  if cardinality(v_bad) > 0 then
    raise exception 'community content privileges are wrong: %', array_to_string(v_bad, '; ');
  end if;

  -- No UPDATE (or ALL) policy is left for a future grant to wake up.
  if exists (select 1 from pg_policy
              where polrelid in ('public.community_posts'::regclass, 'public.post_comments'::regclass,
                                 'public.post_likes'::regclass, 'public.community_reviews'::regclass)
                and polcmd in ('w', '*')) then
    raise exception 'an UPDATE or ALL policy survives on a post, comment, like or review table';
  end if;

  -- The only way a client creates a post is "posts: create", and it admits ordinary posts only.
  -- Permissive policies are OR-ed, so a second INSERT policy would undo it.
  if (select count(*) from pg_policy
       where polrelid = 'public.community_posts'::regclass and polcmd in ('a', '*') and polpermissive) <> 1
     or not exists (
       select 1 from pg_policy
        where polrelid = 'public.community_posts'::regclass and polname = 'posts: create' and polcmd = 'a'
          and pg_get_expr(polwithcheck, polrelid) ~ 'author_id = auth\.uid\(\)'
          and pg_get_expr(polwithcheck, polrelid) ~ 'can_create_post\(community_id\)'
          and pg_get_expr(polwithcheck, polrelid) ~ 'kind = ''user''::text'
          and pg_get_expr(polwithcheck, polrelid) ~ 'result_event_id IS NULL') then
    raise exception '"posts: create" is not the one INSERT policy on community_posts, or it no longer pins author, can_create_post, kind = user and result_event_id is null';
  end if;

  -- What the feed does write still has its policy: post, comment, like, unlike — and delete a post
  -- or a comment (author or admin), the moderation the product has.
  if (select count(*) from pg_policy
       where (polrelid, polname, polcmd) in (('public.community_posts'::regclass, 'posts: delete', 'd'),
                                             ('public.post_comments'::regclass, 'comments: write', 'a'),
                                             ('public.post_comments'::regclass, 'comments: delete', 'd'),
                                             ('public.post_likes'::regclass, 'likes: write', 'a'),
                                             ('public.post_likes'::regclass, 'likes: unlike', 'd'))) <> 5 then
    raise exception 'a create/delete policy the feed relies on is missing';
  end if;

  -- Writing AND editing a review is upsert_community_review alone now, and a result post is
  -- post_event_result alone. With no UPDATE policy and no column grant to fall back on, each works
  -- only while it is SECURITY DEFINER, callable by authenticated, and owned by a role that gets past
  -- RLS on its table (the table's owner without FORCE ROW LEVEL SECURITY, or a BYPASSRLS role) and
  -- holds the privileges its statement needs.
  if not exists (
       select 1 from pg_proc p
         join pg_roles r on r.oid = p.proowner
         join pg_class c on c.oid = 'public.community_reviews'::regclass
        where p.oid = 'public.upsert_community_review(uuid,smallint,text)'::regprocedure
          and p.prosecdef
          and has_function_privilege('authenticated', p.oid, 'execute')
          and (r.rolsuper or r.rolbypassrls or (p.proowner = c.relowner and not c.relforcerowsecurity))
          and has_table_privilege(p.proowner, c.oid, 'insert')
          and has_table_privilege(p.proowner, c.oid, 'update')) then
    raise exception 'Write a review / Edit review would break: upsert_community_review is not an owner-run SECURITY DEFINER function authenticated may call';
  end if;
  if not exists (
       select 1 from pg_proc p
         join pg_roles r on r.oid = p.proowner
         join pg_class c on c.oid = 'public.community_posts'::regclass
        where p.oid = 'public.post_event_result(uuid)'::regprocedure
          and p.prosecdef
          and has_function_privilege('authenticated', p.oid, 'execute')
          and (r.rolsuper or r.rolbypassrls or (p.proowner = c.relowner and not c.relforcerowsecurity))
          and has_table_privilege(p.proowner, c.oid, 'insert')) then
    raise exception 'Post to community feed would break: post_event_result is not an owner-run SECURITY DEFINER function authenticated may call';
  end if;
end $$;
