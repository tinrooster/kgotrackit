-- Audit log for workspace deletions.
-- Keeps a durable record after workspace + related rows are deleted.

create table if not exists public.workspace_deletion_audit (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  workspace_name text not null,
  organization_id uuid references public.organizations (id) on delete set null,
  deleted_by_user_id uuid references auth.users (id) on delete set null,
  deleted_by_email text,
  deleted_by_role text,
  member_count integer not null default 0,
  had_workspace_app_data boolean not null default false,
  deletion_source text not null default 'workspace-member-admin',
  deleted_at timestamptz not null default now()
);

comment on table public.workspace_deletion_audit is 'Immutable audit trail for deleted workspaces.';

create index if not exists workspace_deletion_audit_deleted_at_idx
  on public.workspace_deletion_audit (deleted_at desc);

create index if not exists workspace_deletion_audit_workspace_id_idx
  on public.workspace_deletion_audit (workspace_id);

create index if not exists workspace_deletion_audit_organization_id_idx
  on public.workspace_deletion_audit (organization_id);

alter table public.workspace_deletion_audit enable row level security;

drop policy if exists "workspace_deletion_audit_select_actor_or_org_admin" on public.workspace_deletion_audit;
create policy "workspace_deletion_audit_select_actor_or_org_admin"
  on public.workspace_deletion_audit for select
  using (
    deleted_by_user_id = auth.uid()
    or (
      organization_id is not null
      and (
        exists (
          select 1
          from public.organization_members m
          where m.organization_id = workspace_deletion_audit.organization_id
            and m.user_id = auth.uid()
            and m.role = 'admin'
        )
        or exists (
          select 1
          from public.organizations o
          where o.id = workspace_deletion_audit.organization_id
            and o.owner_user_id = auth.uid()
        )
      )
    )
  );
