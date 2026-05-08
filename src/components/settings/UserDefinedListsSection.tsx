import { type Dispatch, type SetStateAction } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FinancialCodesTab } from '@/components/settings/FinancialCodesTab';
import { ItemWithSubcategories } from '@/types/inventory';
import { FinancialCodeEntry, saveFinancialSettings } from '@/lib/financialSettingsService';
import { logger } from '@/lib/logging';
import { EditableItemWithSubcategoriesList } from '@/components/EditableItemWithSubcategoriesList';
import { getItems } from '@/lib/storageService';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useHorizontalScrollHints } from '@/components/ui/useHorizontalScrollHints';

export type UserDefinedPanel =
  | 'overview'
  | 'categories'
  | 'units'
  | 'locations'
  | 'projects'
  | 'financial';

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
  onNormalizeRackIds?: () => void;
  canDeleteItems?: boolean;
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
  onNormalizeRackIds,
  canDeleteItems = true,
}: UserDefinedListsSectionProps) {
  const lookupPanelCardClassName = 'lookup-panel-card';
  const lookupPanelCardHeaderClassName = 'lookup-panel-card-header';
  const lookupPanelCardContentClassName = 'lookup-panel-card-content';
  const {
    scrollRef: listNavRef,
    isOverflowing: isListNavOverflowing,
    canScrollLeft: listNavCanScrollLeft,
    canScrollRight: listNavCanScrollRight,
    shouldPulseRightHint: shouldPulseListNavHint,
  } = useHorizontalScrollHints<HTMLElement>({
    pulseStorageKey: 'lookup-list-nav-hint-pulsed',
  });

  const requestReconcile = (type: string, value: string, affectedCount: number) => {
    onRequestDeleteReconcile({ type, value, affectedCount });
  };

  return (
    <div className="space-y-4">
      <Card className="lookup-lists-shell-card">
        <CardHeader className="pb-2">
          <CardTitle>Lookup Lists</CardTitle>
        </CardHeader>
        <CardContent className="lookup-lists-mobile-compact space-y-3 sm:space-y-4">
          <div
            className="lookup-lists-nav-shell relative"
            data-overflowing={isListNavOverflowing ? 'true' : 'false'}
            data-can-scroll-left={listNavCanScrollLeft ? 'true' : 'false'}
            data-can-scroll-right={listNavCanScrollRight ? 'true' : 'false'}
          >
            <nav
              ref={listNavRef}
              className="flex flex-nowrap gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              aria-label="Lookup list type"
            >
              {LIST_NAV.map(({ id, label }) => (
                <Button
                  key={id}
                  type="button"
                  size="sm"
                  variant={panel === id ? 'secondary' : 'outline'}
                  className="shrink-0"
                  onClick={() => onPanelChange(id)}
                >
                  {label}
                </Button>
              ))}
            </nav>
            <div className="settings-tabs-scroll-hint settings-tabs-scroll-hint-left" aria-hidden>
              <ChevronLeft className="h-4 w-4" />
            </div>
            <div
              className={`settings-tabs-scroll-hint settings-tabs-scroll-hint-right${shouldPulseListNavHint ? ' settings-tabs-scroll-hint-pulse-once' : ''}`}
              aria-hidden
            >
              <ChevronRight className="h-4 w-4" />
            </div>
          </div>

          {panel === 'overview' && null}

          {panel === 'categories' && (
            <Card className={lookupPanelCardClassName}>
              <CardHeader className={lookupPanelCardHeaderClassName}>
                <CardTitle>Categories</CardTitle>
              </CardHeader>
              <CardContent className={lookupPanelCardContentClassName}>
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
                  canDeleteItems={canDeleteItems}
                />
              </CardContent>
            </Card>
          )}

          {panel === 'units' && (
            <Card className={lookupPanelCardClassName}>
              <CardHeader className={lookupPanelCardHeaderClassName}>
                <CardTitle>Units</CardTitle>
              </CardHeader>
              <CardContent className={lookupPanelCardContentClassName}>
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
                  canDeleteItems={canDeleteItems}
                />
              </CardContent>
            </Card>
          )}

          {panel === 'locations' && (
            <Card className={lookupPanelCardClassName}>
              <CardHeader className={`${lookupPanelCardHeaderClassName} flex flex-row items-center justify-between gap-2`}>
                <CardTitle>Locations</CardTitle>
                {onNormalizeRackIds ? (
                  <Button type="button" size="sm" variant="outline" onClick={onNormalizeRackIds}>
                    Normalize rack IDs
                  </Button>
                ) : null}
              </CardHeader>
              <CardContent className={lookupPanelCardContentClassName}>
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
                  canDeleteItems={canDeleteItems}
                />
              </CardContent>
            </Card>
          )}

          {panel === 'projects' && (
            <Card className={lookupPanelCardClassName}>
              <CardHeader className={lookupPanelCardHeaderClassName}>
                <CardTitle>Projects</CardTitle>
              </CardHeader>
              <CardContent className={lookupPanelCardContentClassName}>
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
                  canDeleteItems={canDeleteItems}
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

        </CardContent>
      </Card>
    </div>
  );
}
