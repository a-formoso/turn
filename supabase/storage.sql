-- ============================================================================
-- TURN — Supabase Storage  (paste the WHOLE contents into the SQL Editor → Run)
-- Private bucket for generated images; every file is locked to the folder of the
-- user who owns it. Path convention (built in app/cloud.jsx -> turnStoragePath):
--   turn-assets/{user_id}/{project_id}/{assetType}/{entityId}/{role}[-v{N}]-{timestamp}-{shortId}.png
-- assetType: character|prop|location|shot|cameo; role: sheet|ref-<kind>|<cameo-angle>.
-- v{N} is a non-authoritative version-at-birth hint on sheets; {timestamp}-{shortId}
-- is the real uniqueness key. The live version label comes from the DB, not the name.
-- IMPORTANT: the RLS below pins folder[1] to auth.uid(), so {user_id} MUST stay first.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('turn-assets', 'turn-assets', false)
on conflict (id) do nothing;

drop policy if exists "turn assets read own"   on storage.objects;
drop policy if exists "turn assets write own"  on storage.objects;
drop policy if exists "turn assets update own" on storage.objects;
drop policy if exists "turn assets delete own" on storage.objects;

create policy "turn assets read own" on storage.objects for select
  using (bucket_id = 'turn-assets' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "turn assets write own" on storage.objects for insert
  with check (bucket_id = 'turn-assets' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "turn assets update own" on storage.objects for update
  using (bucket_id = 'turn-assets' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "turn assets delete own" on storage.objects for delete
  using (bucket_id = 'turn-assets' and (storage.foldername(name))[1] = auth.uid()::text);
