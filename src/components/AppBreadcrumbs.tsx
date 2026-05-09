import { Fragment, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import {
  ORGANIZATION_SETTINGS_SUB_TAB_IDS,
  type OrganizationSettingsSubTabId,
} from '@/components/settings/organizationSettingsSubTabs';

const PATH_LABELS: Record<string, string> = {
  '/': 'Dashboard',
  '/inventory': 'Inventory',
  '/checkout': 'Check-In/Out',
  '/reports': 'Reports',
  '/settings': 'Settings',
  '/productions': 'Productions',
  '/help': 'Help',
  '/about': 'About',
  '/dev': 'Dev',
  '/dev/time-picker-lab': 'Time Picker Lab',
  '/dev/ui-diagnostics': 'UI Diagnostics',
  '/time-picker-lab': 'Time Picker Lab',
  '/ui-diagnostics': 'UI Diagnostics',
};

const SETTINGS_TAB_LABELS: Record<string, string> = {
  general: 'General Settings',
  userDefined: 'Lookup Lists',
  libraries: 'Libraries',
  organization: 'Organization',
  users: 'Users',
  data: 'Data Management',
  workspaces: 'Workspaces',
  logs: 'System Logs',
};

const SETTINGS_TAB_DEFAULT_SUBLABELS: Record<string, string> = {
  data: 'Backup & Restore',
  workspaces: 'Workspaces and Invites',
  logs: 'System Logs',
  users: 'Team Members',
  general: 'Preferences',
};

const USER_DEFINED_PANEL_LABELS: Record<string, string> = {
  categories: 'Categories',
  units: 'Units',
  locations: 'Locations',
  projects: 'Projects',
  financial: 'Expense Codes',
};

const LIBRARIES_PANEL_LABELS: Record<string, string> = {
  suppliers: 'Vendors',
  positionTemplates: 'Crew position templates',
  templates: 'Item templates',
  deviceLibrary: 'Device library',
  cabinets: 'Cab/Storage',
};
const DATA_PANEL_LABELS: Record<string, string> = {
  'import-export': 'Import & Export',
  'backup-restore': 'Backup & Restore',
};

const ORGANIZATION_SUBTAB_LABELS: Record<OrganizationSettingsSubTabId, string> = {
  overview: 'Overview',
  crew: 'Master crew',
  maintenance: 'Maintenance cautions',
};
const URL_SYNC_EVENT = 'trackit:url-sync';
const ADMIN_ONLY_SETTINGS_TABS = new Set(['userDefined', 'libraries', 'organization', 'users', 'workspaces', 'logs']);

function titleize(segment: string): string {
  return segment
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function AppBreadcrumbs() {
  const location = useLocation();
  const { currentUser } = useAuth();
  const { activeWorkspaceId, activeWorkspaceRole } = useWorkspace();
  const [urlSearch, setUrlSearch] = useState(() => window.location.search);
  const canManageSharedConfig = activeWorkspaceId ? activeWorkspaceRole === 'admin' : currentUser?.role === 'admin';

  useEffect(() => {
    const syncFromWindowLocation = () => setUrlSearch(window.location.search);
    window.addEventListener('popstate', syncFromWindowLocation);
    window.addEventListener(URL_SYNC_EVENT, syncFromWindowLocation);
    return () => {
      window.removeEventListener('popstate', syncFromWindowLocation);
      window.removeEventListener(URL_SYNC_EVENT, syncFromWindowLocation);
    };
  }, []);

  const crumbs = useMemo(() => {
    const segments = location.pathname.split('/').filter(Boolean);
    if (segments.length === 0) {
      return [{ href: '/', label: 'Dashboard' }];
    }
    const baseCrumbs = segments.map((segment, index) => {
      const href = `/${segments.slice(0, index + 1).join('/')}`;
      return {
        href,
        label: PATH_LABELS[href] ?? titleize(segment),
      };
    });
    if (location.pathname === '/settings') {
      const search = new URLSearchParams(urlSearch);
      const rawSettingsTab = search.get('st');
      const normalizedTab = rawSettingsTab === 'masterCrew' ? 'organization' : rawSettingsTab;
      const settingsTab =
        normalizedTab && !canManageSharedConfig && ADMIN_ONLY_SETTINGS_TABS.has(normalizedTab) ? 'general' : normalizedTab;
      let hasExplicitSublevel = false;
      if (settingsTab && SETTINGS_TAB_LABELS[settingsTab]) {
        baseCrumbs.push({ href: `/settings?st=${settingsTab}`, label: SETTINGS_TAB_LABELS[settingsTab] });
      }
      if (settingsTab === 'userDefined') {
        const panel = search.get('usp');
        if (panel && USER_DEFINED_PANEL_LABELS[panel]) {
          hasExplicitSublevel = true;
          baseCrumbs.push({
            href: `/settings?st=userDefined&usp=${panel}`,
            label: USER_DEFINED_PANEL_LABELS[panel],
          });
        }
      }
      if (settingsTab === 'libraries') {
        const panel = search.get('lp');
        if (panel && LIBRARIES_PANEL_LABELS[panel]) {
          hasExplicitSublevel = true;
          baseCrumbs.push({
            href: `/settings?st=libraries&lp=${panel}`,
            label: LIBRARIES_PANEL_LABELS[panel],
          });
        }
      }
      if (settingsTab === 'organization') {
        const rawSt = search.get('st');
        let orgSub: OrganizationSettingsSubTabId = 'overview';
        if (rawSt === 'masterCrew') {
          orgSub = 'crew';
        } else {
          const osp = search.get('osp');
          if (osp && (ORGANIZATION_SETTINGS_SUB_TAB_IDS as readonly string[]).includes(osp)) {
            orgSub = osp as OrganizationSettingsSubTabId;
          }
        }
        hasExplicitSublevel = true;
        baseCrumbs.push({
          href: `/settings?st=organization&osp=${orgSub}`,
          label: ORGANIZATION_SUBTAB_LABELS[orgSub],
        });
      }
      if (settingsTab === 'data') {
        const dataPanel = search.get('dp');
        if (dataPanel && DATA_PANEL_LABELS[dataPanel]) {
          hasExplicitSublevel = true;
          baseCrumbs.push({
            href: `/settings?st=data&dp=${dataPanel}`,
            label: DATA_PANEL_LABELS[dataPanel],
          });
        }
      }
      if (
        settingsTab &&
        settingsTab !== 'libraries' &&
        settingsTab !== 'userDefined' &&
        settingsTab !== 'organization' &&
        !hasExplicitSublevel
      ) {
        const defaultSubLabel = SETTINGS_TAB_DEFAULT_SUBLABELS[settingsTab];
        if (defaultSubLabel) {
          baseCrumbs.push({
            href: `/settings?st=${settingsTab}`,
            label: defaultSubLabel,
          });
        }
      }
    }
    return baseCrumbs;
  }, [location.pathname, urlSearch, canManageSharedConfig]);

  return (
    <div className="border-b bg-background/70">
      <div className="mx-auto w-full max-w-full px-3 py-2 sm:px-4 lg:px-6">
        <nav aria-label="Breadcrumb" className="flex items-center text-xs text-muted-foreground sm:text-sm">
          {crumbs.map((crumb, index) => {
            const isLast = index === crumbs.length - 1;
            return (
              <Fragment key={`${crumb.href}|${crumb.label}|${index}`}>
                {index > 0 ? <ChevronRight className="mx-1 h-3.5 w-3.5" aria-hidden /> : null}
                {isLast ? (
                  <span className="font-medium text-foreground">{crumb.label}</span>
                ) : (
                  <Link to={crumb.href} className="hover:text-foreground hover:underline">
                    {crumb.label}
                  </Link>
                )}
              </Fragment>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

