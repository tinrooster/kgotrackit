import * as React from 'react';
import { OptionalFormCollapsible } from '@/components/forms/OptionalFormCollapsible';
import { cn } from '@/lib/utils';

export interface ListDetailCollapsibleProps {
  title: string;
  children: React.ReactNode;
  className?: string;
  defaultOpen?: boolean;
}

/**
 * Collapsible detail panel for rows under Settings → Lookup lists / Libraries (and similar).
 * Use under sortable list rows: keep drag handle and edit/delete on the row header; nest extended
 * fields inside this component.
 */
export function ListDetailCollapsible({ title, children, className, defaultOpen }: ListDetailCollapsibleProps) {
  return (
    <OptionalFormCollapsible
      title={title}
      defaultOpen={defaultOpen}
      className={cn('ml-9 mt-1 max-w-4xl sm:ml-10', className)}
    >
      {children}
    </OptionalFormCollapsible>
  );
}
