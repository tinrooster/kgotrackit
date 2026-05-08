-- Add productions column to user_app_data and workspace_app_data.
-- Productions are stored as a JSONB array of Production records (see src/types/productions.ts).

ALTER TABLE user_app_data
  ADD COLUMN IF NOT EXISTS productions jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE workspace_app_data
  ADD COLUMN IF NOT EXISTS productions jsonb NOT NULL DEFAULT '[]'::jsonb;
