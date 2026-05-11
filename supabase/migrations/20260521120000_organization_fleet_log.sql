-- Fleet status log: append-only event table for the fleet module.
-- Volume-driven: ~10 entries/day × 365 = thousands/year.
-- Stored separately from fleet JSONB so it gets proper timestamps,
-- per-row RLS, and efficient GIN index on vehicle_ids.

create table if not exists public.organization_fleet_log (
  id                  uuid        primary key default gen_random_uuid(),
  organization_id     uuid        not null references public.organizations (id) on delete cascade,
  occurred_at         timestamptz not null default now(),
  author_user_id      uuid        not null references auth.users (id) on delete cascade,
  author_display_name text,
  vehicle_ids         text[]      not null default '{}',
  category            text        not null check (category in ('issue','scheduled','resolved','reassignment','location','info')),
  body                text        not null,
  scheduled_work_id   text,
  attachments         jsonb       not null default '[]'::jsonb
);

comment on table public.organization_fleet_log is
  'Append-only status log for fleet vehicles. Modeled on the daily Fortin-style update emails.';

create index if not exists fleet_log_org_occurred_idx
  on public.organization_fleet_log (organization_id, occurred_at desc);

create index if not exists fleet_log_vehicle_ids_idx
  on public.organization_fleet_log using gin (vehicle_ids);

alter table public.organization_fleet_log enable row level security;

-- Any org member (including viewer) can read log entries
drop policy if exists "fleet_log_select_member" on public.organization_fleet_log;
create policy "fleet_log_select_member"
  on public.organization_fleet_log for select
  using (
    exists (
      select 1 from public.organization_members m
      where m.organization_id = organization_fleet_log.organization_id
        and m.user_id = auth.uid()
    )
    or exists (
      select 1 from public.organizations o
      where o.id = organization_fleet_log.organization_id
        and o.owner_user_id = auth.uid()
    )
  );

-- Editor / admin / owner can insert; must be their own author_user_id
drop policy if exists "fleet_log_insert_editor" on public.organization_fleet_log;
create policy "fleet_log_insert_editor"
  on public.organization_fleet_log for insert
  with check (
    author_user_id = auth.uid()
    and (
      exists (
        select 1 from public.organization_members m
        where m.organization_id = organization_fleet_log.organization_id
          and m.user_id = auth.uid()
          and m.role in ('admin', 'editor')
      )
      or exists (
        select 1 from public.organizations o
        where o.id = organization_fleet_log.organization_id
          and o.owner_user_id = auth.uid()
      )
    )
  );

-- Admin / owner can delete any entry; editors can delete their own
drop policy if exists "fleet_log_delete_admin_or_author" on public.organization_fleet_log;
create policy "fleet_log_delete_admin_or_author"
  on public.organization_fleet_log for delete
  using (
    author_user_id = auth.uid()
    or exists (
      select 1 from public.organization_members m
      where m.organization_id = organization_fleet_log.organization_id
        and m.user_id = auth.uid()
        and m.role = 'admin'
    )
    or exists (
      select 1 from public.organizations o
      where o.id = organization_fleet_log.organization_id
        and o.owner_user_id = auth.uid()
    )
  );
