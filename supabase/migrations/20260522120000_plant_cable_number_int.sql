-- Add a stored generated column for numeric cable number sort.
-- NULL for non-numeric values (e.g. "BYPASS-3"); integer value otherwise.
-- This lets ORDER BY cable_number_int work correctly across all pages.

ALTER TABLE plant_cables
  ADD COLUMN IF NOT EXISTS cable_number_int integer
    GENERATED ALWAYS AS (
      CASE
        WHEN cable_number ~ '^-?[0-9]+$' THEN cable_number::integer
        ELSE NULL
      END
    ) STORED;

-- Index for fast paginated sort by org + numeric cable number
CREATE INDEX IF NOT EXISTS idx_plant_cables_org_cable_num_int
  ON plant_cables (organization_id, cable_number_int NULLS LAST, cable_number);
