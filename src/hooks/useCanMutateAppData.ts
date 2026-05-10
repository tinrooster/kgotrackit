import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';

/** False when the signed-in user or active workspace membership is read-only (viewer). */
export function useCanMutateAppData() {
  const { currentUser } = useAuth();
  const { activeWorkspaceId, activeWorkspaceRole } = useWorkspace();

  return useMemo(() => {
    if (currentUser?.role === 'viewer') {
      return false;
    }
    if (activeWorkspaceId && activeWorkspaceRole === 'viewer') {
      return false;
    }
    return true;
  }, [currentUser?.role, activeWorkspaceId, activeWorkspaceRole]);
}
