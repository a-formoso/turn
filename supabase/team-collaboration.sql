-- ============================================================================
-- TURN — Team collaboration
-- Safe to re-run. Run after schema.sql and storage.sql.
--
-- Adds project memberships by email and changes RLS from owner-only access to
-- owner-or-project-member access. Roles:
--   view_only       can open/read shared projects
--   writer         can edit project data and generated assets
--   art_director   can edit project data and generated assets
--   producer_admin can edit project data and generated assets
-- ============================================================================

create table if not exists public.turn_project_members (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.turn_projects(id) on delete cascade,
  owner        uuid not null references auth.users(id) on delete cascade default auth.uid(),
  member_email text not null,
  member_user  uuid references auth.users(id) on delete cascade,
  role         text not null default 'writer'
    check (role in ('view_only','writer','art_director','producer_admin')),
  status       text not null default 'active'
    check (status in ('active','removed')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (project_id, member_email)
);

create index if not exists turn_project_members_project_idx on public.turn_project_members(project_id);
create index if not exists turn_project_members_email_idx on public.turn_project_members(lower(member_email));
create index if not exists turn_project_members_user_idx on public.turn_project_members(member_user);

drop trigger if exists turn_project_members_touch on public.turn_project_members;
create trigger turn_project_members_touch before update on public.turn_project_members
  for each row execute function public.turn_touch_updated_at();

alter table public.turn_project_members enable row level security;

create or replace function public.turn_current_email() returns text
language sql stable
as $$
  select lower(coalesce(auth.jwt()->>'email', ''));
$$;

create or replace function public.turn_can_access_project(pid uuid, write_access boolean default false)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.turn_projects p
    where p.id = pid and p.owner = auth.uid()
  ) or exists (
    select 1
    from public.turn_project_members m
    where m.project_id = pid
      and m.status = 'active'
      and (
        m.member_user = auth.uid()
        or lower(m.member_email) = public.turn_current_email()
      )
      and (
        not write_access
        or m.role in ('writer','art_director','producer_admin')
      )
  );
$$;

create or replace function public.turn_storage_project_id(path text)
returns uuid
language plpgsql
stable
as $$
declare
  folders text[];
begin
  folders := storage.foldername(path);
  if array_length(folders, 1) < 2 then
    return null;
  end if;
  return folders[2]::uuid;
exception when others then
  return null;
end;
$$;

grant execute on function public.turn_current_email() to authenticated;
grant execute on function public.turn_can_access_project(uuid, boolean) to authenticated;
grant execute on function public.turn_storage_project_id(text) to authenticated;

drop policy if exists "turn_project_members_select" on public.turn_project_members;
create policy "turn_project_members_select" on public.turn_project_members
  for select using (public.turn_can_access_project(project_id, false));

drop policy if exists "turn_project_members_insert_owner" on public.turn_project_members;
create policy "turn_project_members_insert_owner" on public.turn_project_members
  for insert with check (
    owner = auth.uid()
    and exists (
      select 1 from public.turn_projects p
      where p.id = project_id and p.owner = auth.uid()
    )
  );

drop policy if exists "turn_project_members_update_owner" on public.turn_project_members;
create policy "turn_project_members_update_owner" on public.turn_project_members
  for update using (
    exists (
      select 1 from public.turn_projects p
      where p.id = project_id and p.owner = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.turn_projects p
      where p.id = project_id and p.owner = auth.uid()
    )
  );

drop policy if exists "turn_project_members_delete_owner" on public.turn_project_members;
create policy "turn_project_members_delete_owner" on public.turn_project_members
  for delete using (
    exists (
      select 1 from public.turn_projects p
      where p.id = project_id and p.owner = auth.uid()
    )
  );

-- Replace owner-only project RLS with owner/member project RLS.
drop policy if exists "own turn projects" on public.turn_projects;
drop policy if exists "turn_projects_select_collab" on public.turn_projects;
drop policy if exists "turn_projects_insert_owner" on public.turn_projects;
drop policy if exists "turn_projects_update_collab" on public.turn_projects;
drop policy if exists "turn_projects_delete_owner" on public.turn_projects;

create policy "turn_projects_select_collab" on public.turn_projects
  for select using (public.turn_can_access_project(id, false));

create policy "turn_projects_insert_owner" on public.turn_projects
  for insert with check (owner = auth.uid());

create policy "turn_projects_update_collab" on public.turn_projects
  for update using (public.turn_can_access_project(id, true))
  with check (public.turn_can_access_project(id, true));

create policy "turn_projects_delete_owner" on public.turn_projects
  for delete using (owner = auth.uid());

-- Generated image rows follow the project access rules.
drop policy if exists "own turn generations" on public.turn_generations;
drop policy if exists "turn_generations_select_collab" on public.turn_generations;
drop policy if exists "turn_generations_insert_collab" on public.turn_generations;
drop policy if exists "turn_generations_update_collab" on public.turn_generations;
drop policy if exists "turn_generations_delete_collab" on public.turn_generations;

create policy "turn_generations_select_collab" on public.turn_generations
  for select using (public.turn_can_access_project(project_id, false));

create policy "turn_generations_insert_collab" on public.turn_generations
  for insert with check (
    owner = auth.uid()
    and public.turn_can_access_project(project_id, true)
  );

create policy "turn_generations_update_collab" on public.turn_generations
  for update using (public.turn_can_access_project(project_id, true))
  with check (public.turn_can_access_project(project_id, true));

create policy "turn_generations_delete_collab" on public.turn_generations
  for delete using (
    owner = auth.uid()
    or exists (
      select 1 from public.turn_projects p
      where p.id = project_id and p.owner = auth.uid()
    )
  );

-- Storage reads can come from the owner's folder or from any accessible project.
-- Writes stay in the signed-in user's folder, but may target a shared project if
-- that user has a write-capable role.
drop policy if exists "turn assets read own"   on storage.objects;
drop policy if exists "turn assets write own"  on storage.objects;
drop policy if exists "turn assets update own" on storage.objects;
drop policy if exists "turn assets delete own" on storage.objects;
drop policy if exists "turn assets read collab"   on storage.objects;
drop policy if exists "turn assets write collab"  on storage.objects;
drop policy if exists "turn assets update collab" on storage.objects;
drop policy if exists "turn assets delete collab" on storage.objects;

create policy "turn assets read collab" on storage.objects for select
  using (
    bucket_id = 'turn-assets'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.turn_can_access_project(public.turn_storage_project_id(name), false)
    )
  );

create policy "turn assets write collab" on storage.objects for insert
  with check (
    bucket_id = 'turn-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.turn_can_access_project(public.turn_storage_project_id(name), true)
  );

create policy "turn assets update collab" on storage.objects for update
  using (
    bucket_id = 'turn-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.turn_can_access_project(public.turn_storage_project_id(name), true)
  );

create policy "turn assets delete collab" on storage.objects for delete
  using (
    bucket_id = 'turn-assets'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.turn_can_access_project(public.turn_storage_project_id(name), true)
    )
  );
