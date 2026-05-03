-- P3: shared workspace payload + membership (optional team DB alongside per-user user_app_data).
-- Client stores active workspace id in localStorage (trackit:active-workspace-id) when user switches team.

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('admin', 'editor', 'viewer')),
  primary key (workspace_id, user_id)
);

create table if not exists public.workspace_app_data (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  templates jsonb not null default '[]'::jsonb,
  history jsonb not null default '[]'::jsonb,
  cabinets jsonb not null default '[]'::jsonb,
  financial jsonb not null default '{}'::jsonb,
  ui_defaults jsonb,
  general_settings jsonb,
  custom_report_definitions jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.workspaces is 'trackIT team / shared inventory container.';
comment on table public.workspace_members is 'Membership and role for shared workspace payload.';
comment on table public.workspace_app_data is 'Same JSON snapshot shape as user_app_data, keyed by workspace.';

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_app_data enable row level security;

-- workspaces: visible to any member
create policy "workspaces_select_member"
  on public.workspaces for select
  using (
    exists (
      select 1 from public.workspace_members m
      where m.workspace_id = workspaces.id and m.user_id = auth.uid()
    )
  );

create policy "workspaces_insert_owner"
  on public.workspaces for insert
  with check (owner_user_id = auth.uid());

create policy "workspaces_update_owner"
  on public.workspaces for update
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

create policy "workspaces_delete_owner"
  on public.workspaces for delete
  using (owner_user_id = auth.uid());

-- workspace_members
create policy "workspace_members_select_same_workspace"
  on public.workspace_members for select
  using (
    exists (
      select 1 from public.workspace_members self
      where self.workspace_id = workspace_members.workspace_id
        and self.user_id = auth.uid()
    )
  );

create policy "workspace_members_insert_self_owner_or_admin"
  on public.workspace_members for insert
  with check (
    (
      user_id = auth.uid()
      and exists (
        select 1 from public.workspaces w
        where w.id = workspace_id and w.owner_user_id = auth.uid()
      )
    )
    or exists (
      select 1 from public.workspace_members m
      where m.workspace_id = workspace_members.workspace_id
        and m.user_id = auth.uid()
        and m.role = 'admin'
    )
  );

create policy "workspace_members_delete_self_or_admin"
  on public.workspace_members for delete
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.workspace_members m
      where m.workspace_id = workspace_members.workspace_id
        and m.user_id = auth.uid()
        and m.role = 'admin'
    )
  );

-- workspace_app_data: read all members; write editors+admins only
create policy "workspace_app_data_select_member"
  on public.workspace_app_data for select
  using (
    exists (
      select 1 from public.workspace_members m
      where m.workspace_id = workspace_app_data.workspace_id and m.user_id = auth.uid()
    )
  );

create policy "workspace_app_data_insert_editor"
  on public.workspace_app_data for insert
  with check (
    exists (
      select 1 from public.workspace_members m
      where m.workspace_id = workspace_app_data.workspace_id
        and m.user_id = auth.uid()
        and m.role in ('admin', 'editor')
    )
  );

create policy "workspace_app_data_update_editor"
  on public.workspace_app_data for update
  using (
    exists (
      select 1 from public.workspace_members m
      where m.workspace_id = workspace_app_data.workspace_id
        and m.user_id = auth.uid()
        and m.role in ('admin', 'editor')
    )
  )
  with check (
    exists (
      select 1 from public.workspace_members m
      where m.workspace_id = workspace_app_data.workspace_id
        and m.user_id = auth.uid()
        and m.role in ('admin', 'editor')
    )
  );

create policy "workspace_app_data_delete_owner_workspace"
  on public.workspace_app_data for delete
  using (
    exists (
      select 1 from public.workspaces w
      where w.id = workspace_app_data.workspace_id and w.owner_user_id = auth.uid()
    )
  );
