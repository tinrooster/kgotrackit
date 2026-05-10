import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

export interface ListExpandAllSwitchProps {
  /** True when every section that can be expanded is expanded. */
  allExpanded: boolean;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  /** No sections to expand (hide interaction or disable). */
  disabled?: boolean;
  id: string;
  /** Short label next to the switch (e.g. "Expand all"). */
  label?: string;
  className?: string;
}

/**
 * One tap toggles between expand-all and collapse-all, using the same Switch pattern as settings
 * (e.g. Confirm deletes)—not a two-hit segmented overlay.
 */
export function ListExpandAllSwitch({
  allExpanded,
  onExpandAll,
  onCollapseAll,
  disabled = false,
  id,
  label = 'Expand all',
  className,
}: ListExpandAllSwitchProps) {
  return (
    <div className={cn('inline-flex items-center gap-2', className)}>
      <Label htmlFor={id} className="cursor-pointer text-xs text-muted-foreground sm:text-sm">
        {label}
      </Label>
      <Switch
        id={id}
        checked={allExpanded}
        disabled={disabled}
        onCheckedChange={(checked) => (checked ? onExpandAll() : onCollapseAll())}
      />
    </div>
  );
}
