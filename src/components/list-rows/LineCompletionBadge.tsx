import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const KIND_LABEL = {
  completed: 'Completed',
  packed: 'Packed',
} as const;

export type LineCompletionKind = keyof typeof KIND_LABEL;

export interface LineCompletionBadgeProps
  extends Omit<React.ComponentProps<typeof Badge>, 'variant' | 'children'> {
  kind: LineCompletionKind;
  children?: React.ReactNode;
}

/**
 * Standard success chip for planner checklist and vehicle packlist rows.
 * Uses {@link Badge} variant `lineDone` for consistent contrast in light mode.
 */
export function LineCompletionBadge({ kind, className, children, ...props }: LineCompletionBadgeProps) {
  return (
    <Badge variant="lineDone" className={cn(className)} {...props}>
      {children ?? KIND_LABEL[kind]}
    </Badge>
  );
}
