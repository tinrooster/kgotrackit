import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OptionalFormCollapsibleProps {
  title: string;
  children: React.ReactNode;
  className?: string;
  /** When true, section starts expanded (native &lt;details open&gt;). */
  defaultOpen?: boolean;
}

/**
 * Collapsible optional section using native &lt;details&gt; (no extra Radix dependency).
 */
export function OptionalFormCollapsible({ title, children, className, defaultOpen }: OptionalFormCollapsibleProps) {
  const detailsRef = React.useRef<HTMLDetailsElement>(null);
  React.useEffect(() => {
    if (defaultOpen && detailsRef.current) {
      detailsRef.current.open = true;
    }
  }, [defaultOpen]);

  return (
    <details
      ref={detailsRef}
      className={cn(
        'group rounded-md border border-border/60 bg-muted/10 shadow-sm',
        className,
      )}
    >
      <summary
        className={cn(
          'flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium text-foreground',
          'marker:content-none [&::-webkit-details-marker]:hidden',
        )}
      >
        <span>{title}</span>
        <ChevronDown
          className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="space-y-3 border-t border-border/50 px-3 pb-3 pt-3">{children}</div>
    </details>
  );
}
