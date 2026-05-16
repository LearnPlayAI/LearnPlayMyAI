import * as React from "react"

import { cn } from "@/lib/utils"
import { sanitizePrimitiveClassNameStrict } from "@/components/ui/primitiveClassGuard"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-inputField-border bg-inputField px-3 py-2 text-base text-inputField-foreground ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-inputField-foreground placeholder:text-inputField-placeholder focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inputField-focus focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-[var(--input-disabled-bg)] disabled:text-[var(--input-disabled-fg)] disabled:border-[var(--input-disabled-border)] md:text-sm",
          sanitizePrimitiveClassNameStrict(className)
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
