import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useHorizontalScrollHints } from '@/components/ui/useHorizontalScrollHints';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

export interface ActionRailItem {
  id: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}

interface ActionRailProps {
  items: ActionRailItem[];
  pulseStorageKey: string;
  className?: string;
}

export function ActionRail({ items, pulseStorageKey, className }: ActionRailProps) {
  const {
    scrollRef,
    isOverflowing,
    canScrollLeft,
    canScrollRight,
    shouldPulseRightHint,
  } = useHorizontalScrollHints<HTMLDivElement>({ pulseStorageKey });

  return (
    <div
      className={cn('swipe-action-rail-shell relative', className)}
      data-overflowing={isOverflowing ? 'true' : 'false'}
      data-can-scroll-left={canScrollLeft ? 'true' : 'false'}
      data-can-scroll-right={canScrollRight ? 'true' : 'false'}
    >
      <div
        ref={scrollRef}
        className="swipe-action-rail flex flex-nowrap items-center gap-2 overflow-x-auto rounded-lg border bg-muted/45 p-1 shadow-ti-sm [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <TooltipProvider delayDuration={150}>
          {items.map((item) => (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant={item.active ? 'default' : 'outline'}
                  size="icon"
                  className="h-11 w-11 shrink-0 rounded-lg"
                  onClick={item.onClick}
                  disabled={item.disabled}
                  title={item.label}
                  aria-label={item.label}
                >
                  {item.icon}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{item.label}</TooltipContent>
            </Tooltip>
          ))}
        </TooltipProvider>
      </div>
      <div className="swipe-action-rail-hint swipe-action-rail-hint-left" aria-hidden>
        <ChevronLeft className="h-4 w-4" />
      </div>
      <div
        className={cn(
          'swipe-action-rail-hint swipe-action-rail-hint-right',
          shouldPulseRightHint && 'swipe-action-rail-hint-pulse-once',
        )}
        aria-hidden
      >
        <ChevronRight className="h-4 w-4" />
      </div>
    </div>
  );
}
