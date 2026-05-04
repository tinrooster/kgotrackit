-- Allow workspace owners to SELECT rows they own before a workspace_members row exists.
-- Without this, INSERT ... RETURNING (PostgREST: .insert().select('id')) fails RLS because
-- workspaces_select_member only matches existing members.

drop policy if exists "workspaces_select_owner" on public.workspaces;
create policy "workspaces_select_owner"
  on public.workspaces for select
  using (owner_user_id = auth.uid());
