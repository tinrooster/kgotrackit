-- organization_app_data INSERT could still fail with 42501 when policies use plain EXISTS
-- over workspaces/organizations: RLS on those tables can hide rows during WITH CHECK evaluation.
-- Centralize writes in a SECURITY DEFINER helper with row_security off (same idea as is_organization_editor_or_admin).

create or replace function public.can_write_organization_app_data(
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

  if public.is_organization_editor_or_admin(p_organization_id, p_user_id) then
    return true;
  end if;

  if exists (
    select 1
    from public.organizations o
    where o.id = p_organization_id
      and o.owner_user_id = p_user_id
  ) then
    return true;
  end if;

  if exists (
    select 1
    from public.workspaces w
    inner join public.workspace_members wm
      on wm.workspace_id = w.id
     and wm.user_id = p_user_id
     and wm.role in ('admin', 'editor')
    where w.organization_id is not null
      and w.organization_id = p_organization_id
  ) then
    return true;
  end if;

  -- Workspace owner for a row linked to this org (owner may lack workspace_members in edge cases)
  if exists (
    select 1
    from public.workspaces w
    where w.organization_id = p_organization_id
      and w.owner_user_id = p_user_id
  ) then
    return true;
  end if;

  return false;
end;
$$;

alter function public.can_write_organization_app_data(uuid, uuid) owner to postgres;

grant execute on function public.can_write_organization_app_data(uuid, uuid) to authenticated;

drop policy if exists "organization_app_data_insert_editor" on public.organization_app_data;
create policy "organization_app_data_insert_editor"
  on public.organization_app_data for insert
  with check (public.can_write_organization_app_data(organization_id, auth.uid()));

drop policy if exists "organization_app_data_update_editor" on public.organization_app_data;
create policy "organization_app_data_update_editor"
  on public.organization_app_data for update
  using (public.can_write_organization_app_data(organization_id, auth.uid()))
  with check (public.can_write_organization_app_data(organization_id, auth.uid()));
