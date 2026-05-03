import * as React from 'react';
import { UseFormReturn } from "react-hook-form";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ScanLine } from "lucide-react";
import { ItemPhotoField } from "@/components/ItemPhotoField";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FinancialCodeEntry } from "@/lib/financialSettingsService";
import { Combobox } from "@/components/ui/combobox";
import {
  DEVICE_LIBRARY_UPDATED_EVENT,
  getDeviceLibrary,
} from "@/lib/deviceLibraryStorage";
import { STORAGE_KEYS } from "@/lib/storageService";
import {
  applyDeviceLibraryEntryToForm,
  deviceLibraryToComboboxOptions,
} from "@/lib/deviceLibraryFormApply";

interface AdditionalInfoTabProps {
  form: UseFormReturn<any>;
  onScanBarcode?: () => void;
  expenseTypes?: FinancialCodeEntry[];
  costCenters?: FinancialCodeEntry[];
  /** Top-level supplier names from settings (used to match device library default supplier). */
  supplierNames?: string[];
}

export function AdditionalInfoTab({
  form,
  onScanBarcode,
  expenseTypes = [],
  costCenters = [],
  supplierNames = [],
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
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(DEVICE_LIBRARY_UPDATED_EVENT, bump);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const deviceLibraryEntries = React.useMemo(
    () => getDeviceLibrary(),
    [deviceLibraryEpoch],
  );
  const deviceLibraryOptions = React.useMemo(
    () => deviceLibraryToComboboxOptions(deviceLibraryEntries),
    [deviceLibraryEntries],
  );

  return (
    <div className="space-y-4">
      {deviceLibraryOptions.length > 0 ? (
        <div className="rounded-md border border-border/60 bg-muted/30 p-3">
          <p className="mb-2 text-sm font-medium text-foreground">Device library</p>
          <Combobox
            key={deviceLibraryPickerKey}
            options={deviceLibraryOptions}
            value=""
            onChange={(id) => {
              const entry = deviceLibraryEntries.find((e) => e.id === id);
              if (entry) {
                applyDeviceLibraryEntryToForm(form, entry, supplierNames);
                setDeviceLibraryPickerKey((k) => k + 1);
              }
            }}
            placeholder="Apply manufacturer, model, and supplier hints from catalog…"
            emptyText="No catalog rows match."
          />
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-4">
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
                  form.setValue("expenseTypeDescription", selected?.description || "");
                }}
                value={field.value || "N/A"}
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
                  form.setValue("costCenterDescription", selected?.description || "");
                }}
                value={field.value || "N/A"}
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

        {/* Barcode field with scanner button */}
        <FormField
          control={form.control}
          name="barcode"
          render={({ field }) => (
            <FormItem className="flex-1">
              <FormLabel>Barcode</FormLabel>
              <div className="flex gap-2">
                <FormControl>
                  <Input {...field} placeholder="Enter barcode" />
                </FormControl>
                {onScanBarcode && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={onScanBarcode}
                  >
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
              <FormLabel>Serial Number</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Enter serial number" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

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
              <FormLabel>Model Number</FormLabel>
              <FormControl>
                <Input {...field} placeholder="Enter model number" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="col-span-2 space-y-3 border-t border-border/60 pt-4">
          <p className="text-sm font-medium text-foreground">Cable &amp; fiber</p>
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="cableColor"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Jacket / trace color</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value || ''} placeholder="e.g. Yellow, Aqua" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="fiberMode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Fiber type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value || 'na'}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="na">N/A (not fiber)</SelectItem>
                      <SelectItem value="sm">Single-mode (SM)</SelectItem>
                      <SelectItem value="mm">Multimode (MM)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="connectorType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Connector</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value || ''} placeholder="e.g. LC duplex, MTP" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="cableLotNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Lot / reel #</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value || ''} placeholder="Manufacturer or reel lot" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        </div>

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
            <FormItem className="sm:col-span-2">
              <FormLabel>Company asset tag</FormLabel>
              <FormControl>
                <Input {...field} value={field.value || ""} placeholder="External asset number (optional)" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <ItemPhotoField form={form} className="col-span-2" />
      </div>

      {/* Notes fields */}
      <div className="space-y-4">
        <FormField
          control={form.control}
          name="manufacturerNotes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Manufacturer Notes</FormLabel>
              <FormControl>
                <Textarea 
                  {...field} 
                  placeholder="Enter manufacturer notes"
                  className="min-h-[80px]"
                />
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
                <Textarea 
                  {...field} 
                  placeholder="Enter maintenance notes"
                  className="min-h-[80px]"
                />
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
                <Textarea 
                  {...field} 
                  placeholder="Enter additional notes"
                  className="min-h-[80px]"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className="space-y-4 rounded-lg border border-border/70 bg-muted/10 p-4">
        <p className="text-sm font-medium text-foreground">Decommissioning &amp; lifecycle</p>
        <p className="text-xs text-muted-foreground">
          Track EOL planning, cut-over dates, and audit notes. Use Asset status on the Details tab for operational flags
          (e.g. Ready to Decommission).
        </p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="decomEOLDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>EOL target date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} value={field.value || ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="decomCutoverDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Cut-over scheduled</FormLabel>
                <FormControl>
                  <Input type="date" {...field} value={field.value || ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="decomLastAuditAt"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Last lifecycle audit</FormLabel>
                <FormControl>
                  <Input
                    type="datetime-local"
                    {...field}
                    value={field.value || ""}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="decomNotes"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Audit / EOL / cut-over notes</FormLabel>
                <FormControl>
                  <Textarea
                    {...field}
                    placeholder="Audit findings, approvals, dependencies, rollback notes…"
                    className="min-h-[80px]"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      </div>
    </div>
  );
} 