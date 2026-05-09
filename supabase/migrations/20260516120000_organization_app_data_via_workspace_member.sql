-- Workspace admins/editors can upsert organization_app_data when their workspace is linked to that org,
-- even if organization_members was never created for them (team invite path).

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
    or exists (
      select 1
      from public.workspaces w
      inner join public.workspace_members wm
        on wm.workspace_id = w.id
       and wm.user_id = auth.uid()
       and wm.role in ('admin', 'editor')
      where w.organization_id is not null
        and w.organization_id = organization_app_data.organization_id
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
    or exists (
      select 1
      from public.workspaces w
      inner join public.workspace_members wm
        on wm.workspace_id = w.id
       and wm.user_id = auth.uid()
       and wm.role in ('admin', 'editor')
      where w.organization_id is not null
        and w.organization_id = organization_app_data.organization_id
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
    or exists (
      select 1
      from public.workspaces w
      inner join public.workspace_members wm
        on wm.workspace_id = w.id
       and wm.user_id = auth.uid()
       and wm.role in ('admin', 'editor')
      where w.organization_id is not null
        and w.organization_id = organization_app_data.organization_id
    )
  );
