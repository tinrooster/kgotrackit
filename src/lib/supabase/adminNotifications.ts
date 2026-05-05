import { getSupabase, isSupabaseConfigured } from '@/lib/supabase/client';

export interface AdminSettingsNotificationPayload {
  notifyEmail: string;
  changeType: 'lookup-list-update' | 'global-setting-update';
  listKey?: string;
  addedCount?: number;
  removedCount?: number;
  renamedCount?: number;
  settingKey?: string;
  previousValue?: string;
  nextValue?: string;
  performedBy: string;
  workspaceId?: string | null;
}

/**
 * Sends admin change notices through Supabase Edge Functions.
 * The edge function is provider-agnostic via EMAIL_PROVIDER env.
 */
export async function sendAdminSettingsNotification(
  payload: AdminSettingsNotificationPayload
): Promise<void> {
  if (!isSupabaseConfigured()) {
    return;
  }
  const client = getSupabase();
  if (!client || !payload.notifyEmail?.trim()) {
    return;
  }

  const { error } = await client.functions.invoke('admin-settings-notify', {
    body: payload,
  });
  if (error) {
    throw error;
  }
}
