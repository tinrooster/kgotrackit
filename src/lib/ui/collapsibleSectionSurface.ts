import { cn } from "@/lib/utils";

const collapsibleSectionSurfaceBase =
  "overflow-hidden rounded-lg border border-border/60 bg-muted/10 shadow-sm transition-[box-shadow,background-color] duration-300";

const collapsibleSectionSurfaceEmphasis =
  "ring-2 ring-primary/45 bg-primary/[0.09] shadow-md";

/**
 * Wrapper surface for collapsible panels (form accordions, Quick Add jump highlights).
 * Matches the emphasis used in `MobileQuickAddDialog` for active / focused sections.
 */
export function collapsibleSectionSurfaceClass(isEmphasized: boolean): string {
  return cn(collapsibleSectionSurfaceBase, isEmphasized && collapsibleSectionSurfaceEmphasis);
}
