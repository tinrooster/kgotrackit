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
