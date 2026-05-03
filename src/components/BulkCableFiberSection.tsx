import * as React from 'react';
import { UseFormReturn, useWatch } from 'react-hook-form';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
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

  const connectorModel = React.useMemo(
    () => getConnectorSelectModel(connectorValue),
    [picklistEpoch, connectorValue],
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
            <Select
              value={field.value?.trim() ? field.value : CABLE_COLOR_NONE}
              onValueChange={(v) => {
                const next = v === CABLE_COLOR_NONE ? '' : v;
                field.onChange(next);
                if (next) {
                  rememberCableColorFromSelection(next);
                  bump();
                }
              }}
            >
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Select color" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value={CABLE_COLOR_NONE}>Not set</SelectItem>
                {colorOptions.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                <SelectItem value="mtp_mpo">MTP/MPO</SelectItem>
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
          <FormItem className="sm:col-span-2">
            <FormLabel>Connector type</FormLabel>
            <Select
              value={field.value?.trim() ? field.value : CONNECTOR_NONE}
              onValueChange={(v) => {
                field.onChange(v === CONNECTOR_NONE ? '' : v);
              }}
            >
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Select connector" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value={CONNECTOR_NONE}>Not set</SelectItem>
                {connectorModel.presets.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
                {connectorModel.userDefined.length > 0 ? (
                  <>
                    <Separator className="my-1" />
                    {connectorModel.userDefined.map((p) => (
                      <SelectItem key={`user:${p}`} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </>
                ) : null}
                {connectorModel.orphan ? (
                  <SelectItem value={connectorModel.orphan}>{connectorModel.orphan} (from record)</SelectItem>
                ) : null}
              </SelectContent>
            </Select>
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
              <Input {...field} value={field.value || ''} placeholder="Manufacturer or reel lot" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
