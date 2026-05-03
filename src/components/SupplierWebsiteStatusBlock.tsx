import * as React from 'react';
import type { UseFormReturn } from 'react-hook-form';
import { useWatch } from 'react-hook-form';
import type { ItemWithSubcategories } from '@/types/inventory';
import { ensureUrlProtocol } from '@/utils/url';

interface SupplierWebsiteStatusBlockProps {
  form: UseFormReturn<any>;
  suppliers: ItemWithSubcategories[];
  /** Help text when no URL is configured in Settings → Libraries → Suppliers. */
  settingsHint?: string;
}

/** Keeps `supplierWebsite` in the form model in sync with the selected supplier's configured URL (read-only UI). */
export function SupplierWebsiteStatusBlock({
  form,
  suppliers,
  settingsHint = 'Set it under Settings → Libraries → Suppliers.',
}: SupplierWebsiteStatusBlockProps) {
  const supplierName = useWatch({ control: form.control, name: 'supplier' }) as string | undefined;
  const configured = React.useMemo(() => {
    const name = (supplierName || '').trim();
    if (!name) {
      return '';
    }
    const row = suppliers.find((s) => s.name === name);
    return (row?.website || '').trim();
  }, [supplierName, suppliers]);

  React.useEffect(() => {
    form.setValue('supplierWebsite', configured ? ensureUrlProtocol(configured) : '', {
      shouldDirty: false,
      shouldValidate: true,
    });
  }, [configured, form]);

  return (
    <div className="rounded-md border border-border/60 bg-muted/25 px-3 py-2 text-sm md:col-span-2">
      <p className="text-xs font-medium text-muted-foreground">Supplier website</p>
      {configured ? (
        <a
          href={ensureUrlProtocol(configured)}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-block break-all font-medium text-primary underline-offset-4 hover:underline"
        >
          {configured}
        </a>
      ) : (
        <p className="mt-1 text-muted-foreground">
          {supplierName?.trim()
            ? `No portal URL saved for “${supplierName.trim()}”. ${settingsHint}`
            : `Select a supplier first. ${settingsHint}`}
        </p>
      )}
    </div>
  );
}
