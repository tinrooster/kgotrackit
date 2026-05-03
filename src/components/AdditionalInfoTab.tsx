import * as React from 'react';
import { UseFormReturn } from 'react-hook-form';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { ScanLine } from 'lucide-react';
import { ItemPhotoField } from '@/components/ItemPhotoField';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FinancialCodeEntry } from '@/lib/financialSettingsService';
import { Combobox } from '@/components/ui/combobox';
import { DEVICE_LIBRARY_UPDATED_EVENT, getDeviceLibrary } from '@/lib/deviceLibraryStorage';
import { STORAGE_KEYS } from '@/lib/storageService';
import { applyDeviceLibraryEntryToForm, deviceLibraryToComboboxOptions } from '@/lib/deviceLibraryFormApply';
import { OptionalFormCollapsible } from '@/components/forms/OptionalFormCollapsible';
import { BulkCableFiberSection } from '@/components/BulkCableFiberSection';

interface AdditionalInfoTabProps {
  form: UseFormReturn<any>;
  onScanBarcode?: () => void;
  expenseTypes?: FinancialCodeEntry[];
  costCenters?: FinancialCodeEntry[];
  /** Top-level supplier names from settings (used to match device library default supplier). */
  supplierNames?: string[];
  /** Top-level unit names (used to match device library default stock unit). */
  unitNames?: string[];
}

export function AdditionalInfoTab({
  form,
  onScanBarcode,
  expenseTypes = [],
  costCenters = [],
  supplierNames = [],
  unitNames = [],
}: AdditionalInfoTabProps) {
  const [deviceLibraryEpoch, setDeviceLibraryEpoch] = React.useState(0);
  const [deviceLibraryPickerKey, setDeviceLibraryPickerKey] = React.useState(0);

  React.useEffect(() => {
    const bump = () => setDeviceLibraryEpoch((n) => n + 1);
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEYS.DEVICE_LIBRARY) {
        bump();
      }
    };
    window.addEventListener(DEVICE_LIBRARY_UPDATED_EVENT, bump);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(DEVICE_LIBRARY_UPDATED_EVENT, bump);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const deviceLibraryEntries = React.useMemo(() => getDeviceLibrary(), [deviceLibraryEpoch]);
  const deviceLibraryOptions = React.useMemo(
    () => deviceLibraryToComboboxOptions(deviceLibraryEntries),
    [deviceLibraryEntries],
  );

  return (
    <div className="mx-auto w-full max-w-[56rem] space-y-4">
      <OptionalFormCollapsible title="Expense & allocation">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="expenseTypeCode"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Expense Type</FormLabel>
                <Select
                  onValueChange={(value) => {
                    const selected = expenseTypes.find((entry) => entry.code === value);
                    field.onChange(value);
                    form.setValue('expenseTypeDescription', selected?.description || '');
                  }}
                  value={field.value || 'N/A'}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select expense type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="N/A">N/A</SelectItem>
                    {expenseTypes.map((entry) => (
                      <SelectItem key={entry.id} value={entry.code}>
                        {entry.code} - {entry.description}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="costCenterCode"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Cost Center / Allocation</FormLabel>
                <Select
                  onValueChange={(value) => {
                    const selected = costCenters.find((entry) => entry.code === value);
                    field.onChange(value);
                    form.setValue('costCenterDescription', selected?.description || '');
                  }}
                  value={field.value || 'N/A'}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select cost center" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="N/A">N/A</SelectItem>
                    {costCenters.map((entry) => (
                      <SelectItem key={entry.id} value={entry.code}>
                        {entry.code} - {entry.description}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </OptionalFormCollapsible>

      {deviceLibraryOptions.length > 0 ? (
        <OptionalFormCollapsible title="Device library">
          <FormField
            control={form.control}
            name="deviceLibraryId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Catalog row</FormLabel>
                <Combobox
                  key={deviceLibraryPickerKey}
                  options={[{ value: '', label: 'None' }, ...deviceLibraryOptions]}
                  value={field.value || ''}
                  onChange={(id) => {
                    field.onChange(id || undefined);
                    if (!id) {
                      setDeviceLibraryPickerKey((k) => k + 1);
                      return;
                    }
                    const entry = deviceLibraryEntries.find((e) => e.id === id);
                    if (entry) {
                      applyDeviceLibraryEntryToForm(form, entry, supplierNames, unitNames);
                      setDeviceLibraryPickerKey((k) => k + 1);
                    }
                  }}
                  placeholder="Select catalog row…"
                  emptyText="No catalog rows match."
                />
                <FormMessage />
              </FormItem>
            )}
          />
        </OptionalFormCollapsible>
      ) : null}

      <OptionalFormCollapsible title="Identifiers">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="barcode"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Barcode</FormLabel>
                <div className="flex gap-2">
                  <FormControl>
                    <Input {...field} placeholder="Enter barcode" />
                  </FormControl>
                  {onScanBarcode && (
                    <Button type="button" variant="outline" size="icon" onClick={onScanBarcode}>
                      <ScanLine className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="serialNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Serial number</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Enter serial number" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </OptionalFormCollapsible>

      <OptionalFormCollapsible title="Manufacturer & model">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="manufacturer"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Manufacturer</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Enter manufacturer" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="modelNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Model number</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Enter model number" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </OptionalFormCollapsible>

      <OptionalFormCollapsible title="Bulk cable & fiber">
        <BulkCableFiberSection form={form} />
      </OptionalFormCollapsible>

      <OptionalFormCollapsible title="Service record & photo">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField
            control={form.control}
            name="dateInService"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Date in Service</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="companyAssetTag"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Company asset tag</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value || ''} placeholder="External asset number" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <ItemPhotoField form={form} className="md:col-span-2" />
        </div>
      </OptionalFormCollapsible>

      <OptionalFormCollapsible title="Notes">
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="manufacturerNotes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Manufacturer Notes</FormLabel>
                <FormControl>
                  <Textarea {...field} placeholder="Enter manufacturer notes" className="min-h-[80px]" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="maintenanceNotes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Maintenance Notes</FormLabel>
                <FormControl>
                  <Textarea {...field} placeholder="Enter maintenance notes" className="min-h-[80px]" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="additionalNotes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Additional Notes</FormLabel>
                <FormControl>
                  <Textarea {...field} placeholder="Enter additional notes" className="min-h-[80px]" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </OptionalFormCollapsible>
    </div>
  );
}
