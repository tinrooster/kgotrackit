import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { ChevronLeft, ChevronRight, GripVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

const CLOSE_DRAG_PX = 72;
const PLANNER_DRAG_PX = 72;
const MAX_DRAG_CLOSE_PX = 560;
const MAX_DRAG_PLANNER_PX = 220;
const SETTLE_MS = 340;

function resist(value: number, softLimit: number, maxAbs: number): number {
  const sign = value < 0 ? -1 : 1;
  const abs = Math.min(Math.abs(value), maxAbs);
  if (abs <= softLimit) return sign * abs;
  const extra = abs - softLimit;
  return sign * (softLimit + extra * 0.42);
}

export function useProductionSheetEdgeDrag({
  onRequestClose,
  onRequestOpenPlanner,
}: {
  onRequestClose: () => void;
  onRequestOpenPlanner: () => void;
}) {
  const [dragPx, setDragPx] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);
  const draggingRef = useRef(false);
  const dragPxRef = useRef(0);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (settleTimerRef.current) {
        clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
    },
    [],
  );

  const endDrag = useCallback(
    (totalOffset: number) => {
      draggingRef.current = false;
      setIsDragging(false);

      if (settleTimerRef.current) {
        clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }

      if (totalOffset >= CLOSE_DRAG_PX) {
        // Keep translate until sheet unmounts — avoids snap-back to x=0 right before close (same idea as schedule drag pending release).
        onRequestClose();
        return;
      }

      if (totalOffset <= -PLANNER_DRAG_PX) {
        // Hold offset through settle delay so the panel does not jump to center before navigating.
        settleTimerRef.current = setTimeout(() => {
          settleTimerRef.current = null;
          onRequestOpenPlanner();
        }, SETTLE_MS);
        return;
      }

      dragPxRef.current = 0;
      setDragPx(0);
    },
    [onRequestClose, onRequestOpenPlanner],
  );

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
    startXRef.current = event.clientX;
    draggingRef.current = true;
    setIsDragging(true);
    setDragPx(0);
    dragPxRef.current = 0;
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const raw = event.clientX - startXRef.current;
    const next =
      raw >= 0
        ? resist(raw, CLOSE_DRAG_PX * 0.85, MAX_DRAG_CLOSE_PX)
        : resist(raw, PLANNER_DRAG_PX * 0.85, MAX_DRAG_PLANNER_PX);
    dragPxRef.current = next;
    setDragPx(next);
  };

  const finishPointer = (event: PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
    endDrag(dragPxRef.current);
  };

  const handleLostPointerCapture = () => {
    if (!draggingRef.current) return;
    endDrag(dragPxRef.current);
  };

  const contentStyle: CSSProperties = {
    transform: dragPx !== 0 ? `translate3d(${dragPx}px,0,0)` : undefined,
    transition: isDragging
      ? 'none'
      : 'transform 0.38s cubic-bezier(0.22, 1, 0.36, 1)',
    willChange: isDragging ? 'transform' : undefined,
  };

  return {
    contentStyle,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp: finishPointer,
    handleLostPointerCapture,
    handlePointerCancel: (event: PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        /* ignore */
      }
      draggingRef.current = false;
      setIsDragging(false);
      setDragPx(0);
      dragPxRef.current = 0;
      if (settleTimerRef.current) {
        clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
    },
  };
}

export function ProductionSheetDragHandle({
  className,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onLostPointerCapture,
  onPointerCancel,
}: {
  className?: string;
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
  onLostPointerCapture: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (event: PointerEvent<HTMLDivElement>) => void;
}) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Drag right to close, or left to open planner workspace"
      className={cn(
        'flex w-9 shrink-0 cursor-grab touch-none flex-col items-center border-r border-border/60 bg-muted/30 pt-14 select-none active:cursor-grabbing',
        className,
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onLostPointerCapture={onLostPointerCapture}
      onPointerCancel={onPointerCancel}
    >
      <div className="flex flex-col items-center gap-0.5 text-muted-foreground">
        <ChevronRight className="h-3 w-3 opacity-70" aria-hidden />
        <GripVertical className="h-5 w-5" aria-hidden />
        <ChevronLeft className="h-3 w-3 opacity-70" aria-hidden />
      </div>
      <span className="mt-2 max-w-[2.25rem] text-center text-[9px] leading-tight text-muted-foreground">
        Close · Planner
      </span>
    </div>
  );
}
