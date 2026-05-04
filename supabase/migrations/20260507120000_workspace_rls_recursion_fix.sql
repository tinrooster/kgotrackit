-- Fix workspace RLS recursion by moving membership checks into SECURITY DEFINER helpers.
-- Applies cleanly on existing environments without rebuilding tables.

create or replace function public.is_workspace_member(
  p_workspace_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = p_user_id
  );
$$;

create or replace function public.is_workspace_admin(
  p_workspace_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members m
    where m.workspace_id = p_workspace_id
      and m.user_id = p_user_id
      and m.role = 'admin'
  );
$$;

grant execute on function public.is_workspace_member(uuid, uuid) to authenticated;
grant execute on function public.is_workspace_admin(uuid, uuid) to authenticated;

drop policy if exists "workspaces_select_member" on public.workspaces;
create policy "workspaces_select_member"
  on public.workspaces for select
  using (public.is_workspace_member(id, auth.uid()));

drop policy if exists "workspace_members_select_same_workspace" on public.workspace_members;
create policy "workspace_members_select_same_workspace"
  on public.workspace_members for select
  using (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "workspace_members_insert_self_owner_or_admin" on public.workspace_members;
create policy "workspace_members_insert_self_owner_or_admin"
  on public.workspace_members for insert
  with check (
    (
      user_id = auth.uid()
      and exists (
        select 1 from public.workspaces w
        where w.id = workspace_id
          and w.owner_user_id = auth.uid()
      )
    )
    or public.is_workspace_admin(workspace_id, auth.uid())
  );

drop policy if exists "workspace_members_delete_self_or_admin" on public.workspace_members;
create policy "workspace_members_delete_self_or_admin"
  on public.workspace_members for delete
  using (
    user_id = auth.uid()
    or public.is_workspace_admin(workspace_id, auth.uid())
  );

drop policy if exists "workspace_app_data_select_member" on public.workspace_app_data;
create policy "workspace_app_data_select_member"
  on public.workspace_app_data for select
  using (public.is_workspace_member(workspace_id, auth.uid()));

drop policy if exists "workspace_app_data_insert_editor" on public.workspace_app_data;
create policy "workspace_app_data_insert_editor"
  on public.workspace_app_data for insert
  with check (
    exists (
      select 1
      from public.workspace_members m
      where m.workspace_id = workspace_app_data.workspace_id
        and m.user_id = auth.uid()
        and m.role in ('admin', 'editor')
    )
  );

drop policy if exists "workspace_app_data_update_editor" on public.workspace_app_data;
create policy "workspace_app_data_update_editor"
  on public.workspace_app_data for update
  using (
    exists (
      select 1
      from public.workspace_members m
      where m.workspace_id = workspace_app_data.workspace_id
        and m.user_id = auth.uid()
        and m.role in ('admin', 'editor')
    )
  )
  with check (
    exists (
      select 1
      from public.workspace_members m
      where m.workspace_id = workspace_app_data.workspace_id
        and m.user_id = auth.uid()
        and m.role in ('admin', 'editor')
    )
  );
