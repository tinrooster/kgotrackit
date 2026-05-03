import * as React from "react"
import * as PopoverPrimitive from "@radix-ui/react-popover"

import { cn } from "@/lib/utils"
import { NestedDialogPortalHostContext } from "@/components/ui/nested-dialog-portal-container"

const Popover = PopoverPrimitive.Root

const PopoverTrigger = PopoverPrimitive.Trigger

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & {
    /**
     * When false, portal to `document.body` even inside a nested dialog host.
     * Needed for cmdk combobox lists: portaling into dialog content can clip the panel or swallow clicks.
     */
    useNestedPortal?: boolean
  }
>(({ className, align = "center", sideOffset = 4, useNestedPortal = true, ...props }, ref) => {
  const nestedPortalHost = React.useContext(NestedDialogPortalHostContext)
  const portalContainer =
    useNestedPortal === false ? undefined : nestedPortalHost ?? undefined
  return (
  <PopoverPrimitive.Portal container={portalContainer}>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(
        // `relative` so z-index is a real used value; Radix Popper copies it onto the floating
        // wrapper — without positioning, z-* is ignored and the menu can sit under DialogOverlay.
        "relative z-[100] w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
        className
      )}
      {...props}
    />
  </PopoverPrimitive.Portal>
  )
})
PopoverContent.displayName = PopoverPrimitive.Content.displayName

export { Popover, PopoverTrigger, PopoverContent }