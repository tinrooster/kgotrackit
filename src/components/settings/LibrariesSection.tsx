import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ItemWithSubcategories } from '@/types/inventory';
import { EditableItemWithSubcategoriesList } from '@/components/EditableItemWithSubcategoriesList';
import { getItems } from '@/lib/storageService';
import { TemplatesPage } from '@/pages/TemplatesPage';
import { DeviceLibraryTab } from '@/components/settings/DeviceLibraryTab';
import { PositionTemplatesPanel } from '@/components/settings/PositionTemplatesPanel';
import CabinetManagement from '@/pages/CabinetManagement';
import { MaintenanceCautionsSettingsCard } from '@/components/settings/MaintenanceCautionsSettingsCard';
import type { DefaultSettings } from '@/lib/settingsService';

export type LibrariesPanel =
  | 'suppliers'
  | 'positionTemplates'
  | 'templates'
  | 'deviceLibrary'
  | 'cabinets'
  | 'maintenanceCautions';

interface SettingsListsState {
  categories: ItemWithSubcategories[];
  units: ItemWithSubcategories[];
  locations: ItemWithSubcategories[];
  suppliers: ItemWithSubcategories[];
  projects: ItemWithSubcategories[];
  expenseCodes: ItemWithSubcategories[];
}

type SettingsKey = keyof SettingsListsState;

export interface LibrariesSectionProps {
  panel: LibrariesPanel;
  onPanelChange: (panel: LibrariesPanel) => void;
  settings: SettingsListsState;
  updateSettingsList: (key: SettingsKey, newValue: ItemWithSubcategories[]) => void;
  onRequestDeleteReconcile: (payload: { type: string; value: string; affectedCount: number }) => void;
  canDeleteItems?: boolean;
  workspaceDefaultSettings: DefaultSettings;
  onWorkspaceDefaultSettingsChange: (updates: Partial<DefaultSettings>) => void;
  organizationMaintenanceTemplate?: DefaultSettings['maintenanceOnAirSchedule'] | null;
  activeOrganizationId?: string | null;
}

const LIB_NAV: { id: LibrariesPanel; label: string }[] = [
  { id: 'suppliers', label: 'Vendors' },
  { id: 'templates', label: 'Item templates' },
  { id: 'deviceLibrary', label: 'Device library' },
  { id: 'cabinets', label: 'Cab/Storage' },
  { id: 'positionTemplates', label: 'Crew position templates' },
  { id: 'maintenanceCautions', label: 'Maintenance cautions' },
];

export function LibrariesSection({
  panel,
  onPanelChange,
  settings,
  updateSettingsList,
  onRequestDeleteReconcile,
  canDeleteItems = true,
  workspaceDefaultSettings,
  onWorkspaceDefaultSettingsChange,
  organizationMaintenanceTemplate = null,
  activeOrganizationId = null,
}: LibrariesSectionProps) {
  const requestReconcile = (type: string, value: string, affectedCount: number) => {
    onRequestDeleteReconcile({ type, value, affectedCount });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Libraries</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Vendor names, portal URLs, item templates, device catalog, secure storage, and planner maintenance caution
            windows. Crew position templates are stored per organization (Supabase team mode) and are also linked from
            Settings → Organization.
          </p>
          <nav className="flex flex-wrap gap-2" aria-label="Library section">
            {LIB_NAV.map(({ id, label }) => (
              <Button
                key={id}
                type="button"
                size="sm"
                variant={panel === id ? 'secondary' : 'outline'}
                onClick={() => onPanelChange(id)}
              >
                {label}
              </Button>
            ))}
          </nav>

          {panel === 'suppliers' && (
            <Card>
              <CardHeader>
                <CardTitle>Vendors</CardTitle>
              </CardHeader>
              <CardContent>
                <EditableItemWithSubcategoriesList
                  hideListTitle
                  items={settings.suppliers}
                  setItems={(newItems) => updateSettingsList('suppliers', newItems)}
                  title="Vendors"
                  enableSubcategories={false}
                  perItemSupplierProfileFields
                  onCheckBeforeDelete={(value, onSafeToDelete) => {
                    const items = getItems();
                    const affectedItems = items.filter((item) => item.supplier === value);
                    if (affectedItems.length > 0) {
                      requestReconcile('Vendors', value, affectedItems.length);
                    } else {
                      onSafeToDelete();
                    }
                  }}
                  canDeleteItems={canDeleteItems}
                />
              </CardContent>
            </Card>
          )}

          {panel === 'positionTemplates' && <PositionTemplatesPanel canDeleteItems={canDeleteItems} />}

          {panel === 'templates' && <TemplatesPage />}

          {panel === 'deviceLibrary' && <DeviceLibraryTab />}

          {panel === 'cabinets' && (
            <Card>
              <CardHeader>
                <CardTitle>Secure cabinet / storage</CardTitle>
              </CardHeader>
              <CardContent>
                <CabinetManagement locations={settings.locations.map((loc) => loc.name)} />
              </CardContent>
            </Card>
          )}

          {panel === 'maintenanceCautions' && (
            <MaintenanceCautionsSettingsCard
              settings={workspaceDefaultSettings}
              onSettingsChange={onWorkspaceDefaultSettingsChange}
              organizationMaintenanceTemplate={organizationMaintenanceTemplate}
              activeOrganizationId={activeOrganizationId}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
