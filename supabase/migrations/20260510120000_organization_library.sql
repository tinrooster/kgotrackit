-- Organization tier for shared library data above workspaces.
-- This is additive and keeps legacy workspace-only records functional.

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  branding jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table if not exists public.organization_app_data (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  contacts jsonb not null default '[]'::jsonb,
  position_templates jsonb not null default '[]'::jsonb,
  inventory_baseline jsonb not null default '[]'::jsonb,
  role_tags jsonb not null default '[]'::jsonb,
  branding jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.organizations is 'Top-level tenant containing shared planning and operations libraries.';
comment on table public.organization_members is 'Membership/role for organization-scoped access.';
comment on table public.organization_app_data is 'Organization-level shared library payload.';

alter table public.workspaces
  add column if not exists organization_id uuid references public.organizations (id) on delete set null;

create index if not exists workspaces_organization_id_idx on public.workspaces (organization_id);
create index if not exists organization_members_user_idx on public.organization_members (user_id);

alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_app_data enable row level security;

drop policy if exists "organizations_select_member" on public.organizations;
create policy "organizations_select_member"
  on public.organizations for select
  using (
    exists (
      select 1
      from public.organization_members m
      where m.organization_id = organizations.id
        and m.user_id = auth.uid()
    )
    or owner_user_id = auth.uid()
  );

drop policy if exists "organizations_insert_owner" on public.organizations;
create policy "organizations_insert_owner"
  on public.organizations for insert
  with check (owner_user_id = auth.uid());

drop policy if exists "organizations_update_owner_or_admin" on public.organizations;
create policy "organizations_update_owner_or_admin"
  on public.organizations for update
  using (
    owner_user_id = auth.uid()
    or exists (
      select 1
      from public.organization_members m
      where m.organization_id = organizations.id
        and m.user_id = auth.uid()
        and m.role = 'admin'
    )
  )
  with check (
    owner_user_id = auth.uid()
    or exists (
      select 1
      from public.organization_members m
      where m.organization_id = organizations.id
        and m.user_id = auth.uid()
        and m.role = 'admin'
    )
  );

drop policy if exists "organizations_delete_owner" on public.organizations;
create policy "organizations_delete_owner"
  on public.organizations for delete
  using (owner_user_id = auth.uid());

drop policy if exists "organization_members_select_same_organization" on public.organization_members;
create policy "organization_members_select_same_organization"
  on public.organization_members for select
  using (
    exists (
      select 1
      from public.organization_members self
      where self.organization_id = organization_members.organization_id
        and self.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.organizations o
      where o.id = organization_members.organization_id
        and o.owner_user_id = auth.uid()
    )
  );

drop policy if exists "organization_members_insert_self_owner_or_admin" on public.organization_members;
create policy "organization_members_insert_self_owner_or_admin"
  on public.organization_members for insert
  with check (
    user_id = auth.uid()
    or exists (
      select 1
      from public.organizations o
      where o.id = organization_members.organization_id
        and o.owner_user_id = auth.uid()
    )
    or exists (
      select 1
      from public.organization_members m
      where m.organization_id = organization_members.organization_id
        and m.user_id = auth.uid()
        and m.role = 'admin'
    )
  );

drop policy if exists "organization_members_delete_self_or_admin" on public.organization_members;
create policy "organization_members_delete_self_or_admin"
  on public.organization_members for delete
  using (
    user_id = auth.uid()
    or exists (
      select 1
      from public.organizations o
      where o.id = organization_members.organization_id
        and o.owner_user_id = auth.uid()
    )
    or exists (
      select 1
      from public.organization_members m
      where m.organization_id = organization_members.organization_id
        and m.user_id = auth.uid()
        and m.role = 'admin'
    )
  );

drop policy if exists "organization_app_data_select_member" on public.organization_app_data;
create policy "organization_app_data_select_member"
  on public.organization_app_data for select
  using (
    exists (
      select 1
      from public.organization_members m
      where m.organization_id = organization_app_data.organization_id
        and m.user_id = auth.uid()
    )
    or exists (
      select 1
      from public.organizations o
      where o.id = organization_app_data.organization_id
        and o.owner_user_id = auth.uid()
    )
  );

drop policy if exists "organization_app_data_insert_editor" on public.organization_app_data;
create policy "organization_app_data_insert_editor"
  on public.organization_app_data for insert
  with check (
    exists (
      select 1
      from public.organization_members m
      where m.organization_id = organization_app_data.organization_id
        and m.user_id = auth.uid()
        and m.role in ('admin', 'editor')
    )
    or exists (
      select 1
      from public.organizations o
      where o.id = organization_app_data.organization_id
        and o.owner_user_id = auth.uid()
    )
  );

drop policy if exists "organization_app_data_update_editor" on public.organization_app_data;
create policy "organization_app_data_update_editor"
  on public.organization_app_data for update
  using (
    exists (
      select 1
      from public.organization_members m
      where m.organization_id = organization_app_data.organization_id
        and m.user_id = auth.uid()
        and m.role in ('admin', 'editor')
    )
    or exists (
      select 1
      from public.organizations o
      where o.id = organization_app_data.organization_id
        and o.owner_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.organization_members m
      where m.organization_id = organization_app_data.organization_id
        and m.user_id = auth.uid()
        and m.role in ('admin', 'editor')
    )
    or exists (
      select 1
      from public.organizations o
      where o.id = organization_app_data.organization_id
        and o.owner_user_id = auth.uid()
    )
  );

drop policy if exists "organization_app_data_delete_owner" on public.organization_app_data;
create policy "organization_app_data_delete_owner"
  on public.organization_app_data for delete
  using (
    exists (
      select 1
      from public.organizations o
      where o.id = organization_app_data.organization_id
        and o.owner_user_id = auth.uid()
    )
  );
