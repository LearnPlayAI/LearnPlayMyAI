import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { sanitizePrimitiveClassNameStrict } from "@/components/ui/primitiveClassGuard"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-btn-primary-foreground border border-border hover:bg-primary/90 disabled:bg-[var(--btn-primary-disabled-bg)] disabled:text-[var(--btn-primary-disabled-fg)] disabled:border-[var(--btn-primary-disabled-bg)]",
        destructive: "bg-[var(--btn-danger-bg)] text-btn-danger-foreground hover:bg-[var(--btn-danger-hover)] disabled:bg-[var(--btn-danger-disabled-bg)] disabled:text-btn-danger-foreground disabled:border-[var(--btn-danger-disabled-bg)]",
        outline: "bg-[var(--btn-outline-bg)] text-btn-outline-foreground border border-[var(--btn-outline-border)] hover:bg-[var(--btn-outline-hover-bg)] hover:border-[var(--btn-outline-hover-border)] disabled:bg-[var(--input-disabled-bg)] disabled:text-[var(--input-disabled-fg)] disabled:border-[var(--input-disabled-border)]",
        secondary: "bg-[var(--btn-secondary-bg)] text-btn-secondary-foreground border border-border hover:bg-[var(--btn-secondary-hover)] hover:text-[var(--btn-secondary-hover-fg)] active:bg-[var(--btn-secondary-active)] active:text-[var(--btn-secondary-active-fg)] disabled:bg-[var(--btn-secondary-disabled-bg)] disabled:text-[var(--btn-secondary-disabled-fg)] disabled:border-[var(--btn-secondary-disabled-bg)]",
        ghost: "bg-[var(--btn-ghost-bg)] text-foreground border border-transparent hover:bg-muted hover:border-[var(--btn-ghost-border-hover)] disabled:text-[var(--btn-ghost-disabled-fg)]",
        link: "text-link-fg underline-offset-4 hover:underline hover:text-link-hover-foreground disabled:text-muted-foreground disabled:no-underline",
        gradient: "bg-primary text-btn-primary-foreground border border-border hover:bg-primary/90 disabled:bg-[var(--btn-primary-disabled-bg)] disabled:text-[var(--btn-primary-disabled-fg)] disabled:border-[var(--btn-primary-disabled-bg)]",
        glass: "bg-card text-card-foreground border border-border hover:bg-card disabled:bg-[var(--input-disabled-bg)] disabled:text-[var(--input-disabled-fg)] disabled:border-[var(--input-disabled-border)]",
        neon: "bg-[var(--btn-outline-bg)] text-btn-outline-foreground border border-[var(--btn-outline-border)] hover:bg-[var(--btn-outline-hover-bg)] hover:border-[var(--btn-outline-hover-border)] disabled:border-[var(--input-disabled-border)] disabled:text-[var(--input-disabled-fg)]",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
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
        className={cn(
          buttonVariants({
            variant,
            size,
            className: sanitizePrimitiveClassNameStrict(className),
          })
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
