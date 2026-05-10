import { getSupabase } from '@/lib/supabase/client';
import { getActiveOrganizationId } from '@/lib/supabase/organizationData';
import type {
  PlantCable,
  PlantCableSummary,
  PlantCableStatus,
  PlantSignalType,
  PlantDrawing,
  PlantLocation,
  PlantSystem,
  PlantCableFilters,
  PlantCleanupCampaign,
  PlantCampaignStatus,
  PlantCampaignRule,
  PlantCampaignItem,
  PlantCampaignItemReviewStatus,
  PlantCampaignPreview,
} from '@/types/plant';

export const PLANT_CABLES_UPDATED_EVENT = 'trackit:plant-cables-updated';
export const PAGE_SIZE = 50;

// ---------------------------------------------------------------------------
// Cable queries
// ---------------------------------------------------------------------------

export interface PlantCableListResult {
  cables: PlantCableSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export async function listCables(
  filters: Omit<PlantCableFilters, 'organizationId'> = {}
): Promise<PlantCableListResult> {
  const client = getSupabase();
  const orgId = getActiveOrganizationId();
  if (!client || !orgId) return { cables: [], total: 0, page: 0, pageSize: PAGE_SIZE };

  const page = filters.page ?? 0;
  const pageSize = filters.pageSize ?? PAGE_SIZE;
  const from = page * pageSize;
  const to = from + pageSize - 1;

  let query = client
    .from('plant_cables')
    .select(
      'id,cable_number,drawing_id,origin_location_code,origin_device,origin_port,' +
      'dest_location_code,dest_device,dest_port,cable_family,jacket_color,' +
      'signal_type,length_ft,status,verified_at,notes',
      { count: 'exact' }
    )
    .eq('organization_id', orgId);

  // Status filter
  if (filters.status && filters.status.length > 0) {
    query = query.in('status', filters.status);
  } else {
    // Hide archived by default
    query = query.neq('status', 'archived');
  }

  if (filters.signalType && filters.signalType.length > 0) {
    query = query.in('signal_type', filters.signalType);
  }

  if (filters.locationCode) {
    query = query.or(
      `origin_location_code.eq.${filters.locationCode},dest_location_code.eq.${filters.locationCode}`
    );
  }

  if (filters.drawingId) {
    query = query.eq('drawing_id', filters.drawingId);
  }

  if (filters.search && filters.search.trim()) {
    const term = `%${filters.search.trim()}%`;
    query = query.or(
      `cable_number.ilike.${term},origin_raw.ilike.${term},dest_raw.ilike.${term},notes.ilike.${term}`
    );
  }

  query = query.order('cable_number', { ascending: true, nullsFirst: false }).range(from, to);

  const { data, error, count } = await query;
  if (error) {
    console.error('[plantService] listCables error', error);
    return { cables: [], total: 0, page, pageSize };
  }

  const cables: PlantCableSummary[] = (data ?? []).map(rowToSummary);
  return { cables, total: count ?? 0, page, pageSize };
}

export interface PlantCableStats {
  total: number;
  unknown: number;
  active: number;
  review: number;
  decommissioning: number;
  decommissioned: number;
  activeCampaigns: number;
}

export async function getCableStats(): Promise<PlantCableStats> {
  const client = getSupabase();
  const orgId = getActiveOrganizationId();
  if (!client || !orgId) {
    return { total: 0, unknown: 0, active: 0, review: 0, decommissioning: 0, decommissioned: 0, activeCampaigns: 0 };
  }

  const countStatus = async (status: string) => {
    const { count } = await client
      .from('plant_cables')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('status', status);
    return count ?? 0;
  };

  const countCampaigns = async () => {
    const { count } = await client
      .from('plant_cleanup_campaigns')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('status', 'active');
    return count ?? 0;
  };

  const [unknown, active, review, decommissioning, decommissioned, activeCampaigns] =
    await Promise.all([
      countStatus('unknown'),
      countStatus('active'),
      countStatus('review'),
      countStatus('decommissioning'),
      countStatus('decommissioned'),
      countCampaigns(),
    ]);

  return {
    total: unknown + active + review + decommissioning + decommissioned,
    unknown,
    active,
    review,
    decommissioning,
    decommissioned,
    activeCampaigns,
  };
}

// ---------------------------------------------------------------------------
// EasySchematic CSV export (per-port device format)
// ---------------------------------------------------------------------------

const SIGNAL_TYPE_TO_ES: Record<PlantSignalType, string> = {
  hd_sdi:        'sdi',
  sdi:           'sdi',
  analog_video:  'composite-video',
  audio_analog:  'analog',
  audio_aes:     'aes',
  audio_dante:   'dante',
  data_ethernet: 'ethernet',
  rf:            'rf',
  control_serial:'rs232',
  display:       'hdmi',
  fiber:         'fiber',
  power:         'power',
  other:         '',
};

export async function exportDrawingEasySchematicCSV(drawingId: string): Promise<string> {
  // Collect all cables for this drawing (page through all results)
  const allCables: PlantCableSummary[] = [];
  let page = 0;
  const pageSize = 1000;
  while (true) {
    const result = await listCables({ drawingId, page, pageSize });
    allCables.push(...result.cables);
    if (allCables.length >= result.total || result.cables.length < pageSize) break;
    page++;
  }

  // Build device → port map
  // Key: `device::port`, value: { device, port, signalType, asOrigin, asDest }
  const portMap = new Map<string, { device: string; port: string; signalType: string; asOrigin: boolean; asDest: boolean }>();

  const addPort = (device: string | undefined, port: string | undefined, signalType: PlantSignalType, isOrigin: boolean) => {
    if (!device) return;
    const portLabel = port || 'Port';
    const key = `${device}::${portLabel}`;
    const esSignal = SIGNAL_TYPE_TO_ES[signalType] ?? '';
    const existing = portMap.get(key);
    if (existing) {
      if (isOrigin) existing.asOrigin = true;
      else existing.asDest = true;
    } else {
      portMap.set(key, { device, port: portLabel, signalType: esSignal, asOrigin: isOrigin, asDest: !isOrigin });
    }
  };

  for (const c of allCables) {
    addPort(c.originDevice, c.originPort, c.signalType, true);
    addPort(c.destDevice, c.destPort, c.signalType, false);
  }

  const esc = (v: string) => v.includes(',') || v.includes('"') || v.includes('\n')
    ? `"${v.replace(/"/g, '""')}"` : v;

  const header = 'model_number,label,device_type,port_label,port_signal_type,port_direction';
  const rows = [...portMap.values()].map((p) => {
    const dir = p.asOrigin && p.asDest ? 'bidirectional'
              : p.asOrigin ? 'output'
              : 'input';
    return [esc(p.device), esc(p.device), '', esc(p.port), esc(p.signalType), dir].join(',');
  });

  return [header, ...rows].join('\r\n');
}

export async function exportCablesCSV(
  filters: Omit<PlantCableFilters, 'organizationId' | 'page' | 'pageSize'> = {}
): Promise<string> {
  const client = getSupabase();
  const orgId = getActiveOrganizationId();
  if (!client || !orgId) return '';

  const allRows: PlantCableSummary[] = [];
  let page = 0;
  const pageSize = 1000;

  while (true) {
    const result = await listCables({ ...filters, page, pageSize });
    allRows.push(...result.cables);
    if (allRows.length >= result.total || result.cables.length < pageSize) break;
    page++;
  }

  const headers = ['Cable #', 'Origin', 'Origin Loc', 'Destination', 'Dest Loc', 'Signal', 'Cable Family', 'Length ft', 'Status', 'Verified', 'Notes'];
  const escape = (v: string | number | undefined | null) => {
    if (v == null) return '';
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const lines = [
    headers.join(','),
    ...allRows.map((c) => [
      escape(c.cableNumber),
      escape([c.originDevice, c.originPort].filter(Boolean).join(':')),
      escape(c.originLocationCode),
      escape([c.destDevice, c.destPort].filter(Boolean).join(':')),
      escape(c.destLocationCode),
      escape(c.signalType ? SIGNAL_TYPE_LABELS[c.signalType] : ''),
      escape(c.cableFamily),
      escape(c.lengthFt),
      escape(STATUS_LABELS[c.status]),
      escape(c.verifiedAt ? new Date(c.verifiedAt).toLocaleDateString() : ''),
      escape(c.notes),
    ].join(',')),
  ];

  return lines.join('\r\n');
}

export async function getCable(id: string): Promise<PlantCable | null> {
  const client = getSupabase();
  if (!client) return null;
  const { data, error } = await client
    .from('plant_cables')
    .select('*')
    .eq('id', id)
    .single();
  if (error || !data) return null;
  return rowToCable(data);
}

export async function verifyCable(id: string, userId: string): Promise<boolean> {
  const client = getSupabase();
  if (!client) return false;
  const { error } = await client
    .from('plant_cables')
    .update({
      status: 'active',
      verified_at: new Date().toISOString(),
      verified_by: userId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (!error) dispatchUpdate();
  return !error;
}

export async function setCableStatus(id: string, status: PlantCableStatus, notes?: string): Promise<boolean> {
  const client = getSupabase();
  if (!client) return false;
  const update: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (notes !== undefined) update.notes = notes;
  const { error } = await client.from('plant_cables').update(update).eq('id', id);
  if (!error) dispatchUpdate();
  return !error;
}

export async function updateCableNotes(id: string, notes: string): Promise<boolean> {
  const client = getSupabase();
  if (!client) return false;
  const { error } = await client
    .from('plant_cables')
    .update({ notes, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (!error) dispatchUpdate();
  return !error;
}

// ---------------------------------------------------------------------------
// Drawing queries
// ---------------------------------------------------------------------------

export async function listDrawings(): Promise<PlantDrawing[]> {
  const client = getSupabase();
  const orgId = getActiveOrganizationId();
  if (!client || !orgId) return [];
  const { data, error } = await client
    .from('plant_drawings')
    .select('*')
    .eq('organization_id', orgId)
    .neq('status', 'decommissioned')
    .order('dwg_number', { ascending: true });
  if (error) return [];
  return (data ?? []).map(rowToDrawing);
}

export async function getDrawing(id: string): Promise<PlantDrawing | null> {
  const client = getSupabase();
  if (!client) return null;
  const { data, error } = await client.from('plant_drawings').select('*').eq('id', id).single();
  if (error || !data) return null;
  return rowToDrawing(data);
}

export async function updateDrawing(id: string, updates: Partial<Pick<PlantDrawing, 'title' | 'dwgFilePath' | 'visioFilePath' | 'easyschematicId' | 'easyschematicShareToken' | 'notes' | 'status'>>): Promise<boolean> {
  const client = getSupabase();
  if (!client) return false;
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.title !== undefined)                    payload.title = updates.title;
  if (updates.dwgFilePath !== undefined)              payload.dwg_file_path = updates.dwgFilePath;
  if (updates.visioFilePath !== undefined)            payload.visio_file_path = updates.visioFilePath;
  if (updates.easyschematicId !== undefined)          payload.easyschematic_id = updates.easyschematicId;
  if (updates.easyschematicShareToken !== undefined)  payload.easyschematic_share_token = updates.easyschematicShareToken;
  if (updates.notes !== undefined)                    payload.notes = updates.notes;
  if (updates.status !== undefined)                   payload.status = updates.status;
  const { error } = await client.from('plant_drawings').update(payload).eq('id', id);
  return !error;
}

// ---------------------------------------------------------------------------
// Location queries
// ---------------------------------------------------------------------------

export async function listLocations(): Promise<PlantLocation[]> {
  const client = getSupabase();
  const orgId = getActiveOrganizationId();
  if (!client || !orgId) return [];
  const { data, error } = await client
    .from('plant_locations')
    .select('*')
    .eq('organization_id', orgId)
    .order('code', { ascending: true });
  if (error) return [];
  return (data ?? []).map(rowToLocation);
}

export async function updateLocation(id: string, updates: Partial<Pick<PlantLocation, 'name' | 'roomType' | 'status' | 'notes'>>): Promise<boolean> {
  const client = getSupabase();
  if (!client) return false;
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.name !== undefined)     payload.name = updates.name;
  if (updates.roomType !== undefined) payload.room_type = updates.roomType;
  if (updates.status !== undefined)   payload.status = updates.status;
  if (updates.notes !== undefined)    payload.notes = updates.notes;
  const { error } = await client.from('plant_locations').update(payload).eq('id', id);
  return !error;
}

// ---------------------------------------------------------------------------
// System queries
// ---------------------------------------------------------------------------

export async function listSystems(): Promise<PlantSystem[]> {
  const client = getSupabase();
  const orgId = getActiveOrganizationId();
  if (!client || !orgId) return [];
  const { data, error } = await client
    .from('plant_systems')
    .select('*')
    .eq('organization_id', orgId)
    .order('name', { ascending: true });
  if (error) return [];
  return (data ?? []).map(rowToSystem);
}

// ---------------------------------------------------------------------------
// Drawing cable-count helper (used in Drawings tab)
// ---------------------------------------------------------------------------

export async function getLocationCableCounts(orgId: string): Promise<Record<string, { origin: number; dest: number }>> {
  const client = getSupabase();
  if (!client) return {};
  const { data, error } = await client
    .from('plant_cables')
    .select('origin_location_code,dest_location_code')
    .eq('organization_id', orgId)
    .neq('status', 'archived');
  if (error || !data) return {};
  const counts: Record<string, { origin: number; dest: number }> = {};
  for (const row of data) {
    if (row.origin_location_code) {
      const c = counts[row.origin_location_code] ?? { origin: 0, dest: 0 };
      c.origin++;
      counts[row.origin_location_code] = c;
    }
    if (row.dest_location_code) {
      const c = counts[row.dest_location_code] ?? { origin: 0, dest: 0 };
      c.dest++;
      counts[row.dest_location_code] = c;
    }
  }
  return counts;
}

export async function getDrawingCableCounts(orgId: string): Promise<Record<string, number>> {
  const client = getSupabase();
  if (!client) return {};
  const { data, error } = await client
    .from('plant_cables')
    .select('drawing_id')
    .eq('organization_id', orgId)
    .neq('status', 'archived')
    .not('drawing_id', 'is', null);
  if (error || !data) return {};
  const counts: Record<string, number> = {};
  for (const row of data) {
    if (row.drawing_id) counts[row.drawing_id] = (counts[row.drawing_id] ?? 0) + 1;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Row mappers (snake_case DB → camelCase TS)
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToSummary(r: any): PlantCableSummary {
  return {
    id: r.id,
    cableNumber: r.cable_number ?? undefined,
    drawingId: r.drawing_id ?? undefined,
    originLocationCode: r.origin_location_code ?? undefined,
    originDevice: r.origin_device ?? undefined,
    originPort: r.origin_port ?? undefined,
    destLocationCode: r.dest_location_code ?? undefined,
    destDevice: r.dest_device ?? undefined,
    destPort: r.dest_port ?? undefined,
    cableFamily: r.cable_family,
    jacketColor: r.jacket_color ?? undefined,
    signalType: r.signal_type,
    lengthFt: r.length_ft ?? undefined,
    status: r.status,
    verifiedAt: r.verified_at ?? undefined,
    notes: r.notes ?? undefined,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToCable(r: any): PlantCable {
  return {
    id: r.id,
    organizationId: r.organization_id,
    legacyId: r.legacy_id ?? undefined,
    cableNumber: r.cable_number ?? undefined,
    numc: r.numc ?? undefined,
    legacyProjectId: r.legacy_project_id ?? undefined,
    altDwg: r.alt_dwg ?? undefined,
    drawingId: r.drawing_id ?? undefined,
    originRaw: r.origin_raw,
    originLocationCode: r.origin_location_code ?? undefined,
    originDevice: r.origin_device ?? undefined,
    originPort: r.origin_port ?? undefined,
    destRaw: r.dest_raw,
    destLocationCode: r.dest_location_code ?? undefined,
    destDevice: r.dest_device ?? undefined,
    destPort: r.dest_port ?? undefined,
    cableFamily: r.cable_family,
    jacketColor: r.jacket_color ?? undefined,
    wireTypeRaw: r.wire_type_raw ?? undefined,
    signalType: r.signal_type,
    lengthRaw: r.length_raw ?? undefined,
    lengthFt: r.length_ft ?? undefined,
    status: r.status,
    verifiedAt: r.verified_at ?? undefined,
    verifiedBy: r.verified_by ?? undefined,
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToDrawing(r: any): PlantDrawing {
  return {
    id: r.id,
    organizationId: r.organization_id,
    dwgNumber: r.dwg_number,
    title: r.title ?? undefined,
    signalCategory: r.signal_category ?? undefined,
    status: r.status,
    dwgFilePath: r.dwg_file_path ?? undefined,
    visioFilePath: r.visio_file_path ?? undefined,
    easyschematicId: r.easyschematic_id ?? undefined,
    easyschematicShareToken: r.easyschematic_share_token ?? undefined,
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToLocation(r: any): PlantLocation {
  return {
    id: r.id,
    organizationId: r.organization_id,
    code: r.code,
    name: r.name,
    roomType: r.room_type,
    status: r.status,
    parentId: r.parent_id ?? undefined,
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToSystem(r: any): PlantSystem {
  return {
    id: r.id,
    organizationId: r.organization_id,
    name: r.name,
    vendor: r.vendor ?? undefined,
    productFamily: r.product_family ?? undefined,
    matchTerms: Array.isArray(r.match_terms) ? r.match_terms : [],
    status: r.status,
    decommissionedOn: r.decommissioned_on ?? undefined,
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function dispatchUpdate() {
  window.dispatchEvent(new CustomEvent(PLANT_CABLES_UPDATED_EVENT));
}

// ---------------------------------------------------------------------------
// Campaign queries
// ---------------------------------------------------------------------------

export const CAMPAIGN_STATUS_LABELS: Record<PlantCampaignStatus, string> = {
  draft:     'Draft',
  active:    'Active',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const CAMPAIGN_STATUS_COLOURS: Record<PlantCampaignStatus, string> = {
  draft:     'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  active:    'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  cancelled: 'bg-muted text-muted-foreground',
};

export const REVIEW_STATUS_LABELS: Record<PlantCampaignItemReviewStatus, string> = {
  pending:        'Pending',
  confirmed_dead: 'Confirmed dead',
  repurposed:     'Repurposed',
  needs_check:    'Needs check',
  cleared:        'Cleared (active)',
};

export async function listCampaigns(): Promise<PlantCleanupCampaign[]> {
  const client = getSupabase();
  const orgId = getActiveOrganizationId();
  if (!client || !orgId) return [];
  const { data, error } = await client
    .from('plant_cleanup_campaigns')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false });
  if (error) return [];
  return (data ?? []).map(rowToCampaign);
}

export async function getCampaign(id: string): Promise<PlantCleanupCampaign | null> {
  const client = getSupabase();
  if (!client) return null;
  const { data, error } = await client
    .from('plant_cleanup_campaigns')
    .select('*')
    .eq('id', id)
    .single();
  if (error || !data) return null;
  return rowToCampaign(data);
}

export async function createCampaign(input: {
  name: string;
  description?: string;
  rules: PlantCampaignRule[];
}): Promise<PlantCleanupCampaign | null> {
  const client = getSupabase();
  const orgId = getActiveOrganizationId();
  if (!client || !orgId) return null;
  const { data, error } = await client
    .from('plant_cleanup_campaigns')
    .insert({
      organization_id: orgId,
      name: input.name,
      description: input.description ?? null,
      rules: input.rules,
      status: 'draft',
    })
    .select('*')
    .single();
  if (error || !data) {
    console.error('[plantService] createCampaign error', error);
    return null;
  }
  return rowToCampaign(data);
}

export async function updateCampaign(
  id: string,
  updates: Partial<Pick<PlantCleanupCampaign, 'name' | 'description' | 'rules' | 'status' | 'notes'>>
): Promise<boolean> {
  const client = getSupabase();
  if (!client) return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload: Record<string, any> = { updated_at: new Date().toISOString() };
  if (updates.name !== undefined)        payload.name = updates.name;
  if (updates.description !== undefined) payload.description = updates.description;
  if (updates.rules !== undefined)       payload.rules = updates.rules;
  if (updates.status !== undefined)      payload.status = updates.status;
  if (updates.notes !== undefined)       payload.notes = updates.notes;
  const { error } = await client.from('plant_cleanup_campaigns').update(payload).eq('id', id);
  return !error;
}

export async function deleteCampaign(id: string): Promise<boolean> {
  const client = getSupabase();
  if (!client) return false;
  // Only allow deleting drafts — enforce in UI, double-check here
  const { error } = await client
    .from('plant_cleanup_campaigns')
    .delete()
    .eq('id', id)
    .eq('status', 'draft');
  return !error;
}

// ---------------------------------------------------------------------------
// Campaign rule evaluation
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyRuleFilter(query: any, rule: PlantCampaignRule, drawingIdMap: Record<string, string>): any {
  switch (rule.type) {
    case 'system_name_match': {
      const orParts: string[] = [];
      const fields = rule.fields?.length ? rule.fields : (['origin_device', 'dest_device'] as const);
      for (const term of rule.terms) {
        for (const field of fields) {
          orParts.push(`${field}.ilike.%${term}%`);
        }
      }
      if (orParts.length) query = query.or(orParts.join(','));
      break;
    }
    case 'location_code_match': {
      const codesStr = rule.codes.join(',');
      query = query.or(`origin_location_code.in.(${codesStr}),dest_location_code.in.(${codesStr})`);
      break;
    }
    case 'drawing_match': {
      const ids = rule.dwgNumbers.map((n) => drawingIdMap[n]).filter(Boolean);
      if (ids.length) query = query.in('drawing_id', ids);
      break;
    }
    case 'cable_family_match': {
      query = query.in('cable_family', rule.families);
      break;
    }
    case 'status_match': {
      query = query.in('status', rule.statuses);
      break;
    }
    case 'verified_before': {
      query = query.or(`verified_at.is.null,verified_at.lt.${rule.date}`);
      break;
    }
  }
  return query;
}

async function fetchRuleMatchIds(
  rule: PlantCampaignRule,
  orgId: string,
  drawingIdMap: Record<string, string>
): Promise<string[]> {
  const client = getSupabase();
  if (!client) return [];

  const ids: string[] = [];
  const pageSize = 1000;
  let offset = 0;

  while (true) {
    let q = client
      .from('plant_cables')
      .select('id')
      .eq('organization_id', orgId)
      .neq('status', 'archived')
      .neq('status', 'decommissioned')
      .range(offset, offset + pageSize - 1);

    q = applyRuleFilter(q, rule, drawingIdMap);

    const { data, error } = await q;
    if (error || !data) break;
    for (const row of data) ids.push(row.id);
    if (data.length < pageSize) break;
    offset += pageSize;
  }
  return ids;
}

export async function previewCampaignRules(
  rules: PlantCampaignRule[]
): Promise<PlantCampaignPreview> {
  const client = getSupabase();
  const orgId = getActiveOrganizationId();
  if (!client || !orgId || rules.length === 0) {
    return { totalMatched: 0, highConfidence: 0, mediumConfidence: 0, lowConfidence: 0, sampleCables: [], ruleBreakdown: [] };
  }

  const drawingIdMap = await getDrawingIdMap(orgId);
  const ruleBreakdown: PlantCampaignPreview['ruleBreakdown'] = [];

  // Per-rule counts + per-rule ID sets for merged total
  const ruleIdSets: Set<string>[] = [];
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    let q = client
      .from('plant_cables')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .neq('status', 'archived')
      .neq('status', 'decommissioned');
    q = applyRuleFilter(q, rule, drawingIdMap);
    const { count } = await q;
    ruleBreakdown.push({ ruleIndex: i, label: rule.label, matchCount: count ?? 0 });
    ruleIdSets.push(new Set());
  }

  // Merged unique IDs for total + confidence
  const idToRules = new Map<string, number[]>();
  for (let i = 0; i < rules.length; i++) {
    const ids = await fetchRuleMatchIds(rules[i], orgId, drawingIdMap);
    for (const id of ids) {
      const existing = idToRules.get(id) ?? [];
      existing.push(i);
      idToRules.set(id, existing);
    }
    ruleIdSets[i] = new Set(ids);
  }

  let high = 0, medium = 0, low = 0;
  for (const matchedRules of idToRules.values()) {
    if (matchedRules.length >= 2) high++;
    else medium++;
  }

  // Fetch sample cables (first 20 matched IDs)
  const sampleIds = [...idToRules.keys()].slice(0, 20);
  let sampleCables: PlantCableSummary[] = [];
  if (sampleIds.length) {
    const { data } = await client
      .from('plant_cables')
      .select('id,cable_number,drawing_id,origin_location_code,origin_device,origin_port,dest_location_code,dest_device,dest_port,cable_family,jacket_color,signal_type,length_ft,status,verified_at,notes')
      .in('id', sampleIds);
    sampleCables = (data ?? []).map(rowToSummary);
  }

  return {
    totalMatched: idToRules.size,
    highConfidence: high,
    mediumConfidence: medium,
    lowConfidence: low,
    sampleCables,
    ruleBreakdown,
  };
}

async function getDrawingIdMap(orgId: string): Promise<Record<string, string>> {
  const client = getSupabase();
  if (!client) return {};
  const { data } = await client
    .from('plant_drawings')
    .select('id,dwg_number')
    .eq('organization_id', orgId);
  const map: Record<string, string> = {};
  for (const row of (data ?? [])) {
    if (row.dwg_number) map[row.dwg_number] = row.id;
  }
  return map;
}

export async function activateCampaign(campaignId: string): Promise<{ activated: number } | null> {
  const client = getSupabase();
  const orgId = getActiveOrganizationId();
  if (!client || !orgId) return null;

  const campaign = await getCampaign(campaignId);
  if (!campaign || campaign.status !== 'draft') return null;

  const rules = campaign.rules;
  const drawingIdMap = await getDrawingIdMap(orgId);

  // Collect IDs per rule → merge with confidence
  const idToRules = new Map<string, number[]>();
  for (let i = 0; i < rules.length; i++) {
    const ids = await fetchRuleMatchIds(rules[i], orgId, drawingIdMap);
    for (const id of ids) {
      const existing = idToRules.get(id) ?? [];
      existing.push(i);
      idToRules.set(id, existing);
    }
  }

  if (idToRules.size === 0) {
    await updateCampaign(campaignId, { status: 'active' });
    return { activated: 0 };
  }

  // Build campaign_items rows
  const now = new Date().toISOString();
  const itemRows = [...idToRules.entries()].map(([cableId, matchedRuleIdxs]) => ({
    campaign_id: campaignId,
    cable_id: cableId,
    confidence: matchedRuleIdxs.length >= 2 ? 'high' : 'medium',
    matched_rules: matchedRuleIdxs,
    review_status: 'pending',
    created_at: now,
    updated_at: now,
  }));

  // Batch-insert items in chunks of 500
  const BATCH = 500;
  for (let i = 0; i < itemRows.length; i += BATCH) {
    const batch = itemRows.slice(i, i + BATCH);
    const { error } = await client
      .from('plant_campaign_items')
      .insert(batch);
    if (error) {
      console.error('[plantService] activateCampaign insert error', error);
      return null;
    }
  }

  // Batch-update cable statuses
  const allIds = [...idToRules.keys()];
  for (let i = 0; i < allIds.length; i += BATCH) {
    const batch = allIds.slice(i, i + BATCH);
    await client
      .from('plant_cables')
      .update({ status: 'decommissioning', updated_at: now })
      .in('id', batch);
  }

  // Update campaign: status=active, matched counts
  const high = itemRows.filter((r) => r.confidence === 'high').length;
  const medium = itemRows.filter((r) => r.confidence === 'medium').length;
  await client
    .from('plant_cleanup_campaigns')
    .update({
      status: 'active',
      matched_count: idToRules.size,
      high_count: high,
      medium_count: medium,
      low_count: 0,
      updated_at: now,
    })
    .eq('id', campaignId);

  dispatchUpdate();
  return { activated: idToRules.size };
}

export async function completeCampaign(id: string, notes?: string): Promise<boolean> {
  const client = getSupabase();
  if (!client) return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload: Record<string, any> = {
    status: 'completed',
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (notes !== undefined) payload.notes = notes;
  const { error } = await client.from('plant_cleanup_campaigns').update(payload).eq('id', id);
  return !error;
}

export interface CampaignItemListResult {
  items: PlantCampaignItem[];
  total: number;
}

export async function getCampaignItems(
  campaignId: string,
  page = 0,
  pageSize = 50
): Promise<CampaignItemListResult> {
  const client = getSupabase();
  if (!client) return { items: [], total: 0 };
  const from = page * pageSize;
  const to = from + pageSize - 1;
  const { data, error, count } = await client
    .from('plant_campaign_items')
    .select(
      'id,campaign_id,cable_id,confidence,matched_rules,review_status,reviewed_by,reviewed_at,repurpose_notes,created_at,updated_at,' +
      'plant_cables(id,cable_number,drawing_id,origin_location_code,origin_device,origin_port,dest_location_code,dest_device,dest_port,cable_family,jacket_color,signal_type,length_ft,status,verified_at,notes)',
      { count: 'exact' }
    )
    .eq('campaign_id', campaignId)
    .order('confidence', { ascending: false })
    .order('created_at', { ascending: true })
    .range(from, to);

  if (error) {
    console.error('[plantService] getCampaignItems error', error);
    return { items: [], total: 0 };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = (data as any) ?? [];
  const items: PlantCampaignItem[] = rows.map((r) => ({
    id: r.id,
    campaignId: r.campaign_id,
    cableId: r.cable_id,
    confidence: r.confidence,
    matchedRules: Array.isArray(r.matched_rules) ? r.matched_rules : [],
    reviewStatus: r.review_status,
    reviewedBy: r.reviewed_by ?? undefined,
    reviewedAt: r.reviewed_at ?? undefined,
    repurposeNotes: r.repurpose_notes ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    cable: r.plant_cables ? rowToSummary(r.plant_cables as any) : undefined,
  }));

  return { items, total: count ?? 0 };
}

export async function updateCampaignItemReview(
  itemId: string,
  reviewStatus: PlantCampaignItemReviewStatus,
  notes?: string
): Promise<boolean> {
  const client = getSupabase();
  if (!client) return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const payload: Record<string, any> = {
    review_status: reviewStatus,
    reviewed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  if (notes !== undefined) payload.repurpose_notes = notes;
  const { error } = await client.from('plant_campaign_items').update(payload).eq('id', itemId);
  return !error;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToCampaign(r: any): PlantCleanupCampaign {
  return {
    id: r.id,
    organizationId: r.organization_id,
    name: r.name,
    description: r.description ?? undefined,
    status: r.status,
    rules: Array.isArray(r.rules) ? r.rules : [],
    matchedCount: r.matched_count ?? undefined,
    highCount: r.high_count ?? undefined,
    mediumCount: r.medium_count ?? undefined,
    lowCount: r.low_count ?? undefined,
    createdBy: r.created_by ?? undefined,
    completedAt: r.completed_at ?? undefined,
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

export const SIGNAL_TYPE_LABELS: Record<PlantSignalType, string> = {
  hd_sdi: 'HD-SDI',
  sdi: 'SDI',
  analog_video: 'Analog Video',
  audio_analog: 'Audio (Analog)',
  audio_aes: 'Audio (AES)',
  audio_dante: 'Dante',
  data_ethernet: 'Ethernet',
  rf: 'RF',
  control_serial: 'Control/Serial',
  display: 'Display',
  fiber: 'Fiber',
  power: 'Power',
  other: 'Other',
};

export const STATUS_LABELS: Record<PlantCableStatus, string> = {
  unknown: 'Unverified',
  active: 'Active',
  review: 'Review',
  decommissioning: 'Decommissioning',
  decommissioned: 'Decommissioned',
  archived: 'Archived',
};

export const STATUS_COLOURS: Record<PlantCableStatus, string> = {
  unknown:        'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  active:         'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  review:         'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  decommissioning:'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  decommissioned: 'bg-muted text-muted-foreground',
  archived:       'bg-muted text-muted-foreground',
};
