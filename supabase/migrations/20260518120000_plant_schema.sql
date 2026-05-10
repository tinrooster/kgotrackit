-- =============================================================
-- Plant module: cable plant lifecycle management
--
-- Tables:
--   plant_locations      facility map (rooms, racks, named frames)
--   plant_systems        known equipment systems / product families
--   plant_drawings       drawing register (DWG, Visio, EasySchematic)
--   plant_cables         cable register (imported from Access DB, ~45k rows)
--   plant_cleanup_campaigns  named decommission / cleanup review campaigns
--   plant_campaign_items     cables assigned to a campaign for review
--   plant_decommission_log   append-only audit trail of confirmed decommissions
--
-- RLS pattern mirrors organization_app_data:
--   SELECT  → any org member or org owner
--   INSERT/UPDATE → can_write_organization_app_data (editor/admin/owner)
--   DELETE  → is_organization_admin or org owner
--   plant_decommission_log has no UPDATE or DELETE policy (append-only).
-- =============================================================


-- ------------------------------------------------------------
-- plant_locations
-- The facility map. Each row is a named location whose code
-- appears as the first token in cable ORIGIN / DEST fields.
-- Supports a parent→child hierarchy (e.g. room → rack bay).
-- ------------------------------------------------------------
create table if not exists public.plant_locations (
  id               uuid        primary key default gen_random_uuid(),
  organization_id  uuid        not null references public.organizations (id) on delete cascade,

  code             text        not null,   -- TK03, TRINIX, XMSN, VJF …
  name             text        not null,   -- "Technical Rack K-03"
  room_type        text        not null    -- see check below
    check (room_type in (
      'rack_room', 'jackfield', 'frame', 'transmission',
      'headend', 'studio', 'mtr', 'other'
    )),
  status           text        not null default 'active'
    check (status in ('active', 'empty', 'repurposed', 'decommissioned')),

  parent_id        uuid        references public.plant_locations (id) on delete set null,
  notes            text,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  unique (organization_id, code)
);

comment on table public.plant_locations is
  'Facility map: location codes that prefix ORIGIN/DEST fields in plant_cables.';
comment on column public.plant_locations.code is
  'First-token prefix used in cable ORIGIN/DEST (e.g. TK03, TRINIX, XMSN).';
comment on column public.plant_locations.status is
  'active=in use; empty=rack vacated; repurposed=different use; decommissioned=removed.';


-- ------------------------------------------------------------
-- plant_systems
-- Named equipment systems / product families.
-- Used to drive system-name-match rules in cleanup campaigns.
-- ------------------------------------------------------------
create table if not exists public.plant_systems (
  id               uuid        primary key default gen_random_uuid(),
  organization_id  uuid        not null references public.organizations (id) on delete cascade,

  name             text        not null,   -- "Grass Valley Trinix"
  vendor           text,                   -- "Grass Valley"
  product_family   text,                   -- "Trinix"

  -- Terms used for text-matching against cable ORIGIN/DEST device fields.
  -- Stored as a jsonb string array so the campaign rule engine can reference
  -- a system's terms without duplicating them in every rule.
  match_terms      jsonb       not null default '[]'::jsonb,

  status           text        not null default 'unknown'
    check (status in ('active', 'decommissioned', 'unknown')),
  decommissioned_on date,

  notes            text,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.plant_systems is
  'Known equipment systems. match_terms drives system_name_match campaign rules.';
comment on column public.plant_systems.match_terms is
  'String array of device-name keywords (e.g. ["Trinix","TRINIX","GV TRINIX"]).';


-- ------------------------------------------------------------
-- plant_drawings
-- Drawing register. One row per DWG number.
-- Links to AutoCAD LT .dwg files, Visio .vsd files, and
-- EasySchematic cloud schematics via their API id.
-- ------------------------------------------------------------
create table if not exists public.plant_drawings (
  id                      uuid        primary key default gen_random_uuid(),
  organization_id         uuid        not null references public.organizations (id) on delete cascade,

  dwg_number              text        not null,   -- "22070", "3523-A VID", "[5001]"
  title                   text,
  signal_category         text
    check (signal_category in (
      'video', 'audio', 'data', 'control', 'rf', 'mixed', 'other'
    )),
  status                  text        not null default 'active'
    check (status in ('active', 'legacy', 'superseded', 'decommissioned')),

  -- File references (UNC paths or local paths; opened by the OS)
  dwg_file_path           text,       -- path to AutoCAD LT .dwg file
  visio_file_path         text,       -- path to Visio .vsd / .vsdx file

  -- EasySchematic integration
  easyschematic_id        text,       -- schematic id from the ES API
  easyschematic_share_token text,     -- public share token (for read-only link)

  notes                   text,

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  unique (organization_id, dwg_number)
);

comment on table public.plant_drawings is
  'Drawing register. Links DWG numbers to AutoCAD LT, Visio, and EasySchematic files.';
comment on column public.plant_drawings.dwg_file_path is
  'UNC or local path to the AutoCAD LT .dwg file (opened by the OS file handler).';
comment on column public.plant_drawings.easyschematic_id is
  'EasySchematic /schematics/:id. Populated when a schematic is created from this drawing.';


-- ------------------------------------------------------------
-- plant_cables
-- The cable register. Imported from the Access DB (~45 k rows).
-- All original field values are preserved in *_raw columns.
-- Parsed / normalised values are added alongside.
-- Status lifecycle: unknown → active | review → decommissioning
--                  → decommissioned → archived
-- ------------------------------------------------------------
create table if not exists public.plant_cables (
  id               uuid        primary key default gen_random_uuid(),
  organization_id  uuid        not null references public.organizations (id) on delete cascade,

  -- ---- Legacy identifiers (Access import, preserved verbatim) ----
  legacy_id        integer,            -- original ID field
  cable_number     text,               -- NUMBER field ("50006", "121399")
  numc             text,               -- NUMC field ("GPGPS", "GPGPV")
  legacy_project_id text,              -- original Project ID field
  alt_dwg          text,               -- Alternate Dwg field

  -- ---- Drawing reference ----
  drawing_id       uuid        references public.plant_drawings (id) on delete set null,

  -- ---- Origin (preserved + parsed) ----
  origin_raw       text        not null,          -- original ORIGIN text
  origin_location_code text,                      -- first space-delimited token
  origin_device    text,                          -- device label (middle tokens)
  origin_port      text,                          -- port / signal description (trailing tokens)

  -- ---- Destination (preserved + parsed) ----
  dest_raw         text        not null,          -- original DEST text
  dest_location_code text,
  dest_device      text,
  dest_port        text,

  -- ---- Cable classification ----
  -- cable_family: normalised Belden/connector family (see check list).
  -- Maps the ~300 Wire Type variants into ~20 canonical families.
  cable_family     text        not null default 'unknown'
    check (cable_family in (
      'belden_1855',   -- HD-SDI coax (standard)
      'belden_1855a',  -- HD-SDI coax (plenum)
      'belden_1505',   -- SDI coax
      'belden_1505a',  -- SDI coax (plenum)
      'belden_1694',   -- HD-SDI coax (low-loss)
      'belden_1694a',
      'belden_9451',   -- composite / analog video coax
      'belden_1504a',  -- stereo audio pair
      'belden_1800',   -- 1800-series variants (1800B, 1800F …)
      'cat5',
      'cat5e',
      'cat6',
      'fiber_mm',      -- multimode fiber
      'fiber_sm',      -- singlemode fiber
      'rg6',           -- consumer RF coax
      'lmr400',        -- heavy RF (antenna / satellite)
      'triax',         -- camera triax
      'rs422',
      'rs232',
      'hdmi',
      'dvi',
      'vga',
      'usb',
      'kvm',
      'phone',         -- flat satin / telephone conductor
      'other',
      'unknown'
    )),

  jacket_color     text,               -- normalised colour name ("blue", "yellow" …)
  wire_type_raw    text,               -- original Wire Type text (preserved)

  -- signal_type: higher-level signal category (inferred from cable_family + DWG suffix + port name)
  signal_type      text        not null default 'other'
    check (signal_type in (
      'hd_sdi',
      'sdi',
      'analog_video',
      'audio_analog',
      'audio_aes',
      'audio_dante',
      'data_ethernet',
      'rf',
      'control_serial',
      'display',       -- HDMI, DVI, VGA
      'fiber',
      'power',
      'other'
    )),

  -- ---- Physical ----
  length_raw       text,               -- original Length text ("66'", "50 feet approx")
  length_ft        numeric(8,1),       -- parsed numeric feet (null if unparseable)

  -- ---- Lifecycle ----
  -- unknown      → imported from legacy, not yet verified by an engineer
  -- active       → confirmed in service
  -- review       → manually flagged for engineer review (outside a campaign)
  -- decommissioning → currently in an active cleanup campaign
  -- decommissioned  → confirmed out of service; kept for historical reference
  -- archived     → decommissioned + administratively closed; hidden by default
  status           text        not null default 'unknown'
    check (status in (
      'unknown', 'active', 'review',
      'decommissioning', 'decommissioned', 'archived'
    )),

  verified_at      timestamptz,        -- when an engineer last confirmed this cable
  verified_by      uuid        references auth.users (id) on delete set null,

  notes            text,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.plant_cables is
  'Cable register. ~45k rows imported from legacy Access DB. '
  'All original values preserved in *_raw columns; parsed/normalised values added alongside.';
comment on column public.plant_cables.status is
  'Lifecycle: unknown (unverified legacy) → active | review → decommissioning '
  '→ decommissioned → archived.';
comment on column public.plant_cables.cable_family is
  'Normalised cable/connector family. Maps ~300 Wire Type variants to ~20 canonical values.';
comment on column public.plant_cables.signal_type is
  'High-level signal category inferred from cable_family, DWG suffix, and port labels.';


-- ------------------------------------------------------------
-- plant_cleanup_campaigns
-- A named, auditable decommission / cleanup review run.
-- Engineers configure rules, preview matches, then work through
-- the review queue in plant_campaign_items.
--
-- rules JSONB schema (array of rule objects):
--
-- system_name_match: flag cables whose origin_device or dest_device
--   contains any of the given terms.
--   { "type": "system_name_match",
--     "label": "Grass Valley products",
--     "terms": ["Trinix", "APEX", "K2", "GVG", "Miranda"],
--     "fields": ["origin_device", "dest_device"] }
--
-- location_code_match: flag cables whose origin_location_code or
--   dest_location_code exactly matches any of the given codes.
--   { "type": "location_code_match",
--     "label": "Known empty racks",
--     "codes": ["TRINIX", "APEX"] }
--
-- drawing_match: flag cables on specific drawings.
--   { "type": "drawing_match",
--     "label": "Legacy TK-area drawings",
--     "dwg_numbers": ["22070", "22071"] }
--
-- cable_family_match: flag cables of a given normalised family.
--   { "type": "cable_family_match",
--     "label": "Composite coax (likely analog era)",
--     "families": ["belden_9451"] }
--
-- status_match: flag cables in a given status (e.g. all 'unknown').
--   { "type": "status_match",
--     "label": "All unverified legacy records",
--     "statuses": ["unknown"] }
--
-- verified_before: flag cables not verified since a given date.
--   { "type": "verified_before",
--     "label": "Not checked in 3 years",
--     "date": "2023-01-01" }
--
-- Confidence calculation (set at preview/start time):
--   1 rule matched  → medium
--   2+ rules matched → high
--   Heuristic-only  → low
-- ------------------------------------------------------------
create table if not exists public.plant_cleanup_campaigns (
  id               uuid        primary key default gen_random_uuid(),
  organization_id  uuid        not null references public.organizations (id) on delete cascade,

  name             text        not null,
  description      text,

  status           text        not null default 'draft'
    check (status in ('draft', 'active', 'completed', 'cancelled')),

  rules            jsonb       not null default '[]'::jsonb,

  -- Snapshot counts set when campaign moves draft → active
  matched_count    integer,
  high_count       integer,
  medium_count     integer,
  low_count        integer,

  created_by       uuid        references auth.users (id) on delete set null,
  completed_at     timestamptz,
  notes            text,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.plant_cleanup_campaigns is
  'Named decommission / cleanup campaigns. rules is a JSONB array — see column comment for schema.';
comment on column public.plant_cleanup_campaigns.rules is
  'Array of rule objects. Types: system_name_match, location_code_match, drawing_match, '
  'cable_family_match, status_match, verified_before. See migration header for full schema.';


-- ------------------------------------------------------------
-- plant_campaign_items
-- Cables assigned to a campaign for engineer review.
-- A cable may appear in multiple campaigns (e.g. flagged by
-- two overlapping campaigns). review_status tracks per-campaign
-- disposition.
-- ------------------------------------------------------------
create table if not exists public.plant_campaign_items (
  id               uuid        primary key default gen_random_uuid(),
  campaign_id      uuid        not null references public.plant_cleanup_campaigns (id) on delete cascade,
  cable_id         uuid        not null references public.plant_cables (id) on delete cascade,

  -- Confidence is set when the campaign is activated (rule evaluation pass).
  confidence       text        not null default 'medium'
    check (confidence in ('high', 'medium', 'low')),

  -- Which rule indices (0-based) in campaign.rules triggered this item.
  matched_rules    jsonb       not null default '[]'::jsonb,

  review_status    text        not null default 'pending'
    check (review_status in (
      'pending',
      'confirmed_dead',  -- decommission confirmed; cable.status → decommissioned
      'repurposed',      -- cable is still live but for a different purpose; cable.status → active
      'needs_check',     -- assigned for physical field verification
      'cleared'          -- reviewed; confirmed active; removed from campaign scope
    )),

  reviewed_by      uuid        references auth.users (id) on delete set null,
  reviewed_at      timestamptz,

  -- If repurposed: free-text description of new purpose (used to update cable notes)
  repurpose_notes  text,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  unique (campaign_id, cable_id)
);

comment on table public.plant_campaign_items is
  'Per-campaign review queue. One row per (campaign, cable) pair.';
comment on column public.plant_campaign_items.review_status is
  'pending → confirmed_dead | repurposed | needs_check | cleared.';
comment on column public.plant_campaign_items.matched_rules is
  'Array of 0-based rule indices from campaign.rules that matched this cable.';


-- ------------------------------------------------------------
-- plant_decommission_log
-- Append-only audit trail. One row per confirmed decommission.
-- No UPDATE or DELETE RLS policy — rows are permanent records.
-- ------------------------------------------------------------
create table if not exists public.plant_decommission_log (
  id                  uuid        primary key default gen_random_uuid(),
  organization_id     uuid        not null references public.organizations (id) on delete cascade,

  cable_id            uuid        not null references public.plant_cables (id),
  campaign_id         uuid        references public.plant_cleanup_campaigns (id) on delete set null,

  decommissioned_by   uuid        references auth.users (id) on delete set null,
  decommissioned_at   timestamptz not null default now(),

  -- Snapshot of key cable fields at decommission time (so the record is self-contained
  -- even if the cable row is later archived / purged)
  cable_number_snap   text,
  origin_snap         text,
  dest_snap           text,
  drawing_snap        text,

  reason              text,       -- free-text (e.g. "Grass Valley Trinix decommission")
  notes               text
);

comment on table public.plant_decommission_log is
  'Append-only audit trail of confirmed cable decommissions. No UPDATE/DELETE policy.';
comment on column public.plant_decommission_log.cable_number_snap is
  'Snapshot of cable_number at decommission time for self-contained historical records.';


-- ============================================================
-- INDEXES
-- ============================================================

-- plant_locations
create index if not exists plant_locations_org_idx
  on public.plant_locations (organization_id);
create index if not exists plant_locations_status_idx
  on public.plant_locations (organization_id, status);

-- plant_systems
create index if not exists plant_systems_org_idx
  on public.plant_systems (organization_id);
create index if not exists plant_systems_status_idx
  on public.plant_systems (organization_id, status);

-- plant_drawings
create index if not exists plant_drawings_org_idx
  on public.plant_drawings (organization_id);
create index if not exists plant_drawings_status_idx
  on public.plant_drawings (organization_id, status);

-- plant_cables
create index if not exists plant_cables_org_idx
  on public.plant_cables (organization_id);
create index if not exists plant_cables_status_idx
  on public.plant_cables (organization_id, status);
create index if not exists plant_cables_drawing_idx
  on public.plant_cables (drawing_id);
create index if not exists plant_cables_origin_loc_idx
  on public.plant_cables (organization_id, origin_location_code);
create index if not exists plant_cables_dest_loc_idx
  on public.plant_cables (organization_id, dest_location_code);
create index if not exists plant_cables_cable_number_idx
  on public.plant_cables (organization_id, cable_number);
create index if not exists plant_cables_signal_type_idx
  on public.plant_cables (organization_id, signal_type);

-- Full-text search on origin_raw + dest_raw for cable register search bar.
-- tsvector is recomputed at write time; no separate trigger needed.
create index if not exists plant_cables_fts_idx
  on public.plant_cables
  using gin (
    to_tsvector('english',
      coalesce(cable_number, '') || ' ' ||
      coalesce(origin_raw, '')   || ' ' ||
      coalesce(dest_raw, '')     || ' ' ||
      coalesce(notes, '')
    )
  );

-- plant_cleanup_campaigns
create index if not exists plant_campaigns_org_idx
  on public.plant_cleanup_campaigns (organization_id);
create index if not exists plant_campaigns_status_idx
  on public.plant_cleanup_campaigns (organization_id, status);

-- plant_campaign_items
create index if not exists plant_campaign_items_campaign_idx
  on public.plant_campaign_items (campaign_id, review_status);
create index if not exists plant_campaign_items_cable_idx
  on public.plant_campaign_items (cable_id);

-- plant_decommission_log
create index if not exists plant_decomm_log_org_time_idx
  on public.plant_decommission_log (organization_id, decommissioned_at desc);
create index if not exists plant_decomm_log_cable_idx
  on public.plant_decommission_log (cable_id);
create index if not exists plant_decomm_log_campaign_idx
  on public.plant_decommission_log (campaign_id);


-- ============================================================
-- ROW LEVEL SECURITY
-- Uses existing helpers: is_organization_member,
-- is_organization_admin, can_write_organization_app_data
-- ============================================================

alter table public.plant_locations           enable row level security;
alter table public.plant_systems             enable row level security;
alter table public.plant_drawings            enable row level security;
alter table public.plant_cables              enable row level security;
alter table public.plant_cleanup_campaigns   enable row level security;
alter table public.plant_campaign_items      enable row level security;
alter table public.plant_decommission_log    enable row level security;


-- ---- Helper: is org owner (reused across all policies below) ----
-- (inline subquery; no extra function needed)


-- ---- plant_locations ----

drop policy if exists "plant_locations_select_member" on public.plant_locations;
create policy "plant_locations_select_member"
  on public.plant_locations for select
  using (
    public.is_organization_member(organization_id, auth.uid())
    or exists (
      select 1 from public.organizations o
      where o.id = plant_locations.organization_id
        and o.owner_user_id = auth.uid()
    )
  );

drop policy if exists "plant_locations_insert_editor" on public.plant_locations;
create policy "plant_locations_insert_editor"
  on public.plant_locations for insert
  with check (public.can_write_organization_app_data(organization_id, auth.uid()));

drop policy if exists "plant_locations_update_editor" on public.plant_locations;
create policy "plant_locations_update_editor"
  on public.plant_locations for update
  using  (public.can_write_organization_app_data(organization_id, auth.uid()))
  with check (public.can_write_organization_app_data(organization_id, auth.uid()));

drop policy if exists "plant_locations_delete_admin" on public.plant_locations;
create policy "plant_locations_delete_admin"
  on public.plant_locations for delete
  using (
    public.is_organization_admin(organization_id, auth.uid())
    or exists (
      select 1 from public.organizations o
      where o.id = plant_locations.organization_id
        and o.owner_user_id = auth.uid()
    )
  );


-- ---- plant_systems ----

drop policy if exists "plant_systems_select_member" on public.plant_systems;
create policy "plant_systems_select_member"
  on public.plant_systems for select
  using (
    public.is_organization_member(organization_id, auth.uid())
    or exists (
      select 1 from public.organizations o
      where o.id = plant_systems.organization_id
        and o.owner_user_id = auth.uid()
    )
  );

drop policy if exists "plant_systems_insert_editor" on public.plant_systems;
create policy "plant_systems_insert_editor"
  on public.plant_systems for insert
  with check (public.can_write_organization_app_data(organization_id, auth.uid()));

drop policy if exists "plant_systems_update_editor" on public.plant_systems;
create policy "plant_systems_update_editor"
  on public.plant_systems for update
  using  (public.can_write_organization_app_data(organization_id, auth.uid()))
  with check (public.can_write_organization_app_data(organization_id, auth.uid()));

drop policy if exists "plant_systems_delete_admin" on public.plant_systems;
create policy "plant_systems_delete_admin"
  on public.plant_systems for delete
  using (
    public.is_organization_admin(organization_id, auth.uid())
    or exists (
      select 1 from public.organizations o
      where o.id = plant_systems.organization_id
        and o.owner_user_id = auth.uid()
    )
  );


-- ---- plant_drawings ----

drop policy if exists "plant_drawings_select_member" on public.plant_drawings;
create policy "plant_drawings_select_member"
  on public.plant_drawings for select
  using (
    public.is_organization_member(organization_id, auth.uid())
    or exists (
      select 1 from public.organizations o
      where o.id = plant_drawings.organization_id
        and o.owner_user_id = auth.uid()
    )
  );

drop policy if exists "plant_drawings_insert_editor" on public.plant_drawings;
create policy "plant_drawings_insert_editor"
  on public.plant_drawings for insert
  with check (public.can_write_organization_app_data(organization_id, auth.uid()));

drop policy if exists "plant_drawings_update_editor" on public.plant_drawings;
create policy "plant_drawings_update_editor"
  on public.plant_drawings for update
  using  (public.can_write_organization_app_data(organization_id, auth.uid()))
  with check (public.can_write_organization_app_data(organization_id, auth.uid()));

drop policy if exists "plant_drawings_delete_admin" on public.plant_drawings;
create policy "plant_drawings_delete_admin"
  on public.plant_drawings for delete
  using (
    public.is_organization_admin(organization_id, auth.uid())
    or exists (
      select 1 from public.organizations o
      where o.id = plant_drawings.organization_id
        and o.owner_user_id = auth.uid()
    )
  );


-- ---- plant_cables ----

drop policy if exists "plant_cables_select_member" on public.plant_cables;
create policy "plant_cables_select_member"
  on public.plant_cables for select
  using (
    public.is_organization_member(organization_id, auth.uid())
    or exists (
      select 1 from public.organizations o
      where o.id = plant_cables.organization_id
        and o.owner_user_id = auth.uid()
    )
  );

drop policy if exists "plant_cables_insert_editor" on public.plant_cables;
create policy "plant_cables_insert_editor"
  on public.plant_cables for insert
  with check (public.can_write_organization_app_data(organization_id, auth.uid()));

drop policy if exists "plant_cables_update_editor" on public.plant_cables;
create policy "plant_cables_update_editor"
  on public.plant_cables for update
  using  (public.can_write_organization_app_data(organization_id, auth.uid()))
  with check (public.can_write_organization_app_data(organization_id, auth.uid()));

-- Cables are never hard-deleted via the app; archived status is the end state.
-- Admin-only hard delete is a safety valve for accidental imports.
drop policy if exists "plant_cables_delete_admin" on public.plant_cables;
create policy "plant_cables_delete_admin"
  on public.plant_cables for delete
  using (
    public.is_organization_admin(organization_id, auth.uid())
    or exists (
      select 1 from public.organizations o
      where o.id = plant_cables.organization_id
        and o.owner_user_id = auth.uid()
    )
  );


-- ---- plant_cleanup_campaigns ----

drop policy if exists "plant_campaigns_select_member" on public.plant_cleanup_campaigns;
create policy "plant_campaigns_select_member"
  on public.plant_cleanup_campaigns for select
  using (
    public.is_organization_member(organization_id, auth.uid())
    or exists (
      select 1 from public.organizations o
      where o.id = plant_cleanup_campaigns.organization_id
        and o.owner_user_id = auth.uid()
    )
  );

drop policy if exists "plant_campaigns_insert_editor" on public.plant_cleanup_campaigns;
create policy "plant_campaigns_insert_editor"
  on public.plant_cleanup_campaigns for insert
  with check (public.can_write_organization_app_data(organization_id, auth.uid()));

drop policy if exists "plant_campaigns_update_editor" on public.plant_cleanup_campaigns;
create policy "plant_campaigns_update_editor"
  on public.plant_cleanup_campaigns for update
  using  (public.can_write_organization_app_data(organization_id, auth.uid()))
  with check (public.can_write_organization_app_data(organization_id, auth.uid()));

drop policy if exists "plant_campaigns_delete_admin" on public.plant_cleanup_campaigns;
create policy "plant_campaigns_delete_admin"
  on public.plant_cleanup_campaigns for delete
  using (
    public.is_organization_admin(organization_id, auth.uid())
    or exists (
      select 1 from public.organizations o
      where o.id = plant_cleanup_campaigns.organization_id
        and o.owner_user_id = auth.uid()
    )
  );


-- ---- plant_campaign_items ----

drop policy if exists "plant_campaign_items_select_member" on public.plant_campaign_items;
create policy "plant_campaign_items_select_member"
  on public.plant_campaign_items for select
  using (
    exists (
      select 1
      from public.plant_cleanup_campaigns c
      where c.id = plant_campaign_items.campaign_id
        and (
          public.is_organization_member(c.organization_id, auth.uid())
          or exists (
            select 1 from public.organizations o
            where o.id = c.organization_id
              and o.owner_user_id = auth.uid()
          )
        )
    )
  );

drop policy if exists "plant_campaign_items_insert_editor" on public.plant_campaign_items;
create policy "plant_campaign_items_insert_editor"
  on public.plant_campaign_items for insert
  with check (
    exists (
      select 1
      from public.plant_cleanup_campaigns c
      where c.id = plant_campaign_items.campaign_id
        and public.can_write_organization_app_data(c.organization_id, auth.uid())
    )
  );

drop policy if exists "plant_campaign_items_update_editor" on public.plant_campaign_items;
create policy "plant_campaign_items_update_editor"
  on public.plant_campaign_items for update
  using (
    exists (
      select 1
      from public.plant_cleanup_campaigns c
      where c.id = plant_campaign_items.campaign_id
        and public.can_write_organization_app_data(c.organization_id, auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.plant_cleanup_campaigns c
      where c.id = plant_campaign_items.campaign_id
        and public.can_write_organization_app_data(c.organization_id, auth.uid())
    )
  );

drop policy if exists "plant_campaign_items_delete_admin" on public.plant_campaign_items;
create policy "plant_campaign_items_delete_admin"
  on public.plant_campaign_items for delete
  using (
    exists (
      select 1
      from public.plant_cleanup_campaigns c
      join public.organizations o on o.id = c.organization_id
      where c.id = plant_campaign_items.campaign_id
        and (
          public.is_organization_admin(c.organization_id, auth.uid())
          or o.owner_user_id = auth.uid()
        )
    )
  );


-- ---- plant_decommission_log (append-only — SELECT + INSERT only) ----

drop policy if exists "plant_decomm_log_select_member" on public.plant_decommission_log;
create policy "plant_decomm_log_select_member"
  on public.plant_decommission_log for select
  using (
    public.is_organization_member(organization_id, auth.uid())
    or exists (
      select 1 from public.organizations o
      where o.id = plant_decommission_log.organization_id
        and o.owner_user_id = auth.uid()
    )
  );

drop policy if exists "plant_decomm_log_insert_editor" on public.plant_decommission_log;
create policy "plant_decomm_log_insert_editor"
  on public.plant_decommission_log for insert
  with check (public.can_write_organization_app_data(organization_id, auth.uid()));

-- Intentionally no UPDATE or DELETE policy — log rows are permanent.
