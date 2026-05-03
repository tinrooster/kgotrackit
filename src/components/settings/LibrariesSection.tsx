import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ItemWithSubcategories } from '@/types/inventory';
import { EditableItemWithSubcategoriesList } from '@/components/EditableItemWithSubcategoriesList';
import { getItems } from '@/lib/storageService';
import { TemplatesPage } from '@/pages/TemplatesPage';
import { DeviceLibraryTab } from '@/components/settings/DeviceLibraryTab';

export type LibrariesPanel = 'suppliers' | 'templates' | 'deviceLibrary';

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
}

const LIB_NAV: { id: LibrariesPanel; label: string }[] = [
  { id: 'suppliers', label: 'Suppliers' },
  { id: 'templates', label: 'Templates' },
  { id: 'deviceLibrary', label: 'Device library' },
];

export function LibrariesSection({
  panel,
  onPanelChange,
  settings,
  updateSettingsList,
  onRequestDeleteReconcile,
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
            Supplier names, portal URLs, saved templates, and the device catalog. Lookup Lists keeps categories,
            units, locations, and projects.
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
                <CardTitle>Suppliers</CardTitle>
              </CardHeader>
              <CardContent>
                <EditableItemWithSubcategoriesList
                  hideListTitle
                  items={settings.suppliers}
                  setItems={(newItems) => updateSettingsList('suppliers', newItems)}
                  title="Suppliers"
                  enableSubcategories={false}
                  perItemWebsiteField
                  onCheckBeforeDelete={(value, onSafeToDelete) => {
                    const items = getItems();
                    const affectedItems = items.filter((item) => item.supplier === value);
                    if (affectedItems.length > 0) {
                      requestReconcile('Suppliers', value, affectedItems.length);
                    } else {
                      onSafeToDelete();
                    }
                  }}
                />
              </CardContent>
            </Card>
          )}

          {panel === 'templates' && <TemplatesPage />}

          {panel === 'deviceLibrary' && <DeviceLibraryTab />}
        </CardContent>
      </Card>
    </div>
  );
}
