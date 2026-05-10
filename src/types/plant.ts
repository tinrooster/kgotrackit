// ============================================================
// Plant module types
// Mirrors supabase/migrations/20260518120000_plant_schema.sql
// ============================================================


// ------------------------------------------------------------
// Locations
// ------------------------------------------------------------

export type PlantLocationRoomType =
  | 'rack_room'
  | 'jackfield'
  | 'frame'
  | 'transmission'
  | 'headend'
  | 'studio'
  | 'mtr'
  | 'other';

export type PlantLocationStatus =
  | 'active'
  | 'empty'
  | 'repurposed'
  | 'decommissioned';

export interface PlantLocation {
  id: string;
  organizationId: string;
  code: string;             // TK03, TRINIX, XMSN, VJF …
  name: string;             // "Technical Rack K-03"
  roomType: PlantLocationRoomType;
  status: PlantLocationStatus;
  parentId?: string;        // hierarchical parent location id
  notes?: string;
  createdAt: string;
  updatedAt: string;
}


// ------------------------------------------------------------
// Systems
// ------------------------------------------------------------

export type PlantSystemStatus = 'active' | 'decommissioned' | 'unknown';

export interface PlantSystem {
  id: string;
  organizationId: string;
  name: string;             // "Grass Valley Trinix"
  vendor?: string;          // "Grass Valley"
  productFamily?: string;   // "Trinix"
  matchTerms: string[];     // device-name keywords for campaign rules
  status: PlantSystemStatus;
  decommissionedOn?: string; // ISO date
  notes?: string;
  createdAt: string;
  updatedAt: string;
}


// ------------------------------------------------------------
// Drawings
// ------------------------------------------------------------

export type PlantDrawingSignalCategory =
  | 'video'
  | 'audio'
  | 'data'
  | 'control'
  | 'rf'
  | 'mixed'
  | 'other';

export type PlantDrawingStatus =
  | 'active'
  | 'legacy'
  | 'superseded'
  | 'decommissioned';

// EasySchematic JSON structure (subset we care about)
export interface EsNode {
  id: string;
  data: {
    label?: string;
    deviceType?: string;
    ports?: Array<{ id: string; label?: string; direction?: string; signalType?: string }>;
  };
}

export interface EsEdge {
  id: string;
  source: string;       // node id
  target: string;       // node id
  sourceHandle: string; // "{port_id}-out"
  targetHandle: string; // "{port_id}-in"
  data?: {
    label?: string;
    signalType?: string;
    cableIdLabelMode?: string;
  };
}

export interface EsSchematicJson {
  nodes: EsNode[];
  edges: EsEdge[];
  [key: string]: unknown;
}

export interface PlantDrawing {
  id: string;
  organizationId: string;
  dwgNumber: string;              // "22070", "3523-A VID", "[5001]"
  title?: string;
  signalCategory?: PlantDrawingSignalCategory;
  status: PlantDrawingStatus;
  dwgFilePath?: string;           // UNC/local path to .dwg
  visioFilePath?: string;         // UNC/local path to .vsd / .vsdx
  easyschematicId?: string;       // EasySchematic /schematics/:id
  easyschematicShareToken?: string;
  schematicJson?: EsSchematicJson; // stored EasySchematic JSON for connection assignment
  notes?: string;
  createdAt: string;
  updatedAt: string;
}


// ------------------------------------------------------------
// Cables
// ------------------------------------------------------------

export type PlantCableStatus =
  | 'unknown'         // imported from legacy, not verified
  | 'active'          // confirmed in service
  | 'review'          // manually flagged outside a campaign
  | 'decommissioning' // in an active cleanup campaign
  | 'decommissioned'  // confirmed out of service
  | 'archived';       // decommissioned + closed; hidden by default

export type PlantCableFamily =
  | 'belden_1855'
  | 'belden_1855a'
  | 'belden_1505'
  | 'belden_1505a'
  | 'belden_1694'
  | 'belden_1694a'
  | 'belden_9451'
  | 'belden_1504a'
  | 'belden_1800'
  | 'cat5'
  | 'cat5e'
  | 'cat6'
  | 'fiber_mm'
  | 'fiber_sm'
  | 'rg6'
  | 'lmr400'
  | 'triax'
  | 'rs422'
  | 'rs232'
  | 'hdmi'
  | 'dvi'
  | 'vga'
  | 'usb'
  | 'kvm'
  | 'phone'
  | 'other'
  | 'unknown';

export type PlantSignalType =
  | 'hd_sdi'
  | 'sdi'
  | 'analog_video'
  | 'audio_analog'
  | 'audio_aes'
  | 'audio_dante'
  | 'data_ethernet'
  | 'rf'
  | 'control_serial'
  | 'display'         // HDMI, DVI, VGA
  | 'fiber'
  | 'power'
  | 'other';

export interface PlantCable {
  id: string;
  organizationId: string;

  // Legacy identifiers (preserved from Access import)
  legacyId?: number;
  cableNumber?: string;       // NUMBER field ("50006")
  numc?: string;              // NUMC field ("GPGPS")
  legacyProjectId?: string;
  altDwg?: string;

  // Drawing reference
  drawingId?: string;

  // Origin
  originRaw: string;
  originLocationCode?: string;
  originDevice?: string;
  originPort?: string;

  // Destination
  destRaw: string;
  destLocationCode?: string;
  destDevice?: string;
  destPort?: string;

  // Classification
  cableFamily: PlantCableFamily;
  jacketColor?: string;
  wireTypeRaw?: string;       // original messy Wire Type text
  signalType: PlantSignalType;

  // Physical
  lengthRaw?: string;
  lengthFt?: number;

  // Lifecycle
  status: PlantCableStatus;
  verifiedAt?: string;
  verifiedBy?: string;        // user id

  notes?: string;
  createdAt: string;
  updatedAt: string;
}

// Lightweight version for table/list views (excludes *_raw fields)
export interface PlantCableSummary {
  id: string;
  cableNumber?: string;
  drawingId?: string;
  originLocationCode?: string;
  originDevice?: string;
  originPort?: string;
  destLocationCode?: string;
  destDevice?: string;
  destPort?: string;
  cableFamily: PlantCableFamily;
  jacketColor?: string;
  signalType: PlantSignalType;
  lengthFt?: number;
  status: PlantCableStatus;
  verifiedAt?: string;
  notes?: string;
}


// ------------------------------------------------------------
// Cleanup campaigns — rule types
// ------------------------------------------------------------

export interface SystemNameMatchRule {
  type: 'system_name_match';
  label: string;
  terms: string[];                          // matched against origin_device / dest_device
  fields: Array<'origin_device' | 'dest_device'>;
}

export interface LocationCodeMatchRule {
  type: 'location_code_match';
  label: string;
  codes: string[];                          // matched against origin_location_code / dest_location_code
}

export interface DrawingMatchRule {
  type: 'drawing_match';
  label: string;
  dwgNumbers: string[];
}

export interface CableFamilyMatchRule {
  type: 'cable_family_match';
  label: string;
  families: PlantCableFamily[];
}

export interface StatusMatchRule {
  type: 'status_match';
  label: string;
  statuses: PlantCableStatus[];
}

export interface VerifiedBeforeRule {
  type: 'verified_before';
  label: string;
  date: string;                             // ISO date; matches cables verified before this date OR never verified
}

export type PlantCampaignRule =
  | SystemNameMatchRule
  | LocationCodeMatchRule
  | DrawingMatchRule
  | CableFamilyMatchRule
  | StatusMatchRule
  | VerifiedBeforeRule;


// ------------------------------------------------------------
// Cleanup campaigns
// ------------------------------------------------------------

export type PlantCampaignStatus = 'draft' | 'active' | 'completed' | 'cancelled';

export interface PlantCleanupCampaign {
  id: string;
  organizationId: string;
  name: string;
  description?: string;
  status: PlantCampaignStatus;
  rules: PlantCampaignRule[];
  // Snapshot counts (set when campaign moves draft → active)
  matchedCount?: number;
  highCount?: number;
  mediumCount?: number;
  lowCount?: number;
  createdBy?: string;         // user id
  completedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}


// ------------------------------------------------------------
// Campaign items
// ------------------------------------------------------------

export type PlantCampaignItemConfidence = 'high' | 'medium' | 'low';

export type PlantCampaignItemReviewStatus =
  | 'pending'
  | 'confirmed_dead'   // decommission confirmed
  | 'repurposed'       // cable still live for a different purpose
  | 'needs_check'      // assigned for physical field verification
  | 'cleared';         // confirmed active; removed from campaign scope

export interface PlantCampaignItem {
  id: string;
  campaignId: string;
  cableId: string;
  confidence: PlantCampaignItemConfidence;
  matchedRules: number[];                   // 0-based indices into campaign.rules
  reviewStatus: PlantCampaignItemReviewStatus;
  reviewedBy?: string;                      // user id
  reviewedAt?: string;
  repurposeNotes?: string;
  createdAt: string;
  updatedAt: string;

  // Joined fields (populated by service queries, not stored in DB)
  cable?: PlantCableSummary;
}

// Campaign item with cable data joined — used in review queue views
export interface PlantCampaignItemWithCable extends PlantCampaignItem {
  cable: PlantCableSummary;
}


// ------------------------------------------------------------
// Decommission log
// ------------------------------------------------------------

export interface PlantDecommissionLogEntry {
  id: string;
  organizationId: string;
  cableId: string;
  campaignId?: string;
  decommissionedBy?: string;    // user id
  decommissionedAt: string;
  // Snapshots (self-contained record even if cable is later purged)
  cableNumberSnap?: string;
  originSnap?: string;
  destSnap?: string;
  drawingSnap?: string;
  reason?: string;
  notes?: string;
}


// ------------------------------------------------------------
// Utility: campaign preview result (returned before activating)
// ------------------------------------------------------------

export interface PlantCampaignPreview {
  totalMatched: number;
  highConfidence: number;
  mediumConfidence: number;
  lowConfidence: number;
  sampleCables: PlantCableSummary[];   // first 20 matches for UI preview
  ruleBreakdown: Array<{
    ruleIndex: number;
    label: string;
    matchCount: number;
  }>;
}


// ------------------------------------------------------------
// Utility: cable filter params (for cable register queries)
// ------------------------------------------------------------

export interface PlantCableFilters {
  organizationId: string;
  status?: PlantCableStatus[];
  signalType?: PlantSignalType[];
  cableFamily?: PlantCableFamily[];
  locationCode?: string;          // matches origin OR dest location code
  drawingId?: string;
  campaignId?: string;            // show cables in a specific campaign
  reviewStatus?: PlantCampaignItemReviewStatus[];
  search?: string;                // full-text (cable number, origin, dest, notes)
  page?: number;
  pageSize?: number;
}
