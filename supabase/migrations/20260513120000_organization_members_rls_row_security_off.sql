-- RLS still applies to queries inside plain SECURITY DEFINER SQL functions unless the
-- function session disables row security for its body. Without this, evaluating
-- organization_members policies can re-enter those policies → 42P17 infinite recursion.
-- SET row_security = off is scoped to the function and reverts on exit (PostgreSQL).

create or replace function public.is_organization_member(
  p_organization_id uuid,
  p_user_id uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
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
stable
security definer
set search_path = public
set row_security = off
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
stable
security definer
set search_path = public
set row_security = off
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

-- Avoid a direct organization_members subquery here (same recursion class as the old policies).
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
