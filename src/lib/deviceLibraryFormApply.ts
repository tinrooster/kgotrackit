import type { UseFormReturn } from 'react-hook-form';
import type { DeviceLibraryEntry } from '@/types/deviceLibrary';
import { ensureUrlProtocol } from '@/utils/url';

export function deviceLibraryToComboboxOptions(
  entries: DeviceLibraryEntry[],
): { value: string; label: string }[] {
  return entries.map((entry) => ({
    value: entry.id,
    label: entry.modelNumber
      ? `${entry.manufacturer} · ${entry.modelNumber}`
      : entry.manufacturer,
  }));
}

/** Fills manufacturer, model, supplier website, and supplier (when name matches a lookup list row). */
export function applyDeviceLibraryEntryToForm(
  form: UseFormReturn<any>,
  entry: DeviceLibraryEntry,
  supplierTopLevelNames: readonly string[],
): void {
  form.setValue('manufacturer', entry.manufacturer, { shouldDirty: true, shouldTouch: true });
  form.setValue('modelNumber', entry.modelNumber || '', { shouldDirty: true, shouldTouch: true });

  if (entry.defaultSupplierWebsite?.trim()) {
    form.setValue('supplierWebsite', ensureUrlProtocol(entry.defaultSupplierWebsite.trim()), {
      shouldDirty: true,
      shouldTouch: true,
    });
  }

  const hint = entry.defaultSupplier?.trim();
  if (hint) {
    const match = supplierTopLevelNames.find((n) => n.toLowerCase() === hint.toLowerCase());
    if (match) {
      form.setValue('supplier', match, { shouldDirty: true, shouldTouch: true });
    }
  }
}
