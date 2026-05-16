import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { sanitizePrimitiveClassNameStrict } from "@/components/ui/primitiveClassGuard"

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-badge text-badge-foreground hover:bg-badge-hover",
        secondary:
          "border-transparent bg-badge-secondary text-badge-secondary-foreground hover:bg-badge-secondary/80",
        destructive:
          "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        danger:
          "border-transparent bg-badge-danger text-badge-danger-foreground hover:bg-badge-danger/80",
        outline:
          "border-badge-outline-border bg-badge-outline text-badge-outline-foreground",
        info:
          "border-transparent bg-badge-info text-badge-info-foreground hover:bg-badge-info/80",
        success:
          "border-transparent bg-badge-success text-badge-success-foreground hover:bg-badge-success/80",
        warning:
          "border-transparent bg-badge-warning text-badge-warning-foreground hover:bg-badge-warning/80",
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
    <div
      className={cn(badgeVariants({ variant }), sanitizePrimitiveClassNameStrict(className))}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
