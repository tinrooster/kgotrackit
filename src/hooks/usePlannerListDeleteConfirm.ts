import { useEffect, useState } from 'react';

import { useAuth } from '@/contexts/AuthContext';
import { DEFAULT_SETTINGS_CHANGED_EVENT, SettingsService } from '@/lib/settingsService';

/** Reads Settings → General → “Confirm production list deletes” for planner / production sheet editors. */
export function usePlannerListDeleteConfirm(): boolean {
  const { currentUser } = useAuth();
  const username = currentUser?.username ?? '';
  const [confirmDeletes, setConfirmDeletes] = useState(true);

  useEffect(() => {
    const read = () => {
      const settings = SettingsService.loadDefaultSettings();
      setConfirmDeletes(settings.confirmPlannerListDeletesByUser?.[username] ?? true);
    };
    read();
    window.addEventListener(DEFAULT_SETTINGS_CHANGED_EVENT, read);
    return () => window.removeEventListener(DEFAULT_SETTINGS_CHANGED_EVENT, read);
  }, [username]);

  return confirmDeletes;
}
