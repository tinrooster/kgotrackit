"use client"

import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

/**
 * Material Design 3-inspired switch.
 *
 * Track colours follow MD3's role-based colour tokens (mapped via CSS variables):
 *   ON  → --switch-on  (vivid teal accent, readable on any background)
 *   OFF → neutral zinc  (muted gray, clearly "inactive")
 *
 * Track: rounded pill 24×44 px (h-6 w-11), 3 px internal padding.
 * Thumb: white circle 18×18 px, shadow-md, 200 ms ease-in-out slide.
 */
const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-border/50 p-[3px] shadow-ti-sm",
      "transition-colors duration-200 ease-in-out",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      "disabled:cursor-not-allowed disabled:opacity-40",
      // Off: muted neutral track
      "data-[state=unchecked]:bg-muted dark:data-[state=unchecked]:bg-muted",
      // On: vivid --switch-on accent (works in light + dark)
      "data-[state=checked]:bg-[hsl(var(--switch-on))]",
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-[18px] w-[18px] rounded-full bg-white shadow-md ring-0",
        "transition-transform duration-200 ease-in-out",
        "data-[state=unchecked]:translate-x-0 data-[state=checked]:translate-x-5"
      )}
    />
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
