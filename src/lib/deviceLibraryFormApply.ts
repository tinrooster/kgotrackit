import type { UseFormReturn } from 'react-hook-form';
import type { DeviceLibraryEntry } from '@/types/deviceLibrary';
import { ensureUrlProtocol } from '@/utils/url';

export function deviceLibraryToComboboxOptions(
  entries: DeviceLibraryEntry[],
): { value: string; label: string }[] {
  return entries.map((entry) => ({
    value: entry.id,
    label: entryLabel(entry),
  }));
}

export function entryLabel(entry: DeviceLibraryEntry): string {
  const base = entry.modelNumber ? `${entry.manufacturer} · ${entry.modelNumber}` : entry.manufacturer;
  if (entry.kind === 'cable' && entry.defaultCableColor) {
    return `${base} (${entry.defaultCableColor})`;
  }
  if (entry.kind === 'media_converter' && entry.conversionSpec) {
    return `${base} (${entry.conversionSpec})`;
  }
  return base;
}

/** Fills manufacturer, model, supplier, optional unit / cable color / description hints from a catalog row. */
export function applyDeviceLibraryEntryToForm(
  form: UseFormReturn<any>,
  entry: DeviceLibraryEntry,
  supplierTopLevelNames: readonly string[],
  unitTopLevelNames?: readonly string[],
): void {
  form.setValue('manufacturer', entry.manufacturer, { shouldDirty: true, shouldTouch: true });
  form.setValue('modelNumber', entry.modelNumber || '', { shouldDirty: true, shouldTouch: true });
  form.setValue('deviceLibraryId', entry.id, { shouldDirty: true, shouldTouch: true });

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

  const unitHint = entry.defaultStockUnit?.trim();
  if (unitHint && unitTopLevelNames && unitTopLevelNames.length > 0) {
    const unitMatch = unitTopLevelNames.find((n) => n.toLowerCase() === unitHint.toLowerCase());
    if (unitMatch) {
      form.setValue('unit', unitMatch, { shouldDirty: true, shouldTouch: true });
    }
  }

  if (entry.kind === 'cable' && entry.defaultCableColor?.trim()) {
    form.setValue('cableColor', entry.defaultCableColor.trim(), { shouldDirty: true, shouldTouch: true });
  }

  if (entry.kind === 'media_converter' && entry.conversionSpec?.trim()) {
    const line = `Media converter: ${entry.conversionSpec.trim()}`;
    const cur = form.getValues('description');
    if (typeof cur === 'string' && !cur.trim()) {
      form.setValue('description', line, { shouldDirty: true, shouldTouch: true });
    }
  }
}
