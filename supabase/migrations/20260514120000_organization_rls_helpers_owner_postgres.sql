-- Full repair for organization_members 42P17 infinite recursion:
-- 1) Membership helpers must not re-apply RLS on their inner SELECT (row_security=off + definer).
-- 2) Function owner should match a role that bypasses RLS on public tables (typically postgres).
-- 3) Re-apply policies so environments that never picked up 20260512120000 / 20260513120000 are fixed.

create or replace function public.is_organization_member(
  p_organization_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
begin
  if p_organization_id is null or p_user_id is null then
    return false;
  end if;
  return exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = p_user_id
  );
end;
$$;

create or replace function public.is_organization_admin(
  p_organization_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
begin
  if p_organization_id is null or p_user_id is null then
    return false;
  end if;
  return exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = p_user_id
      and m.role = 'admin'
  );
end;
$$;

create or replace function public.is_organization_editor_or_admin(
  p_organization_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
set row_security = off
as $$
begin
  if p_organization_id is null or p_user_id is null then
    return false;
  end if;
  return exists (
    select 1
    from public.organization_members m
    where m.organization_id = p_organization_id
      and m.user_id = p_user_id
      and m.role in ('admin', 'editor')
  );
end;
$$;

alter function public.is_organization_member(uuid, uuid) owner to postgres;
alter function public.is_organization_admin(uuid, uuid) owner to postgres;
alter function public.is_organization_editor_or_admin(uuid, uuid) owner to postgres;

grant execute on function public.is_organization_member(uuid, uuid) to authenticated;
grant execute on function public.is_organization_admin(uuid, uuid) to authenticated;
grant execute on function public.is_organization_editor_or_admin(uuid, uuid) to authenticated;

-- Policies (same as 20260512120000; idempotent)

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

-- Same as 20260513120000 (avoid raw organization_members subquery on audit reads)

drop policy if exists "workspace_deletion_audit_select_actor_or_org_admin" on public.workspace_deletion_audit;
create policy "workspace_deletion_audit_select_actor_or_org_admin"
  on public.workspace_deletion_audit for select
  using (
    deleted_by_user_id = auth.uid()
    or (
      organization_id is not null
      and (
        public.is_organization_admin(workspace_deletion_audit.organization_id, auth.uid())
        or exists (
          select 1
          from public.organizations o
          where o.id = workspace_deletion_audit.organization_id
            and o.owner_user_id = auth.uid()
        )
      )
    )
  );
