import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';

/** Batch delete / destructive bulk actions (P3 RBAC). */
export function useInventoryPermissions() {
  const { currentUser } = useAuth();
  const { activeWorkspaceId, activeWorkspaceRole } = useWorkspace();

  const canBulkDelete = useMemo(() => {
    if (currentUser?.role !== 'admin') {
      return false;
    }
    if (activeWorkspaceId) {
      return activeWorkspaceRole === 'admin';
    }
    return true;
  }, [currentUser?.role, activeWorkspaceId, activeWorkspaceRole]);

  const canBatchEdit = useMemo(() => {
    if (currentUser?.role === 'viewer') {
      return false;
    }
    if (activeWorkspaceId && activeWorkspaceRole === 'viewer') {
      return false;
    }
    return true;
  }, [currentUser?.role, activeWorkspaceId, activeWorkspaceRole]);

  return { canBulkDelete, canBatchEdit };
}
