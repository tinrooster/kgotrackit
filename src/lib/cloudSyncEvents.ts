/** Fired after local persistence so cloud sync can debounce a push to Supabase. */
export const CLOUD_SYNC_REQUEST_EVENT = 'trackit:cloud-sync-request';

/** Fired after `bootstrapCloudData` finishes (success or failure) so UI can re-check fresh/empty state. */
export const CLOUD_HYDRATED_EVENT = 'trackit:cloud-hydrated';

const PENDING_CLOUD_PUSH_KEY = 'trackit:pending-cloud-push';

/** Local edits may not be on the server yet; bootstrap must push before pull so refresh does not wipe them. */
export function markPendingCloudPush(): void {
  try {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(PENDING_CLOUD_PUSH_KEY, '1');
    }
  } catch {
    // private mode / quota
  }
}

export function hasPendingCloudPush(): boolean {
  try {
    return typeof window !== 'undefined' && sessionStorage.getItem(PENDING_CLOUD_PUSH_KEY) === '1';
  } catch {
    return false;
  }
}

export function clearPendingCloudPush(): void {
  try {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(PENDING_CLOUD_PUSH_KEY);
    }
  } catch {
    // ignore
  }
}

export function requestCloudSync(): void {
  if (typeof window !== 'undefined') {
    markPendingCloudPush();
    window.dispatchEvent(new CustomEvent(CLOUD_SYNC_REQUEST_EVENT));
  }
}

export function dispatchCloudHydrated(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CLOUD_HYDRATED_EVENT));
  }
}
