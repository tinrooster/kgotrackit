import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import {
  getActiveWorkspaceId,
  listWorkspaceSummariesForUser,
  setActiveWorkspaceId as persistActiveWorkspaceId,
  type WorkspaceSummary,
} from '@/lib/supabase/workspaceData';

interface WorkspaceContextValue {
  /** Supabase workspaces the signed-in user belongs to. */
  workspaces: WorkspaceSummary[];
  /** Currently selected team workspace id, or null = personal `user_app_data`. */
  activeWorkspaceId: string | null;
  /** Role in the active workspace; null when in personal mode. */
  activeWorkspaceRole: WorkspaceSummary['role'] | null;
  loading: boolean;
  lastWorkspaceError: string | null;
  refreshWorkspaces: () => Promise<void>;
  selectPersonalData: () => void;
  selectWorkspace: (workspaceId: string) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { currentUser, authBackend } = useAuth();
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  // Start as true so the validation effect never fires with an empty list before the first load.
  const [loading, setLoading] = useState(true);
  const [lastWorkspaceError, setLastWorkspaceError] = useState<string | null>(null);

  const refreshWorkspaces = useCallback(async () => {
    if (!isSupabaseConfigured() || authBackend !== 'supabase' || !currentUser?.id) {
      setWorkspaces([]);
      setLastWorkspaceError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const list = await listWorkspaceSummariesForUser(currentUser.id);
      setWorkspaces(list);
      setLastWorkspaceError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not load workspaces.';
      setWorkspaces([]);
      setLastWorkspaceError(message);
    } finally {
      setLoading(false);
    }
  }, [authBackend, currentUser?.id]);

  useEffect(() => {
    void refreshWorkspaces();
  }, [refreshWorkspaces]);

  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState<string | null>(() => getActiveWorkspaceId());
  // Re-sync from localStorage only when the signed-in user identity changes (e.g. user switch).
  // Do NOT include `workspaces` here — that causes a race: if bootstrapCloudData or any other
  // caller mutates localStorage before `workspaces` finishes loading, this effect picks up the
  // stale/cleared value and overwrites the correctly-initialised state.
  useEffect(() => {
    setActiveWorkspaceIdState(getActiveWorkspaceId());
  }, [currentUser?.id]);

  useEffect(() => {
    if (!isSupabaseConfigured() || authBackend !== 'supabase' || !currentUser?.id || loading) {
      return;
    }
    if (workspaces.length === 0) {
      // The list may be empty because of a transient load error (RLS, network) rather than
      // the user genuinely having no workspaces.  Never clear the stored preference here —
      // wait until the list loads with at least one entry before making any decision.
      return;
    }
    const hasActiveWorkspace = activeWorkspaceId
      ? workspaces.some((workspace) => workspace.workspaceId === activeWorkspaceId)
      : false;
    if (hasActiveWorkspace) {
      return;
    }

    const defaultWorkspaceId = workspaces[0]?.workspaceId ?? null;
    if (!defaultWorkspaceId) {
      return;
    }
    persistActiveWorkspaceId(defaultWorkspaceId);
    setActiveWorkspaceIdState(defaultWorkspaceId);
  }, [activeWorkspaceId, authBackend, currentUser?.id, loading, workspaces]);

  const activeWorkspaceRole = useMemo(() => {
    if (!activeWorkspaceId) return null;
    const row = workspaces.find((w) => w.workspaceId === activeWorkspaceId);
    return row?.role ?? null;
  }, [activeWorkspaceId, workspaces]);

  const selectPersonalData = useCallback(() => {
    persistActiveWorkspaceId(null);
    window.location.reload();
  }, []);

  const selectWorkspace = useCallback((workspaceId: string) => {
    persistActiveWorkspaceId(workspaceId);
    window.location.reload();
  }, []);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      workspaces,
      activeWorkspaceId,
      activeWorkspaceRole,
      loading,
      lastWorkspaceError,
      refreshWorkspaces,
      selectPersonalData,
      selectWorkspace,
    }),
    [
      workspaces,
      activeWorkspaceId,
      activeWorkspaceRole,
      loading,
      lastWorkspaceError,
      refreshWorkspaces,
      selectPersonalData,
      selectWorkspace,
    ],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error('useWorkspace must be used within WorkspaceProvider');
  }
  return ctx;
}
