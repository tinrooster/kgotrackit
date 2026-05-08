"use client";

/**
 * DraggableDialogContent
 *
 * A drop-in replacement for DialogContent that adds:
 *   • Drag-to-reposition (pointer-down on the header zone = top ~56 px)
 *   • Drag-to-resize (bottom-right grip handle)
 *
 * Usage:
 *   import { DraggableDialogContent } from "@/components/ui/draggable-dialog";
 *   // Same props as DialogContent; the dialog also needs modal={false} if you
 *   // want it to stay open while interacting with the page behind it.
 */

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { NestedDialogPortalHostContext } from "@/components/ui/nested-dialog-portal-container";

// ─── types ─────────────────────────────────────────────────────────────────

type Pos = { x: number; y: number };
type Size = { w: number; h: number } | null;

export type DraggableDialogContentProps =
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    /** Minimum allowed width while resizing (px). Default 320. */
    minWidth?: number;
    /** Minimum allowed height while resizing (px). Default 220. */
    minHeight?: number;
    /** Render a semi-transparent page overlay. Default true. */
    showOverlay?: boolean;
    /**
     * Height of the drag zone at the top of the dialog (px). Pointer-down
     * events in this zone (excluding interactive elements) start a drag.
     * Default 56 — covers a standard DialogHeader.
     */
    dragZoneHeight?: number;
    /**
     * When true, clicking outside the dialog closes it.
     * Default false — matches the app-wide convention.
     */
    dismissOnOutsidePointer?: boolean;
  };

// ─── resize grip SVG ───────────────────────────────────────────────────────

function ResizeGrip({
  onPointerDown,
}: {
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  return (
    <div
      className="absolute bottom-0 right-0 z-20 flex h-5 w-5 cursor-se-resize select-none touch-none items-end justify-end p-0.5"
      onPointerDown={onPointerDown}
      aria-hidden
    >
      <svg
        viewBox="0 0 10 10"
        className="h-3 w-3 text-muted-foreground/40"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      >
        <line x1="9" y1="1" x2="1" y2="9" />
        <line x1="9" y1="5" x2="5" y2="9" />
        <line x1="9" y1="9" x2="9" y2="9" />
      </svg>
    </div>
  );
}

// ─── component ─────────────────────────────────────────────────────────────

export const DraggableDialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DraggableDialogContentProps
>(function DraggableDialogContent(
  {
    className,
    children,
    style: externalStyle,
    minWidth = 320,
    minHeight = 220,
    showOverlay = true,
    dragZoneHeight = 56,
    dismissOnOutsidePointer = false,
    onPointerDown: externalPointerDown,
    ...props
  },
  forwardedRef,
) {
  const innerRef = React.useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = React.useState<Pos | null>(null);
  const [size, setSize] = React.useState<Size>(null);
  const [nestedHost, setNestedHost] = React.useState<HTMLDivElement | null>(null);

  // Merge forwarded ref with our own
  const setRefs = React.useCallback(
    (node: HTMLDivElement | null) => {
      innerRef.current = node;
      setNestedHost(node);
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef)
        (forwardedRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
    },
    [forwardedRef],
  );

  // Reset position/size every time the dialog mounts (= every open).
  // Radix unmounts Dialog content when closed, so this runs on each open.
  React.useEffect(() => {
    setPos(null);
    setSize(null);
  }, []);

  // After the first paint compute the natural size and centre the dialog.
  // We re-run this every render until pos is set.
  React.useEffect(() => {
    if (pos !== null) return;
    const el = innerRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos({
      x: Math.round(Math.max(8, (window.innerWidth - width) / 2)),
      y: Math.round(Math.max(8, (window.innerHeight - height) / 2.2)),
    });
  });

  // ── drag ─────────────────────────────────────────────────────────────────

  const startDrag = React.useCallback(
    (e: React.PointerEvent | PointerEvent, startPosSnapshot: Pos) => {
      const startX = e.clientX;
      const startY = e.clientY;

      const onMove = (me: PointerEvent) => {
        const el = innerRef.current;
        const w = el?.offsetWidth ?? 200;
        const h = el?.offsetHeight ?? 100;
        setPos({
          x: Math.max(0, Math.min(window.innerWidth - w, startPosSnapshot.x + me.clientX - startX)),
          y: Math.max(0, Math.min(window.innerHeight - Math.min(h, 60), startPosSnapshot.y + me.clientY - startY)),
        });
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [],
  );

  const handlePointerDown = React.useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      externalPointerDown?.(e);
      if (e.defaultPrevented) return;
      if (e.button !== 0) return;

      // Only drag from within the top drag-zone
      const dialogEl = innerRef.current;
      if (!dialogEl) return;
      const dialogRect = dialogEl.getBoundingClientRect();
      const relY = e.clientY - dialogRect.top;
      if (relY > dragZoneHeight) return;

      // Don't hijack clicks on interactive elements
      const target = e.target as Element;
      if (
        target.closest(
          "button, input, select, textarea, a, [role='combobox'], [role='listbox'], [role='button'], [role='switch'], [role='checkbox'], [role='radio']",
        )
      )
        return;

      e.preventDefault();
      startDrag(e, pos ?? { x: dialogRect.left, y: dialogRect.top });
    },
    [externalPointerDown, dragZoneHeight, pos, startDrag],
  );

  // ── resize ───────────────────────────────────────────────────────────────

  const handleResizePointerDown = React.useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startY = e.clientY;
      const el = innerRef.current;
      const startW = el?.offsetWidth ?? 600;
      const startH = el?.offsetHeight ?? 500;

      const onMove = (me: PointerEvent) => {
        setSize({
          w: Math.max(minWidth, startW + me.clientX - startX),
          h: Math.max(minHeight, startH + me.clientY - startY),
        });
      };
      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [minWidth, minHeight],
  );

  // ── style ────────────────────────────────────────────────────────────────

  const computedStyle: React.CSSProperties = {
    ...externalStyle,
    position: "fixed",
    margin: 0,
    maxWidth: "none",
    maxHeight: "none",
    // Before we've measured/centred, fall back to CSS centring
    left: pos?.x ?? "50%",
    top: pos?.y ?? "50%",
    transform: pos ? "none" : "translate(-50%, -50%)",
    ...(size ? { width: size.w, height: size.h } : {}),
  };

  return (
    <DialogPrimitive.Portal>
      {showOverlay && (
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/85 backdrop-blur-[1.5px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
      )}
      <DialogPrimitive.Content
        ref={setRefs}
        style={computedStyle}
        className={cn(
          // Base layout — consumers control their own overflow
          "z-50 flex flex-col rounded-lg border border-primary/35 border-t-primary/80 bg-background shadow-[0_24px_80px_rgba(0,0,0,0.55)] ring-2 ring-primary/25 outline outline-1 outline-border/90",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          className,
        )}
        onPointerDown={handlePointerDown}
        // Prevent Radix from closing on outside interaction — the resize/drag
        // pointers land outside the dialog and would close it otherwise.
        onInteractOutside={(e) => { if (!dismissOnOutsidePointer) e.preventDefault(); }}
        onPointerDownOutside={(e) => { if (!dismissOnOutsidePointer) e.preventDefault(); }}
        onFocusOutside={(e) => { if (!dismissOnOutsidePointer) e.preventDefault(); }}
        {...props}
      >
        <NestedDialogPortalHostContext.Provider value={nestedHost}>
          {children}
        </NestedDialogPortalHostContext.Provider>

        {/* Close button — z-20 sits above every inner element */}
        <DialogPrimitive.Close className="absolute right-3 top-3 z-20 rounded-sm p-0.5 opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>

        {/* Resize grip */}
        <ResizeGrip onPointerDown={handleResizePointerDown} />
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
});

DraggableDialogContent.displayName = "DraggableDialogContent";
