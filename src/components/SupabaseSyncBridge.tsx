import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { scheduleDebouncedPushToSupabase } from '@/lib/supabase/cloudData';
import { CLOUD_SYNC_REQUEST_EVENT } from '@/lib/cloudSyncEvents';

export function SupabaseSyncBridge({ children }: { children: ReactNode }) {
  const { currentUser, authBackend } = useAuth();

  useEffect(() => {
    if (!isSupabaseConfigured() || authBackend !== 'supabase' || !currentUser?.id) {
      return;
    }
    const userId = currentUser.id;
    const onRequest = () => scheduleDebouncedPushToSupabase(userId);
    window.addEventListener(CLOUD_SYNC_REQUEST_EVENT, onRequest);
    return () => window.removeEventListener(CLOUD_SYNC_REQUEST_EVENT, onRequest);
  }, [authBackend, currentUser?.id]);

  return <>{children}</>;
}
