import * as React from 'react';
import { UseFormReturn } from 'react-hook-form';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface DecommissioningTabProps {
  form: UseFormReturn<any>;
}

export function DecommissioningTab({ form }: DecommissioningTabProps) {
  return (
    <div className="mx-auto w-full max-w-[56rem] space-y-4">
      <p className="text-sm text-muted-foreground">
        Track EOL planning, cut-over dates, and audit notes. Use <span className="font-medium text-foreground">Asset status</span> on the
        Details tab for operational flags (for example Ready to Decommission).
      </p>
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
