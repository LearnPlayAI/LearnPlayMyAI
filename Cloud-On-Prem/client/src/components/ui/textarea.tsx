import * as React from "react"

import { cn } from "@/lib/utils"
import { sanitizePrimitiveClassNameStrict } from "@/components/ui/primitiveClassGuard"

const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(({ className, ...props }, ref) => {
  return (
    <textarea
      className={cn(
        "flex min-h-[80px] w-full rounded-md border border-inputField-border bg-inputField px-3 py-2 text-base text-inputField-foreground ring-offset-background placeholder:text-inputField-placeholder focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inputField-focus focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-[var(--input-disabled-bg)] disabled:text-[var(--input-disabled-fg)] disabled:border-[var(--input-disabled-border)] md:text-sm",
        sanitizePrimitiveClassNameStrict(className)
      )}
      ref={ref}
      {...props}
    />
  )
})
Textarea.displayName = "Textarea"

export { Textarea }
