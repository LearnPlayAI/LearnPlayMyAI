import * as React from "react"
import * as CheckboxPrimitive from "@radix-ui/react-checkbox"
import { Check } from "lucide-react"

import { cn } from "@/lib/utils"
import { sanitizePrimitiveClassNameStrict } from "@/components/ui/primitiveClassGuard"

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      "peer h-4 w-4 shrink-0 rounded-sm border border-[var(--checkbox-border)] bg-[var(--checkbox-bg)] ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 hover:border-[var(--checkbox-hover-border)] disabled:cursor-not-allowed disabled:bg-[var(--checkbox-disabled-bg)] disabled:border-[var(--input-disabled-border)] data-[state=checked]:border-[var(--checkbox-checked-bg)] data-[state=checked]:bg-[var(--checkbox-checked-bg)] data-[state=checked]:text-[var(--checkbox-checked-fg)]",
      sanitizePrimitiveClassNameStrict(className)
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator
      className={cn("flex items-center justify-center text-current")}
    >
      <Check className="h-4 w-4" />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
))
Checkbox.displayName = CheckboxPrimitive.Root.displayName

export { Checkbox }
