ALTER TABLE user_app_data
  ADD COLUMN IF NOT EXISTS crew_contacts jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE workspace_app_data
  ADD COLUMN IF NOT EXISTS crew_contacts jsonb NOT NULL DEFAULT '[]'::jsonb;
