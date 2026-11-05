// infra/supabase/tests/storage-bucket-limits.test.mjs
// Migration 0151 (PAD-162): every bucket has a size limit and an image-type allow-list.
// Each upload uses a user who passes RLS, so a refusal can only come from the limit.
import { BASE_URL, ANON, SERVICE, user, rpc, assert, run } from './lib.mjs';

const RUN = Date.now().toString(36);
const owner = await user('sbl-owner');
const communityId = await rpc(owner.jwt, 'create_community_with_personal_tenant', {
  p_name: `Bucket Club ${RUN}`, p_type: 'club', p_country: 'PT', p_privacy: 'public',
  p_description: null, p_location: 'Lisbon, PT', p_thumbnail_path: null, p_cover_image_path: null,
  p_cancellation_rules_enabled: false, p_cancellation_rules_text: null,
});

const BUCKETS = {
  avatars: owner.id,
  'event-thumbnails': owner.id,
  'community-thumbnails': communityId,
  'community-covers': communityId,
  'community-post-images': communityId,
};

const upload = (bucket, name, type, body) =>
  fetch(`${BASE_URL}/storage/v1/object/${bucket}/${BUCKETS[bucket]}/${name}`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${owner.jwt}`, 'Content-Type': type },
    body,
  });
const small = new Uint8Array([0x89, 0x50]);

for (const bucket of Object.keys(BUCKETS)) {
  await run(`${bucket}: text/html is refused`, async () => {
    const r = await upload(bucket, `${RUN}-a.html`, 'text/html', '<script>1</script>');
    assert(!r.ok, `html must be refused (got ${r.status})`);
  });
}

await run('avatars: svg and an oversize jpeg are refused, a small jpeg is accepted', async () => {
  const svg = await upload('avatars', `${RUN}-b.svg`, 'image/svg+xml', '<svg/>');
  assert(!svg.ok, `svg must be refused (got ${svg.status})`);
  const big = await upload('avatars', `${RUN}-big.jpg`, 'image/jpeg', new Uint8Array(5 * 1024 * 1024 + 1));
  assert(!big.ok, `over 5 MiB must be refused (got ${big.status})`);
  const ok = await upload('avatars', `${RUN}-ok.jpg`, 'image/jpeg', small);
  assert(ok.ok, `small jpeg must be accepted (got ${ok.status}: ${await ok.text()})`);
});

await run('community-post-images: a small webp is accepted', async () => {
  const ok = await upload('community-post-images', `${RUN}-ok.webp`, 'image/webp', small);
  assert(ok.ok, `small webp must be accepted (got ${ok.status}: ${await ok.text()})`);
});

await run('every bucket has a size limit and a type list', async () => {
  const res = await fetch(`${BASE_URL}/storage/v1/bucket`, {
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
  });
  const buckets = await res.json();
  assert(Array.isArray(buckets) && buckets.length >= 6, `bucket list readable (got ${res.status})`);
  for (const b of buckets) {
    assert(b.file_size_limit != null, `${b.id} has file_size_limit`);
    assert(Array.isArray(b.allowed_mime_types) && b.allowed_mime_types.length > 0, `${b.id} has allowed_mime_types`);
  }
});
