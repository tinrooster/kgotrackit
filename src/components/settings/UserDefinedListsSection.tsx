import type { Dispatch, SetStateAction } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import CabinetManagement from '@/pages/CabinetManagement';
import { FinancialCodesTab } from '@/components/settings/FinancialCodesTab';
import { ItemWithSubcategories } from '@/types/inventory';
import { FinancialCodeEntry, saveFinancialSettings } from '@/lib/financialSettingsService';
import { logger } from '@/lib/logging';
import { EditableItemWithSubcategoriesList } from '@/components/EditableItemWithSubcategoriesList';
import { getItems } from '@/lib/storageService';

export type UserDefinedPanel =
  | 'overview'
  | 'categories'
  | 'units'
  | 'locations'
  | 'projects'
  | 'financial'
  | 'cabinets';

interface SettingsListsState {
  categories: ItemWithSubcategories[];
  units: ItemWithSubcategories[];
  locations: ItemWithSubcategories[];
  suppliers: ItemWithSubcategories[];
  projects: ItemWithSubcategories[];
  expenseCodes: ItemWithSubcategories[];
}

type SettingsKey = keyof SettingsListsState;

const LIST_NAV: { id: Exclude<UserDefinedPanel, 'overview'>; label: string }[] = [
  { id: 'categories', label: 'Categories' },
  { id: 'units', label: 'Units' },
  { id: 'locations', label: 'Locations' },
  { id: 'projects', label: 'Projects' },
  { id: 'cabinets', label: 'Cab/Storage' },
  { id: 'financial', label: 'Expense Codes' },
];

export interface UserDefinedListsSectionProps {
  panel: UserDefinedPanel;
  onPanelChange: (panel: UserDefinedPanel) => void;
  settings: SettingsListsState;
  updateSettingsList: (key: SettingsKey, newValue: ItemWithSubcategories[]) => void;
  financialSettings: { expenseTypes: FinancialCodeEntry[]; costCenters: FinancialCodeEntry[] };
  setFinancialSettings: Dispatch<
    SetStateAction<{ expenseTypes: FinancialCodeEntry[]; costCenters: FinancialCodeEntry[] }>
  >;
  currentUsername: string;
  onRequestDeleteReconcile: (payload: { type: string; value: string; affectedCount: number }) => void;
}

export function UserDefinedListsSection({
  panel,
  onPanelChange,
  settings,
  updateSettingsList,
  financialSettings,
  setFinancialSettings,
  currentUsername,
  onRequestDeleteReconcile,
}: UserDefinedListsSectionProps) {
  const requestReconcile = (type: string, value: string, affectedCount: number) => {
    onRequestDeleteReconcile({ type, value, affectedCount });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Lookup Lists</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <nav className="flex flex-wrap gap-2" aria-label="Lookup list type">
            {LIST_NAV.map(({ id, label }) => (
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

          {panel === 'overview' && null}

          {panel === 'categories' && (
            <Card>
              <CardHeader>
                <CardTitle>Categories</CardTitle>
              </CardHeader>
              <CardContent>
                <EditableItemWithSubcategoriesList
                  hideListTitle
                  items={settings.categories}
                  setItems={(newItems) => updateSettingsList('categories', newItems)}
                  title="Categories"
                  showColorPicker
                  onCheckBeforeDelete={(value, onSafeToDelete) => {
                    const items = getItems();
                    const affectedItems = items.filter((item) => item.category === value);
                    if (affectedItems.length > 0) {
                      requestReconcile('Categories', value, affectedItems.length);
                    } else {
                      onSafeToDelete();
                    }
                  }}
                />
              </CardContent>
            </Card>
          )}

          {panel === 'units' && (
            <Card>
              <CardHeader>
                <CardTitle>Units</CardTitle>
              </CardHeader>
              <CardContent>
                <EditableItemWithSubcategoriesList
                  hideListTitle
                  items={settings.units}
                  setItems={(newItems) => updateSettingsList('units', newItems)}
                  title="Units"
                  onCheckBeforeDelete={(value, onSafeToDelete) => {
                    const items = getItems();
                    const affectedItems = items.filter((item) => item.unit === value);
                    if (affectedItems.length > 0) {
                      requestReconcile('Units', value, affectedItems.length);
                    } else {
                      onSafeToDelete();
                    }
                  }}
                />
              </CardContent>
            </Card>
          )}

          {panel === 'locations' && (
            <Card>
              <CardHeader>
                <CardTitle>Locations</CardTitle>
              </CardHeader>
              <CardContent>
                <EditableItemWithSubcategoriesList
                  hideListTitle
                  items={settings.locations}
                  setItems={(newItems) => updateSettingsList('locations', newItems)}
                  title="Locations"
                  showColorPicker
                  colorPickerLabel="Location color"
                  locationRackExtension
                  onCheckBeforeDelete={(value, onSafeToDelete) => {
                    const items = getItems();
                    const affectedItems = items.filter((item) => item.location === value);
                    if (affectedItems.length > 0) {
                      requestReconcile('Locations', value, affectedItems.length);
                    } else {
                      onSafeToDelete();
                    }
                  }}
                />
              </CardContent>
            </Card>
          )}

          {panel === 'projects' && (
            <Card>
              <CardHeader>
                <CardTitle>Projects</CardTitle>
              </CardHeader>
              <CardContent>
                <EditableItemWithSubcategoriesList
                  hideListTitle
                  items={settings.projects}
                  setItems={(newItems) => updateSettingsList('projects', newItems)}
                  title="Projects"
                  showColorPicker
                  colorPickerLabel="Project color"
                  onCheckBeforeDelete={(value, onSafeToDelete) => {
                    const items = getItems();
                    const affectedItems = items.filter((item) => item.project === value);
                    if (affectedItems.length > 0) {
                      requestReconcile('Projects', value, affectedItems.length);
                    } else {
                      onSafeToDelete();
                    }
                  }}
                />
              </CardContent>
            </Card>
          )}

          {panel === 'financial' && (
            <FinancialCodesTab
              expenseTypes={financialSettings.expenseTypes}
              costCenters={financialSettings.costCenters}
              onChangeExpenseTypes={(entries) => {
                const previousCodes = financialSettings.expenseTypes.map((entry) => entry.code);
                const nextCodes = entries.map((entry) => entry.code);
                const next = { ...financialSettings, expenseTypes: entries };
                setFinancialSettings(next);
                saveFinancialSettings(next);
                logger.info(
                  'security',
                  'FINANCIAL_EXPENSE_TYPES_UPDATED',
                  {
                    previousCount: previousCodes.length,
                    nextCount: nextCodes.length,
                    addedCodes: nextCodes.filter((code) => !previousCodes.includes(code)),
                    removedCodes: previousCodes.filter((code) => !nextCodes.includes(code)),
                    performedBy: currentUsername || 'Unknown',
                  },
                  'SettingsPage'
                );
              }}
              onChangeCostCenters={(entries) => {
                const previousCodes = financialSettings.costCenters.map((entry) => entry.code);
                const nextCodes = entries.map((entry) => entry.code);
                const next = { ...financialSettings, costCenters: entries };
                setFinancialSettings(next);
                saveFinancialSettings(next);
                logger.info(
                  'security',
                  'FINANCIAL_COST_CENTERS_UPDATED',
                  {
                    previousCount: previousCodes.length,
                    nextCount: nextCodes.length,
                    addedCodes: nextCodes.filter((code) => !previousCodes.includes(code)),
                    removedCodes: previousCodes.filter((code) => !nextCodes.includes(code)),
                    performedBy: currentUsername || 'Unknown',
                  },
                  'SettingsPage'
                );
              }}
            />
          )}

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
        </CardContent>
      </Card>
    </div>
  );
}
