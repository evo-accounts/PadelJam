create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

create trigger trg_communities_updated_at before update on communities
  for each row execute function set_updated_at();
create trigger trg_community_permissions_updated_at before update on community_permissions
  for each row execute function set_updated_at();
create trigger trg_community_reviews_updated_at before update on community_reviews
  for each row execute function set_updated_at();
create trigger trg_community_posts_updated_at before update on community_posts
  for each row execute function set_updated_at();
