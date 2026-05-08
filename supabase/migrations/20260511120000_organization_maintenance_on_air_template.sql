-- Shared ON-AIR maintenance caution template per organization (JSON schedule keyed by weekday).

alter table public.organization_app_data
  add column if not exists maintenance_on_air_template jsonb;

comment on column public.organization_app_data.maintenance_on_air_template is
  'Optional org-wide default ON-AIR start times (HH:mm per weekday) for maintenance window cautions; null uses client demo fallback.';
