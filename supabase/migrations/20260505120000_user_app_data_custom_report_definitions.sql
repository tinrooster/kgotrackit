-- Custom report definitions: same JSON array shape as localStorage key inventory-custom-report-definitions.
alter table public.user_app_data
  add column if not exists custom_report_definitions jsonb not null default '[]'::jsonb;

comment on column public.user_app_data.custom_report_definitions is
  'User-defined report definitions (id, name, columns, kind); client mirrors to localStorage for Reports page.';
