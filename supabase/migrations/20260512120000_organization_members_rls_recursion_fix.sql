-- Break organization_members RLS self-reference (42P17 infinite recursion) by using
-- SECURITY DEFINER helpers, mirroring public.is_workspace_member / is_workspace_admin.

create or replace function public.is_organization_member(
  p_organization_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = p_user_id
  );
$$;

create or replace function public.is_organization_admin(
  p_organization_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = p_user_id
      and m.role = 'admin'
  );
$$;

create or replace function public.is_organization_editor_or_admin(
  p_organization_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = p_user_id
      and m.role in ('admin', 'editor')
  );
$$;

grant execute on function public.is_organization_member(uuid, uuid) to authenticated;
grant execute on function public.is_organization_admin(uuid, uuid) to authenticated;
grant execute on function public.is_organization_editor_or_admin(uuid, uuid) to authenticated;

drop policy if exists "organizations_select_member" on public.organizations;
create policy "organizations_select_member"
  on public.organizations for select
  using (
    public.is_organization_member(id, auth.uid())
    or owner_user_id = auth.uid()
  );

drop policy if exists "organizations_update_owner_or_admin" on public.organizations;
create policy "organizations_update_owner_or_admin"
  on public.organizations for update
  using (
    owner_user_id = auth.uid()
    or public.is_organization_admin(id, auth.uid())
  )
  with check (
    owner_user_id = auth.uid()
    or public.is_organization_admin(id, auth.uid())
  );

drop policy if exists "organization_members_select_same_organization" on public.organization_members;
create policy "organization_members_select_same_organization"
  on public.organization_members for select
  using (
    public.is_organization_member(organization_id, auth.uid())
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
    or public.is_organization_admin(organization_id, auth.uid())
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
    or public.is_organization_admin(organization_id, auth.uid())
  );

drop policy if exists "organization_app_data_select_member" on public.organization_app_data;
create policy "organization_app_data_select_member"
  on public.organization_app_data for select
  using (
    public.is_organization_member(organization_id, auth.uid())
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
    public.is_organization_editor_or_admin(organization_id, auth.uid())
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
    public.is_organization_editor_or_admin(organization_id, auth.uid())
    or exists (
      select 1
      from public.organizations o
      where o.id = organization_app_data.organization_id
        and o.owner_user_id = auth.uid()
    )
  )
  with check (
    public.is_organization_editor_or_admin(organization_id, auth.uid())
    or exists (
      select 1
      from public.organizations o
      where o.id = organization_app_data.organization_id
        and o.owner_user_id = auth.uid()
    )
  );
