import { useMemo } from 'react';
import { Contact } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger, createTabsScope } from '@/components/ui/tabs';
import { OrgMaintenanceBroadcastTemplateSection } from '@/components/settings/OrgMaintenanceBroadcastTemplateSection';
import { OrganizationMasterPanel } from '@/components/settings/OrganizationMasterPanel';
import type { OrganizationSummary } from '@/lib/supabase/organizationData';
import type { MaintenanceOnAirSchedule } from '@/lib/settingsService';
import type { OrganizationSettingsSubTabId } from '@/components/settings/organizationSettingsSubTabs';
import CrewPage from '@/pages/CrewPage';

export interface OrganizationSettingsSectionProps {
  organizationSubTab: OrganizationSettingsSubTabId;
  onOrganizationSubTabChange: (tab: OrganizationSettingsSubTabId) => void;
  authBackend: string;
  organizations: OrganizationSummary[];
  activeOrganizationId: string | null;
  activeOrganizationName: string | null;
  activeOrganizationRole: OrganizationSummary['role'] | null;
  organizationsLoading: boolean;
  selectOrganization: (organizationId: string | null) => void;
  refreshOrganizations: () => Promise<void>;
  orgMaintenanceTemplateStored: MaintenanceOnAirSchedule | null;
  onAfterOrgMaintenanceSave: () => void;
  onNavigateToDataTab: () => void;
  onNavigateToWorkspacesTab: () => void;
  onNavigateToLibrariesPositionTemplates: () => void;
}

/**
 * Organization primary tab body. Uses a dedicated Radix `Tabs` root (same pattern as
 * `DataBackupTab` under Data Management) so sub-triggers stay scoped to this tree.
 * Nested tabs must pass `__scopeTabs` from `createTabsScope()` hook invocation or clicks update the parent Settings tab
 * (e.g. `crew` → URL `st=crew` → sync falls back to General).
 */
export function OrganizationSettingsSection({
  organizationSubTab,
  onOrganizationSubTabChange,
  authBackend,
  organizations,
  activeOrganizationId,
  activeOrganizationName,
  activeOrganizationRole,
  organizationsLoading,
  selectOrganization,
  refreshOrganizations,
  orgMaintenanceTemplateStored,
  onAfterOrgMaintenanceSave,
  onNavigateToDataTab,
  onNavigateToWorkspacesTab,
  onNavigateToLibrariesPositionTemplates,
}: OrganizationSettingsSectionProps) {
  const useOrgTabsScope = useMemo(() => createTabsScope(), []);
  const orgTabsScope = useOrgTabsScope(undefined);

  return (
    <div className="space-y-4">
      <Tabs
        __scopeTabs={orgTabsScope}
        value={organizationSubTab}
        onValueChange={(value) => onOrganizationSubTabChange(value as OrganizationSettingsSubTabId)}
      >
        <TabsList __scopeTabs={orgTabsScope} className="grid h-auto w-full grid-cols-1 sm:grid-cols-3">
          <TabsTrigger __scopeTabs={orgTabsScope} value="overview">
            Overview
          </TabsTrigger>
          <TabsTrigger __scopeTabs={orgTabsScope} value="crew">
            Master crew
          </TabsTrigger>
          <TabsTrigger __scopeTabs={orgTabsScope} value="maintenance">
            Maintenance cautions
          </TabsTrigger>
        </TabsList>

        <TabsContent __scopeTabs={orgTabsScope} value="overview" className="space-y-4 pt-4 focus-visible:outline-none">
          <OrganizationMasterPanel
            authBackend={authBackend}
            organizations={organizations}
            activeOrganizationId={activeOrganizationId}
            activeOrganizationName={activeOrganizationName}
            activeOrganizationRole={activeOrganizationRole}
            loading={organizationsLoading}
            selectOrganization={selectOrganization}
            refreshOrganizations={refreshOrganizations}
          />

          <Card>
            <CardHeader>
              <CardTitle>Organization library</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm text-muted-foreground">
              <p>
                Shared organization bundles (libraries, lookups, portable metadata tied to your org in Supabase) are
                exported and imported from Data Management—not from this shortcut card alone.
              </p>
              {authBackend === 'supabase' && !activeOrganizationId ? (
                <p>Select an organization above (or join a workspace linked to one) for library portability.</p>
              ) : null}
              {authBackend !== 'supabase' ? (
                <p>Organization-level cloud sync applies when you sign in with Supabase and use team workspaces.</p>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={onNavigateToDataTab}>
                  Open Data Management
                </Button>
                <Button type="button" variant="outline" onClick={onNavigateToWorkspacesTab}>
                  Workspaces and invites
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Define the master organization</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>
                The large title at the top of this tab is your current master organization. Use the org buttons there to
                switch between organizations you belong to (for example after creating{' '}
                <span className="font-medium text-foreground">ABC Corp</span>). To stand up a{' '}
                <span className="font-medium text-foreground">new</span> organization, create a workspace so Supabase ties
                org data, exports, and org-scoped libraries to that tenant.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={onNavigateToWorkspacesTab}>
                  Set up workspace (new org)
                </Button>
                <Button type="button" variant="outline" onClick={onNavigateToLibrariesPositionTemplates}>
                  Crew position templates (org library)
                </Button>
              </div>
              {authBackend !== 'supabase' ? (
                <p className="text-xs">
                  Organization features apply after you sign in with Supabase and use a team workspace.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent __scopeTabs={orgTabsScope} value="crew" className="space-y-3 pt-4 focus-visible:outline-none">
          <div className="flex items-center gap-2 text-foreground">
            <Contact className="h-4 w-4 shrink-0 opacity-90" aria-hidden />
            <h2 className="text-base font-semibold">Master crew</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Master crew contacts are shared across productions. Each production&apos;s Crew tab assigns people to that
            shoot; attach names from this roster when building a crew list.
          </p>
          <CrewPage />
        </TabsContent>

        <TabsContent __scopeTabs={orgTabsScope} value="maintenance" className="pt-4 focus-visible:outline-none">
          <OrgMaintenanceBroadcastTemplateSection
            organizationId={activeOrganizationId}
            authBackend={authBackend}
            storedTemplate={orgMaintenanceTemplateStored}
            canEdit={activeOrganizationRole === 'admin' || activeOrganizationRole === 'editor'}
            onAfterSave={onAfterOrgMaintenanceSave}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
