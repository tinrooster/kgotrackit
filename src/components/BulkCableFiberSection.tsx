import * as React from 'react';
import { UseFormReturn, useWatch } from 'react-hook-form';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Combobox } from '@/components/ui/combobox';
import {
  addUserCableColor,
  addUserConnectorType,
  getCableColorDropdownValues,
  getConnectorSelectModel,
  rememberCableColorFromSelection,
} from '@/lib/cableFacetPicklists';

interface BulkCableFiberSectionProps {
  form: UseFormReturn<any>;
}

const CABLE_COLOR_NONE = '__none__';
const CONNECTOR_NONE = '__none__';

const FIBER_COMBO_OPTIONS: { value: string; label: string }[] = [
  { value: 'na', label: 'N/A (not fiber)' },
  { value: 'sm', label: 'Single-mode (SM)' },
  { value: 'mm', label: 'Multimode (MM)' },
  { value: 'mtp_mpo', label: 'MTP/MPO' },
];

export function BulkCableFiberSection({ form }: BulkCableFiberSectionProps) {
  const [picklistEpoch, setPicklistEpoch] = React.useState(0);
  const [newColorDraft, setNewColorDraft] = React.useState('');
  const [newConnectorDraft, setNewConnectorDraft] = React.useState('');

  const cableColorValue = useWatch({ control: form.control, name: 'cableColor' });
  const connectorValue = useWatch({ control: form.control, name: 'connectorType' });

  const colorOptions = React.useMemo(
    () => getCableColorDropdownValues(cableColorValue),
    [picklistEpoch, cableColorValue],
  );

  const connectorComboboxOptions = React.useMemo(() => {
    const m = getConnectorSelectModel(connectorValue);
    const opts: { label: string; value: string }[] = [{ label: 'Not set', value: CONNECTOR_NONE }];
    m.presets.forEach((p) => opts.push({ label: p, value: p }));
    m.userDefined.forEach((p) => opts.push({ label: p, value: p }));
    if (m.orphan) {
      opts.push({ label: `${m.orphan} (from record)`, value: m.orphan });
    }
    return opts;
  }, [connectorValue, picklistEpoch]);

  const colorComboboxOptions = React.useMemo(
    () => [{ label: 'Not set', value: CABLE_COLOR_NONE }, ...colorOptions.map((c) => ({ label: c, value: c }))],
    [colorOptions],
  );

  const bump = () => setPicklistEpoch((n) => n + 1);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <FormField
        control={form.control}
        name="cableColor"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Color</FormLabel>
            <Combobox
              options={colorComboboxOptions}
              value={field.value?.trim() ? field.value : CABLE_COLOR_NONE}
              onChange={(v) => {
                const next = v === CABLE_COLOR_NONE ? '' : v;
                field.onChange(next);
                if (next) {
                  rememberCableColorFromSelection(next);
                  bump();
                }
              }}
              placeholder="Select color"
              emptyText="No color matches."
            />
            <div className="mt-1 flex flex-wrap gap-2">
              <Input
                value={newColorDraft}
                onChange={(e) => setNewColorDraft(e.target.value)}
                placeholder="Add custom color"
                className="h-8 min-w-[8rem] flex-1 text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                  }
                }}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-8 shrink-0"
                onClick={() => {
                  if (addUserCableColor(newColorDraft)) {
                    form.setValue('cableColor', newColorDraft.trim(), { shouldDirty: true, shouldTouch: true });
                    setNewColorDraft('');
                    bump();
                  }
                }}
              >
                Add to list
              </Button>
            </div>
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
            <Combobox
              options={FIBER_COMBO_OPTIONS}
              value={field.value || 'na'}
              onChange={(v) => field.onChange(v)}
              placeholder="Select fiber type"
              emptyText="No matches."
            />
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="connectorType"
        render={({ field }) => (
          <FormItem className="sm:col-span-2">
            <FormLabel>Connector type</FormLabel>
            <Combobox
              options={connectorComboboxOptions}
              value={field.value?.trim() ? field.value : CONNECTOR_NONE}
              onChange={(v) => field.onChange(v === CONNECTOR_NONE ? '' : v)}
              placeholder="Select connector type"
              emptyText="No connector matches."
            />
            <div className="mt-1 flex flex-wrap gap-2">
              <Input
                value={newConnectorDraft}
                onChange={(e) => setNewConnectorDraft(e.target.value)}
                placeholder="Add custom connector type"
                className="h-8 min-w-[8rem] flex-1 text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                  }
                }}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-8 shrink-0"
                onClick={() => {
                  if (addUserConnectorType(newConnectorDraft)) {
                    form.setValue('connectorType', newConnectorDraft.trim(), { shouldDirty: true, shouldTouch: true });
                    setNewConnectorDraft('');
                    bump();
                  }
                }}
              >
                Add to list
              </Button>
            </div>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="cableLotNumber"
        render={({ field }) => (
          <FormItem className="sm:col-span-2">
            <FormLabel>Lot / reel #</FormLabel>
            <FormControl>
              <Input
                {...field}
                value={field.value || ''}
                placeholder="Manufacturer or reel lot"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
