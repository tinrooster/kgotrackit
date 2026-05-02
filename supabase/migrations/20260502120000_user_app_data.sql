-- Per-user app payload for trackIT. Run in Supabase SQL editor or via CLI.
-- RLS: users may only read/write their own row.

create table if not exists public.user_app_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  items jsonb not null default '[]'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  templates jsonb not null default '[]'::jsonb,
  history jsonb not null default '[]'::jsonb,
  cabinets jsonb not null default '[]'::jsonb,
  financial jsonb not null default '{}'::jsonb,
  ui_defaults jsonb,
  general_settings jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_app_data enable row level security;

create policy "user_app_data_select_own"
  on public.user_app_data for select
  using (auth.uid() = user_id);

create policy "user_app_data_insert_own"
  on public.user_app_data for insert
  with check (auth.uid() = user_id);

create policy "user_app_data_update_own"
  on public.user_app_data for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "user_app_data_delete_own"
  on public.user_app_data for delete
  using (auth.uid() = user_id);
