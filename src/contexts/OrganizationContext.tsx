import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { isSupabaseConfigured } from '@/lib/supabase/client';
import {
  getActiveOrganizationId,
  listOrganizationSummariesForUser,
  setActiveOrganizationId as persistActiveOrganizationId,
  type OrganizationSummary,
} from '@/lib/supabase/organizationData';

interface OrganizationContextValue {
  organizations: OrganizationSummary[];
  activeOrganizationId: string | null;
  activeOrganizationRole: OrganizationSummary['role'] | null;
  activeOrganizationName: string | null;
  loading: boolean;
  refreshOrganizations: () => Promise<void>;
  selectOrganization: (organizationId: string | null) => void;
}

const OrganizationContext = createContext<OrganizationContextValue | undefined>(undefined);

export function OrganizationProvider({ children }: { children: React.ReactNode }) {
  const { currentUser, authBackend } = useAuth();
  const { activeWorkspaceId, workspaces } = useWorkspace();
  const [organizations, setOrganizations] = useState<OrganizationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeOrganizationId, setActiveOrganizationIdState] = useState<string | null>(() => getActiveOrganizationId());

  const refreshOrganizations = useCallback(async () => {
    if (!isSupabaseConfigured() || authBackend !== 'supabase' || !currentUser?.id) {
      setOrganizations([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const rows = await listOrganizationSummariesForUser(currentUser.id);
      setOrganizations(rows);
    } finally {
      setLoading(false);
    }
  }, [authBackend, currentUser?.id]);

  useEffect(() => {
    void refreshOrganizations();
  }, [refreshOrganizations]);

  useEffect(() => {
    setActiveOrganizationIdState(getActiveOrganizationId());
  }, [currentUser?.id]);

  useEffect(() => {
    if (!isSupabaseConfigured() || authBackend !== 'supabase' || !currentUser?.id || loading) {
      return;
    }
    if (organizations.length === 0) {
      persistActiveOrganizationId(null);
      setActiveOrganizationIdState(null);
      return;
    }
    const activeWorkspaceOrganizationId = activeWorkspaceId
      ? workspaces.find((workspace) => workspace.workspaceId === activeWorkspaceId)?.organizationId ?? null
      : null;
    if (
      activeWorkspaceOrganizationId &&
      organizations.some((organization) => organization.organizationId === activeWorkspaceOrganizationId)
    ) {
      persistActiveOrganizationId(activeWorkspaceOrganizationId);
      setActiveOrganizationIdState(activeWorkspaceOrganizationId);
      return;
    }
    const hasActiveOrganization = activeOrganizationId
      ? organizations.some((organization) => organization.organizationId === activeOrganizationId)
      : false;
    if (hasActiveOrganization) {
      return;
    }
    const fallbackOrganizationId = organizations[0]?.organizationId ?? null;
    persistActiveOrganizationId(fallbackOrganizationId);
    setActiveOrganizationIdState(fallbackOrganizationId);
  }, [activeOrganizationId, activeWorkspaceId, authBackend, currentUser?.id, loading, organizations, workspaces]);

  const activeOrganization = useMemo(
    () => organizations.find((organization) => organization.organizationId === activeOrganizationId),
    [activeOrganizationId, organizations],
  );

  const selectOrganization = useCallback((organizationId: string | null) => {
    persistActiveOrganizationId(organizationId);
    setActiveOrganizationIdState(organizationId);
  }, []);

  const value = useMemo<OrganizationContextValue>(
    () => ({
      organizations,
      activeOrganizationId,
      activeOrganizationRole: activeOrganization?.role ?? null,
      activeOrganizationName: activeOrganization?.name ?? null,
      loading,
      refreshOrganizations,
      selectOrganization,
    }),
    [activeOrganization?.name, activeOrganization?.role, activeOrganizationId, loading, organizations, refreshOrganizations, selectOrganization],
  );

  return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>;
}

export function useOrganization(): OrganizationContextValue {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error('useOrganization must be used within OrganizationProvider');
  }
  return context;
}
