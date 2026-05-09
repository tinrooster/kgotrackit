"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"

/** Object returned by `createTabsScope()(undefined)` for nested tab groups. */
type TabsScopeValue = ReturnType<ReturnType<typeof TabsPrimitive.createTabsScope>>

type WithTabsScope<P> = P & { __scopeTabs?: TabsScopeValue }

const Tabs = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Root>,
  WithTabsScope<React.ComponentPropsWithoutRef<typeof TabsPrimitive.Root>>
>((props, ref) => <TabsPrimitive.Root ref={ref} {...props} />)
Tabs.displayName = TabsPrimitive.Root.displayName

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  WithTabsScope<React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground",
      className
    )}
    {...props}
  />
))
TabsList.displayName = TabsPrimitive.List.displayName

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  WithTabsScope<React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm",
      className
    )}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  WithTabsScope<React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

/**
 * Nested tab groups: `const useScope = useMemo(() => createTabsScope(), []); const scope = useScope(undefined);`
 * then pass `__scopeTabs={scope}` on the nested `Tabs`, `TabsList`, `TabsTrigger`, and `TabsContent` tree.
 * Passing `createTabsScope` or `useMemo(() => createTabsScope(), [])` without invoking the hook is invalid.
 */
const createTabsScope = TabsPrimitive.createTabsScope

export { Tabs, TabsList, TabsTrigger, TabsContent, createTabsScope }