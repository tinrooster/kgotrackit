/** Fired after local persistence so cloud sync can debounce a push to Supabase. */
export const CLOUD_SYNC_REQUEST_EVENT = 'trackit:cloud-sync-request';

/** Fired after `bootstrapCloudData` finishes (success or failure) so UI can re-check fresh/empty state. */
export const CLOUD_HYDRATED_EVENT = 'trackit:cloud-hydrated';

export function requestCloudSync(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CLOUD_SYNC_REQUEST_EVENT));
  }
}

export function dispatchCloudHydrated(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CLOUD_HYDRATED_EVENT));
  }
}
