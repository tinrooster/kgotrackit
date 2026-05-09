-- Let workspace members read the organization row (e.g. name) for orgs linked to workspaces they belong to,
-- even when organization_members is missing or out of sync. Complements organizations_select_member (OR).

drop policy if exists "organizations_select_via_workspace_member" on public.organizations;
create policy "organizations_select_via_workspace_member"
  on public.organizations for select
  using (
    exists (
      select 1
      from public.workspaces w
      inner join public.workspace_members wm
        on wm.workspace_id = w.id
       and wm.user_id = auth.uid()
      where w.organization_id is not null
        and w.organization_id = organizations.id
    )
  );
