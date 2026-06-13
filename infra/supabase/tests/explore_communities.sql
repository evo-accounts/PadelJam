-- explore_communities: excludes own/archived/private; surfaces public + request_to_join; paging.
-- 'PT001' = expected behaviour did not hold.
begin;
insert into auth.users (id, instance_id, aud, role, email) values
  ('e1000001-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ec1@x.com'),
  ('e1000002-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ec2@x.com') on conflict do nothing;
insert into profiles (id, email, phone, full_name) values
  ('e1000001-0000-0000-0000-000000000001','ec1@x.com','+351900200001','EcOwner'),
  ('e1000002-0000-0000-0000-000000000002','ec2@x.com','+351900200002','EcViewer') on conflict do nothing;

do $$
declare cid_pub uuid; cid_req uuid; cid_priv uuid; cid_arch uuid; n int;
begin
  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"e1000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  cid_pub := create_community_with_personal_tenant('EcPub','club','PT','public');

  perform set_config('role','postgres',true);
  insert into communities (tenant_id, name, type, privacy)
    select tenant_id, 'EcReq', 'club', 'request_to_join' from communities where id = cid_pub returning id into cid_req;
  insert into communities (tenant_id, name, type, privacy)
    select tenant_id, 'EcPriv', 'club', 'private' from communities where id = cid_pub returning id into cid_priv;
  insert into communities (tenant_id, name, type, privacy, archived_at)
    select tenant_id, 'EcArch', 'club', 'public', now() from communities where id = cid_pub returning id into cid_arch;

  perform set_config('role','authenticated',true);
  perform set_config('request.jwt.claims','{"sub":"e1000002-0000-0000-0000-000000000002","role":"authenticated"}',true);

  if not exists (select 1 from explore_communities(50,0) where id = cid_pub) then
    raise exception using errcode='PT001', message='public community not surfaced';
  end if;
  if not exists (select 1 from explore_communities(50,0) where id = cid_req) then
    raise exception using errcode='PT001', message='request_to_join community not surfaced';
  end if;
  if exists (select 1 from explore_communities(50,0) where id = cid_priv) then
    raise exception using errcode='PT001', message='private community leaked';
  end if;

  perform set_config('request.jwt.claims','{"sub":"e1000001-0000-0000-0000-000000000001","role":"authenticated"}',true);
  if exists (select 1 from explore_communities(50,0) where id = cid_pub) then
    raise exception using errcode='PT001', message='own community surfaced to member';
  end if;

  perform set_config('request.jwt.claims','{"sub":"e1000002-0000-0000-0000-000000000002","role":"authenticated"}',true);
  if exists (select 1 from explore_communities(50,0) where id = cid_arch) then
    raise exception using errcode='PT001', message='archived community surfaced';
  end if;
  select count(*) into n from explore_communities(1,0);
  if n <> 1 then raise exception using errcode='PT001', message='limit not honoured'; end if;
  select count(*) into n from explore_communities(1,1);
  if n <> 1 then raise exception using errcode='PT001', message='offset not honoured'; end if;

  raise notice 'OK explore_communities';
end $$;
rollback;
