import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import { flushCloudPushNow, scheduleDebouncedPushToSupabase } from '@/lib/supabase/cloudData';
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

  useEffect(() => {
    if (!isSupabaseConfigured() || authBackend !== 'supabase' || !currentUser?.id) {
      return;
    }
    const userId = currentUser.id;
    const onHidden = () => {
      if (document.visibilityState === 'hidden') {
        void flushCloudPushNow(userId);
      }
    };
    const onPageHide = () => {
      void flushCloudPushNow(userId);
    };
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [authBackend, currentUser?.id]);

  return <>{children}</>;
}
