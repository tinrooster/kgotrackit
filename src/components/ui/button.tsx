import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium tracking-[0.005em] ring-offset-background transition-[background-color,border-color,color,box-shadow,transform] duration-150 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:translate-y-0 disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "border border-primary bg-primary text-primary-foreground shadow-ti-sm hover:bg-primary/90",
        primary: "border border-ti-ink bg-ti-ink text-ti-bg shadow-ti-sm hover:bg-ti-ink",
        accent: "border border-primary bg-primary text-primary-foreground shadow-ti-sm hover:bg-primary/90",
        destructive:
          "border border-destructive/30 bg-ti-danger-soft text-destructive hover:bg-destructive/15",
        outline:
          "border border-input bg-card shadow-ti-sm hover:bg-accent hover:text-accent-foreground",
        secondary:
          "border border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        soft: "border border-transparent bg-ti-accent-soft text-ti-accent-ink hover:bg-primary/15",
        ghost: "border border-transparent hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-ti-ctrl px-3.5 py-2",
        sm: "h-8 rounded-md px-2.5 text-xs",
        lg: "h-12 rounded-lg px-5 text-[15px]",
        icon: "h-ti-ctrl w-ti-ctrl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size }), className)}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }