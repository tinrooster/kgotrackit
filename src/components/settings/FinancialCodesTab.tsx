import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Trash2 } from 'lucide-react';
import { FinancialCodeEntry } from '@/lib/financialSettingsService';

interface FinancialCodesTabProps {
  expenseTypes: FinancialCodeEntry[];
  costCenters: FinancialCodeEntry[];
  onChangeExpenseTypes: (entries: FinancialCodeEntry[]) => void;
  onChangeCostCenters: (entries: FinancialCodeEntry[]) => void;
}

const FinancialCodeEditor = ({
  title,
  description,
  entries,
  onChange,
}: {
  title: string;
  description: string;
  entries: FinancialCodeEntry[];
  onChange: (entries: FinancialCodeEntry[]) => void;
}) => {
  const updateEntry = (id: string, updates: Partial<FinancialCodeEntry>) => {
    onChange(entries.map((entry) => (entry.id === id ? { ...entry, ...updates } : entry)));
  };

  const deleteEntry = (id: string) => {
    onChange(entries.filter((entry) => entry.id !== id));
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
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
              <Button type="button" variant="ghost" size="icon" onClick={() => deleteEntry(entry.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" onClick={addEntry}>
          Add Entry
        </Button>
      </CardContent>
    </Card>
  );
};

export function FinancialCodesTab({
  expenseTypes,
  costCenters,
  onChangeExpenseTypes,
  onChangeCostCenters,
}: FinancialCodesTabProps) {
  return (
    <div className="space-y-4">
      <FinancialCodeEditor
        title="Expense Type"
        description="Code and description are stored separately."
        entries={expenseTypes}
        onChange={onChangeExpenseTypes}
      />
      <FinancialCodeEditor
        title="Cost Center / Allocation"
        description="Code and description are stored separately."
        entries={costCenters}
        onChange={onChangeCostCenters}
      />
    </div>
  );
}
