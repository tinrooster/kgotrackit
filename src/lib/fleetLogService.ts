import { getSupabase } from '@/lib/supabase/client';
import { getActiveOrganizationId } from '@/lib/supabase/organizationData';
import type { FleetLogEntry, LogCategory } from '@/types/fleet';

export const FLEET_LOG_UPDATED_EVENT = 'trackit:fleet-log-updated';

function dispatchLogUpdated(): void {
  window.dispatchEvent(new CustomEvent(FLEET_LOG_UPDATED_EVENT));
}

function rowToEntry(row: Record<string, unknown>): FleetLogEntry {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    occurredAt: row.occurred_at as string,
    authorUserId: row.author_user_id as string,
    authorDisplayName: typeof row.author_display_name === 'string' ? row.author_display_name : undefined,
    vehicleIds: Array.isArray(row.vehicle_ids) ? (row.vehicle_ids as string[]) : [],
    category: row.category as LogCategory,
    body: row.body as string,
    scheduledWorkId: typeof row.scheduled_work_id === 'string' ? row.scheduled_work_id : undefined,
    attachmentUrls: [],
  };
}

export interface ListLogOptions {
  vehicleId?: string;
  since?: string;
  until?: string;
  category?: LogCategory;
  limit?: number;
}

export async function listLogEntries(options: ListLogOptions = {}): Promise<FleetLogEntry[]> {
  const client = getSupabase();
  if (!client) return [];
  const organizationId = getActiveOrganizationId();
  if (!organizationId) return [];

  let query = client
    .from('organization_fleet_log')
    .select('*')
    .eq('organization_id', organizationId)
    .order('occurred_at', { ascending: false })
    .limit(options.limit ?? 200);

  if (options.vehicleId) {
    query = query.contains('vehicle_ids', [options.vehicleId]);
  }
  if (options.since) {
    query = query.gte('occurred_at', options.since);
  }
  if (options.until) {
    query = query.lte('occurred_at', options.until);
  }
  if (options.category) {
    query = query.eq('category', options.category);
  }

  const { data, error } = await query;
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map(rowToEntry);
}

export type AppendLogInput = Pick<FleetLogEntry, 'vehicleIds' | 'category' | 'body'> & {
  occurredAt?: string;
  scheduledWorkId?: string;
};

export async function appendLogEntry(input: AppendLogInput): Promise<FleetLogEntry | null> {
  const client = getSupabase();
  if (!client) return null;
  const organizationId = getActiveOrganizationId();
  if (!organizationId) return null;

  const {
    data: { user },
    error: authErr,
  } = await client.auth.getUser();
  if (authErr || !user) return null;

  const authorDisplayName = user.email ?? user.user_metadata?.full_name ?? user.id;

  const { data, error } = await client
    .from('organization_fleet_log')
    .insert({
      organization_id: organizationId,
      occurred_at: input.occurredAt ?? new Date().toISOString(),
      author_user_id: user.id,
      author_display_name: authorDisplayName,
      vehicle_ids: input.vehicleIds,
      category: input.category,
      body: input.body.trim(),
      scheduled_work_id: input.scheduledWorkId ?? null,
      attachments: [],
    })
    .select()
    .single();

  if (error || !data) return null;
  const entry = rowToEntry(data as Record<string, unknown>);
  dispatchLogUpdated();
  return entry;
}

export async function deleteLogEntry(entryId: string): Promise<void> {
  const client = getSupabase();
  if (!client) return;
  await client.from('organization_fleet_log').delete().eq('id', entryId);
  dispatchLogUpdated();
}
