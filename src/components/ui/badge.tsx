import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium tracking-[0.02em] transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-ti-accent-soft text-ti-accent-ink hover:bg-primary/15",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "border-transparent bg-ti-danger-soft text-destructive hover:bg-destructive/15",
        outline: "border-border bg-transparent text-foreground",
        success: "border-transparent bg-ti-success-soft text-ti-success",
        warning: "border-transparent bg-ti-warning-soft text-ti-warning",
        info: "border-transparent bg-ti-info-soft text-ti-info",
        accent: "border-transparent bg-ti-accent-soft text-ti-accent-ink",
        neutral: "border-transparent bg-muted text-muted-foreground",
        /** Compact high-contrast success chip for checklist / packlist / inventory row flags (light + dark). */
        lineDone:
          "shrink-0 rounded-md border border-green-300 bg-green-100 px-1.5 py-0 text-[11px] font-medium text-green-800 dark:border-green-500/40 dark:bg-green-600/20 dark:text-green-200",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }