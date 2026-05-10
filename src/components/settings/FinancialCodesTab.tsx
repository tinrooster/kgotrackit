import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FinancialCodeEntry } from '@/lib/financialSettingsService';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface FinancialCodesTabProps {
  expenseTypes: FinancialCodeEntry[];
  costCenters: FinancialCodeEntry[];
  onChangeExpenseTypes: (entries: FinancialCodeEntry[]) => void;
  onChangeCostCenters: (entries: FinancialCodeEntry[]) => void;
  /** Match Settings lookup-list panel shell (e.g. Categories). */
  lookupPanelCardClassName?: string;
}

const FinancialCodeEditor = ({
  title,
  entries,
  onChange,
  cardClassName,
}: {
  title: string;
  entries: FinancialCodeEntry[];
  onChange: (entries: FinancialCodeEntry[]) => void;
  cardClassName?: string;
}) => {
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const updateEntry = (id: string, updates: Partial<FinancialCodeEntry>) => {
    onChange(entries.map((entry) => (entry.id === id ? { ...entry, ...updates } : entry)));
  };

  const confirmDelete = () => {
    if (!pendingDeleteId) {
      return;
    }
    onChange(entries.filter((entry) => entry.id !== pendingDeleteId));
    setPendingDeleteId(null);
  };

  const addEntry = () => {
    onChange([
      ...entries,
      {
        id: crypto.randomUUID(),
        code: '',
        description: '',
      },
    ]);
  };

  const pendingEntry = pendingDeleteId ? entries.find((e) => e.id === pendingDeleteId) : undefined;

  return (
    <Card className={cn(cardClassName)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-12 gap-2 px-2 text-sm font-medium text-muted-foreground">
          <div className="col-span-4">Code</div>
          <div className="col-span-7">Description</div>
          <div className="col-span-1" />
        </div>
        {entries.map((entry) => (
          <div key={entry.id} className="grid grid-cols-12 gap-2 items-end rounded-md border p-2">
            <div className="col-span-4">
              <Input
                value={entry.code}
                onChange={(event) => updateEntry(entry.id, { code: event.target.value })}
                placeholder="e.g. 685001"
              />
            </div>
            <div className="col-span-7">
              <Input
                value={entry.description}
                onChange={(event) => updateEntry(entry.id, { description: event.target.value })}
                placeholder="e.g. Supplies - General"
              />
            </div>
            <div className="col-span-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="delete-action-btn"
                onClick={() => setPendingDeleteId(entry.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" onClick={addEntry}>
          Add Entry
        </Button>
      </CardContent>

      <AlertDialog open={pendingDeleteId !== null} onOpenChange={(open) => !open && setPendingDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this entry?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingEntry?.code?.trim()
                ? `Delete code "${pendingEntry.code}" and its description from this list.`
                : 'Delete this row from the list.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <AlertDialogAction type="button" onClick={confirmDelete}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

export function FinancialCodesTab({
  expenseTypes,
  costCenters,
  onChangeExpenseTypes,
  onChangeCostCenters,
  lookupPanelCardClassName,
}: FinancialCodesTabProps) {
  return (
    <div className="space-y-4">
      <FinancialCodeEditor
        title="Expense Type"
        entries={expenseTypes}
        onChange={onChangeExpenseTypes}
        cardClassName={lookupPanelCardClassName}
      />
      <FinancialCodeEditor
        title="Cost Center / Allocation"
        entries={costCenters}
        onChange={onChangeCostCenters}
        cardClassName={lookupPanelCardClassName}
      />
    </div>
  );
}
