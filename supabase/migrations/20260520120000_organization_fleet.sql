-- Fleet module: add fleet JSONB to organization_app_data.
-- Vehicles, subsystems, assignments, scheduled work, and active loans are
-- stored as a single org-scoped document (small, rewritten as a unit).

alter table public.organization_app_data
  add column if not exists fleet jsonb not null
    default '{"vehicles":[],"loans":[]}'::jsonb;

comment on column public.organization_app_data.fleet is
  'Organization fleet state: vehicle roster, crew assignments, subsystems, scheduled work, and active subsystem loans.';
