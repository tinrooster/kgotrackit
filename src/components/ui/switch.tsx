"use client"

import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

/**
 * Material Design 3-inspired switch.
 * Track: rounded pill, 24×44px, gray when off, primary color when on.
 * Thumb: white circle with shadow, translates smoothly across the track.
 */
const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      // Track: pill shape, MD3 proportions (24h × 44w)
      "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full p-[3px]",
      "transition-colors duration-200 ease-in-out",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      "disabled:cursor-not-allowed disabled:opacity-40",
      // Off: neutral zinc gray; On: full primary accent
      "data-[state=unchecked]:bg-zinc-300 dark:data-[state=unchecked]:bg-zinc-600",
      "data-[state=checked]:bg-primary",
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        // Thumb: white circle, slightly smaller than track height, with shadow
        "pointer-events-none block h-[18px] w-[18px] rounded-full bg-white shadow-md ring-0",
        "transition-transform duration-200 ease-in-out",
        "data-[state=unchecked]:translate-x-0 data-[state=checked]:translate-x-5"
      )}
    />
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
