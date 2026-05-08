import type { DefaultSettings } from '@/lib/settingsService';

export type CutoverMaintenanceCaution = {
  title: string;
  detail: string;
  warning: boolean;
};

/** Team workspace: admin + editor. Personal / no workspace: app admin only (hide from app `user` and `viewer`). */
export function canViewMaintenanceWindowCautions(params: {
  authBackend: string;
  activeWorkspaceId: string | null;
  activeWorkspaceRole: 'admin' | 'editor' | 'viewer' | null;
  appUserRole: 'admin' | 'user' | 'viewer' | undefined;
}): boolean {
  const team = params.authBackend === 'supabase' && Boolean(params.activeWorkspaceId);
  if (team) {
    return params.activeWorkspaceRole === 'admin' || params.activeWorkspaceRole === 'editor';
  }
  return params.appUserRole === 'admin';
}

export function computeCutoverMaintenanceCaution(
  cutoverDateTimeValue: string | undefined,
  defaultSettings: DefaultSettings,
): CutoverMaintenanceCaution | null {
  if (!defaultSettings.maintenanceCautionsEnabled || !cutoverDateTimeValue) {
    return null;
  }
  const cutoverDate = new Date(cutoverDateTimeValue);
  if (Number.isNaN(cutoverDate.getTime())) {
    return null;
  }

  const dayKeyByNumber: Array<keyof DefaultSettings['maintenanceOnAirSchedule']> = [
    'sunday',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
  ];
  const dayKey = dayKeyByNumber[cutoverDate.getDay()];
  const cutoverMinutes = cutoverDate.getHours() * 60 + cutoverDate.getMinutes();
  const onAirTimes = defaultSettings.maintenanceOnAirSchedule?.[dayKey] ?? [];
  const blockMinutes = Math.max(15, Number(defaultSettings.maintenanceProgrammingBlockMinutes ?? 60));
  const isOnAirSlot = onAirTimes.some((timeValue) => {
    const [hoursPart, minutesPart] = timeValue.split(':');
    const slotHours = Number(hoursPart);
    const slotMinutes = Number(minutesPart);
    if (!Number.isFinite(slotHours) || !Number.isFinite(slotMinutes)) {
      return false;
    }
    const startMinutes = slotHours * 60 + slotMinutes;
    const endMinutes = startMinutes + blockMinutes;
    return cutoverMinutes >= startMinutes && cutoverMinutes < endMinutes;
  });
  const shouldWarn =
    defaultSettings.maintenanceCautionMode === 'on-air' ? isOnAirSlot : !isOnAirSlot;

  if (!shouldWarn) {
    return null;
  }

  return defaultSettings.maintenanceCautionMode === 'on-air'
    ? {
        title: 'ON-AIR caution',
        detail: `This cut-over time is inside a configured ON-AIR programming block (${blockMinutes} min).`,
        warning: true,
      }
    : {
        title: 'OFF-AIR caution',
        detail: `This cut-over time is inside an OFF-AIR block based on the configured ON-AIR schedule (${blockMinutes} min block length).`,
        warning: true,
      };
}
