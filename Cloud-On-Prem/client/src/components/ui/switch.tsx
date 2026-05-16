import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"
import { sanitizePrimitiveClassNameStrict } from "@/components/ui/primitiveClassGuard"

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:bg-[var(--input-disabled-bg)] disabled:border-[var(--input-disabled-border)] data-[state=unchecked]:bg-[var(--switch-bg)] data-[state=unchecked]:border-[var(--switch-bg)] data-[state=unchecked]:hover:bg-[var(--switch-hover-bg)] data-[state=unchecked]:hover:border-[var(--switch-hover-bg)] data-[state=checked]:bg-[var(--switch-checked-bg)] data-[state=checked]:border-[var(--switch-checked-bg)] data-[state=checked]:hover:bg-[var(--switch-checked-hover-bg)] data-[state=checked]:hover:border-[var(--switch-checked-hover-bg)]",
      sanitizePrimitiveClassNameStrict(className)
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        "pointer-events-none block h-5 w-5 rounded-full shadow-elevated ring-0 transition-transform data-[state=checked]:translate-x-5 data-[state=unchecked]:translate-x-0 bg-[var(--switch-thumb)]"
      )}
    />
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
