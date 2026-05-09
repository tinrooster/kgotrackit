export const ORGANIZATION_SETTINGS_SUB_TAB_IDS = ['overview', 'crew', 'directory', 'maintenance'] as const;
export type OrganizationSettingsSubTabId = (typeof ORGANIZATION_SETTINGS_SUB_TAB_IDS)[number];

export function readOrganizationSubTabFromSearch(): OrganizationSettingsSubTabId {
  try {
    const search = new URLSearchParams(window.location.search);
    if (search.get('st') === 'masterCrew') {
      return 'crew';
    }
    const osp = search.get('osp');
    if (osp && (ORGANIZATION_SETTINGS_SUB_TAB_IDS as readonly string[]).includes(osp)) {
      return osp as OrganizationSettingsSubTabId;
    }
  } catch {
    /* ignore */
  }
  return 'overview';
}
