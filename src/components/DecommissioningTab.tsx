import React from 'react';
import { UseFormReturn } from 'react-hook-form';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle, Info } from 'lucide-react';
import { TimeInput } from '@/components/ui/time-input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ASSET_STATUS_GROUPS_FOR_EOL_TAB } from '@/lib/decommissioningAssetStatusOptions';
import { SettingsService, DEFAULT_SETTINGS_CHANGED_EVENT } from '@/lib/settingsService';
import { computeCutoverMaintenanceCaution } from '@/lib/maintenanceCutoverCaution';

interface DecommissioningTabProps {
  form: UseFormReturn<any>;
  /** When false, hide ON/OFF-air caution messaging (workspace viewers / personal non-admin). */
  showMaintenancePlanning?: boolean;
}

function splitDateTimeLocal(value?: string): { date: string; time: string } {
  if (!value) return { date: '', time: '' };
  const match = value.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  if (match) return { date: match[1], time: match[2] };
  const dateOnly = value.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (dateOnly) return { date: dateOnly[1], time: '00:00' };
  return { date: '', time: '' };
}

function combineDateTimeLocal(dateValue: string, timeValue: string): string {
  if (!dateValue) return '';
  const t = timeValue?.trim() ? timeValue : '00:00';
  return `${dateValue}T${t}`;
}

export function DecommissioningTab({ form, showMaintenancePlanning = true }: DecommissioningTabProps) {
  const [defaultSettings, setDefaultSettings] = React.useState(() => SettingsService.loadDefaultSettings());
  const cutoverDateTimeValue = form.watch('decomCutoverDate') as string | undefined;

  React.useEffect(() => {
    const handleSettingsChanged = () => setDefaultSettings(SettingsService.loadDefaultSettings());
    window.addEventListener(DEFAULT_SETTINGS_CHANGED_EVENT, handleSettingsChanged);
    return () => window.removeEventListener(DEFAULT_SETTINGS_CHANGED_EVENT, handleSettingsChanged);
  }, []);

  const cutoverCaution = React.useMemo(() => {
    if (!showMaintenancePlanning) {
      return null;
    }
    return computeCutoverMaintenanceCaution(cutoverDateTimeValue, defaultSettings);
  }, [cutoverDateTimeValue, defaultSettings, showMaintenancePlanning]);

  return (
    <div className="mx-auto w-full max-w-[56rem] space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">EOL (decommissioning)</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Plan end-of-life dates, cut-over, and audit notes.{' '}
          <span className="font-medium text-foreground">Asset status</span> on the Details tab is the same field as
          below—grouped here for lifecycle and decommissioning workflows.
        </p>
      </div>

      <FormField
        control={form.control}
        name="assetStatus"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Asset status</FormLabel>
            <Select onValueChange={field.onChange} value={field.value || 'active'}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Select asset status" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {ASSET_STATUS_GROUPS_FOR_EOL_TAB.map((group) => (
                  <SelectGroup key={group.label}>
                    <SelectLabel>{group.label}</SelectLabel>
                    {group.options.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <FormField
          control={form.control}
          name="decomEOLDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>EOL target date</FormLabel>
              <FormControl>
                <Input type="date" {...field} value={field.value || ''} />
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
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <FormControl>
                  <Input
                    type="date"
                    value={splitDateTimeLocal(field.value || '').date}
                    onChange={(event) => {
                      const nextDate = event.target.value;
                      const currentTime = splitDateTimeLocal(field.value || '').time;
                      field.onChange(combineDateTimeLocal(nextDate, currentTime));
                    }}
                  />
                </FormControl>
                <FormControl>
                  <TimeInput
                    value={splitDateTimeLocal(field.value || '').time}
                    onChange={(event) => {
                      const nextTime = event.currentTarget.value;
                      const currentDate = splitDateTimeLocal(field.value || '').date;
                      field.onChange(combineDateTimeLocal(currentDate, nextTime));
                    }}
                  />
                </FormControl>
              </div>
              {showMaintenancePlanning && defaultSettings.maintenanceCautionsEnabled ? (
                cutoverCaution ? (
                  <p className="mt-2 flex items-start gap-2 text-xs font-medium text-amber-500">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      {cutoverCaution.title}: {cutoverCaution.detail}
                    </span>
                  </p>
                ) : (
                  <p className="mt-2 flex items-start gap-2 text-xs text-muted-foreground">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>No maintenance caution at this selected time.</span>
                  </p>
                )
              ) : null}
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="decomNotes"
          render={({ field }) => (
            <FormItem className="md:col-span-2">
              <FormLabel>Audit / EOL / cut-over notes</FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  placeholder="Audit findings, approvals, dependencies, rollback notes…"
                  className="min-h-[100px]"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );
}
