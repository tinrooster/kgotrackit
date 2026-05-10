-- Add schematic_json column to plant_drawings for EasySchematic JSON round-trip workflow.
-- Stores the raw EasySchematic JSON uploaded by the user so cable assignments can be
-- persisted and the annotated export regenerated without re-uploading.

alter table public.plant_drawings
  add column if not exists schematic_json jsonb;

comment on column public.plant_drawings.schematic_json is
  'Raw EasySchematic JSON blob uploaded for this drawing. Edges are annotated with '
  'cable numbers on export (data.label + data.cableIdLabelMode="midpoint").';
