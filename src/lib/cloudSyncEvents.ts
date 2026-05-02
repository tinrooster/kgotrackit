/** Fired after local persistence so cloud sync can debounce a push to Supabase. */
export const CLOUD_SYNC_REQUEST_EVENT = 'trackit:cloud-sync-request';

export function requestCloudSync(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CLOUD_SYNC_REQUEST_EVENT));
  }
}
