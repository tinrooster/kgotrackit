"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"
import { NestedDialogPortalHostContext } from "@/components/ui/nested-dialog-portal-container"

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

function outsideEventTarget(event: { target: EventTarget; detail?: unknown }): EventTarget | null {
  if (
    event.detail &&
    typeof event.detail === "object" &&
    "originalEvent" in event.detail &&
    event.detail.originalEvent &&
    typeof event.detail.originalEvent === "object" &&
    "target" in event.detail.originalEvent
  ) {
    const t = (event.detail as { originalEvent: { target?: EventTarget | null } }).originalEvent.target;
    if (t) return t;
  }
  return event.target;
}

function isInsideRadixPortaledLayer(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest("[data-radix-popper-content-wrapper]") ||
      target.closest("[data-radix-select-content]") ||
      target.closest("[data-radix-dropdown-menu-content]") ||
      target.closest("[data-slot='popover-content']") ||
      target.closest("[data-slot='select-content']") ||
      target.closest(".cmdk-root") ||
      target.closest("[cmdk-root]")
  );
}

export type DialogContentProps = React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
  /**
   * Use with `<Dialog modal={false}>`. Renders a dimmed fullscreen close target (Radix omits overlay when modal is false).
   */
  nonModalBackdrop?: boolean;
};

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, children, onInteractOutside, onPointerDownOutside, onFocusOutside, nonModalBackdrop, ...props }, ref) => {
  const [nestedPortalHost, setNestedPortalHost] = React.useState<HTMLElement | null>(null);

  const setContentNode = React.useCallback(
    (node: HTMLElement | null) => {
      setNestedPortalHost((prev) => (prev === node ? prev : node));
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        (ref as React.MutableRefObject<HTMLElement | null>).current = node;
      }
    },
    [ref]
  );

  return (
    <DialogPortal>
      {nonModalBackdrop ? (
        <DialogPrimitive.Close asChild>
          <button
            type="button"
            className="fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
            aria-label="Close dialog"
          />
        </DialogPrimitive.Close>
      ) : null}
      <DialogOverlay
        className={cn(nonModalBackdrop && "pointer-events-none")}
      />
      <DialogPrimitive.Content
        ref={setContentNode}
        className={cn(
          "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
          nonModalBackdrop && "z-[51]",
          className
        )}
        onInteractOutside={(event) => {
          if (isInsideRadixPortaledLayer(outsideEventTarget(event))) {
            event.preventDefault();
          }
          onInteractOutside?.(event);
        }}
        onPointerDownOutside={(event) => {
          if (isInsideRadixPortaledLayer(outsideEventTarget(event))) {
            event.preventDefault();
          }
          onPointerDownOutside?.(event);
        }}
        onFocusOutside={(event) => {
          if (isInsideRadixPortaledLayer(outsideEventTarget(event))) {
            event.preventDefault();
          }
          onFocusOutside?.(event);
        }}
        {...props}
      >
        <NestedDialogPortalHostContext.Provider value={nestedPortalHost}>
          {children}
        </NestedDialogPortalHostContext.Provider>
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
})
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogTrigger,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}