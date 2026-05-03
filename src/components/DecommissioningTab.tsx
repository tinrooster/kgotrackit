import { UseFormReturn } from 'react-hook-form';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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

interface DecommissioningTabProps {
  form: UseFormReturn<any>;
}

export function DecommissioningTab({ form }: DecommissioningTabProps) {
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
              <FormControl>
                <Input type="date" {...field} value={field.value || ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="decomLastAuditAt"
          render={({ field }) => (
            <FormItem className="md:col-span-2">
              <FormLabel>Last lifecycle audit</FormLabel>
              <FormControl>
                <Input type="datetime-local" {...field} value={field.value || ''} />
              </FormControl>
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
