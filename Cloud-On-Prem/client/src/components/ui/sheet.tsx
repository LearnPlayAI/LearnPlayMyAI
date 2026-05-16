"use client"

import * as React from "react"
import * as SheetPrimitive from "@radix-ui/react-dialog"
import { cva, type VariantProps } from "class-variance-authority"
import { X, ChevronLeft } from "lucide-react"

import { cn } from "@/lib/utils"
import { sanitizePrimitiveClassNameStrict } from "@/components/ui/primitiveClassGuard"
import { useIsMobile } from "@/hooks/use-mobile"

const Sheet = SheetPrimitive.Root

const SheetTrigger = SheetPrimitive.Trigger

const SheetClose = SheetPrimitive.Close

const SheetPortal = SheetPrimitive.Portal

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    className={cn(
      "fixed inset-0 z-50 bg-modal-overlay",
      "data-[state=open]:animate-in data-[state=closed]:animate-out",
      "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      "motion-reduce:animate-none motion-reduce:transition-none",
      sanitizePrimitiveClassNameStrict(className)
    )}
    {...props}
    ref={ref}
  />
))
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName

const sheetVariants = cva(
  cn(
    "fixed z-50 gap-4 bg-modal text-modal-foreground shadow-elevated transition ease-in-out",
    "p-4 sm:p-6",
    "data-[state=open]:animate-in data-[state=closed]:animate-out",
    "data-[state=closed]:duration-300 data-[state=open]:duration-500",
    "motion-reduce:animate-none motion-reduce:transition-none",
    "overflow-y-auto overscroll-contain"
  ),
  {
    variants: {
      side: {
        top: cn(
          "inset-x-0 top-0 border-b",
          "max-h-[85vh]",
          "pt-[calc(1rem+env(safe-area-inset-top,0px))]",
          "data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top"
        ),
        bottom: cn(
          "inset-x-0 bottom-0 border-t rounded-t-[10px]",
          "max-h-[85vh]",
          "pb-[calc(1rem+env(safe-area-inset-bottom,0px))]",
          "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom"
        ),
        left: cn(
          "inset-y-0 left-0 h-full border-r",
          "w-[85vw] sm:w-3/4 sm:max-w-sm",
          "pl-[calc(1rem+env(safe-area-inset-left,0px))]",
          "data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left"
        ),
        right: cn(
          "inset-y-0 right-0 h-full border-l",
          "w-[85vw] sm:w-3/4 sm:max-w-sm",
          "pr-[calc(1rem+env(safe-area-inset-right,0px))]",
          "data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right"
        ),
      },
    },
    defaultVariants: {
      side: "right",
    },
  }
)

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {
  showMobileBack?: boolean;
  onMobileBack?: () => void;
}

const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Content>,
  SheetContentProps
>(({ side = "right", className, children, showMobileBack, onMobileBack, ...props }, ref) => {
  const isMobile = useIsMobile();
  
  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        ref={ref}
        className={cn(sheetVariants({ side }), sanitizePrimitiveClassNameStrict(className))}
        {...props}
      >
        {showMobileBack && isMobile && onMobileBack && (
          <button
            onClick={onMobileBack}
            className="absolute left-2 top-2 rounded-md opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] focus:ring-offset-2 p-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-[var(--dropdown-item-hover-bg)] hover:text-dropdown-item-hover-foreground"
          >
            <ChevronLeft className="h-5 w-5" />
            <span className="sr-only">Back</span>
          </button>
        )}
        {children}
        <SheetPrimitive.Close className="absolute right-2 top-2 rounded-md opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-[var(--dropdown-item-active-bg)] data-[state=open]:text-dropdown-item-active-foreground p-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-[var(--dropdown-item-hover-bg)] hover:text-dropdown-item-hover-foreground">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPortal>
  );
})
SheetContent.displayName = SheetPrimitive.Content.displayName

const SheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-2 text-center sm:text-left pr-10",
      sanitizePrimitiveClassNameStrict(className)
    )}
    {...props}
  />
)
SheetHeader.displayName = "SheetHeader"

const SheetBody = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex-1 overflow-y-auto overscroll-contain py-4",
      sanitizePrimitiveClassNameStrict(className)
    )}
    {...props}
  />
)
SheetBody.displayName = "SheetBody"

const SheetFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-0 sm:space-x-2",
      "pt-4 border-t border-border/50 mt-auto",
      "pb-[env(safe-area-inset-bottom,0px)]",
      sanitizePrimitiveClassNameStrict(className)
    )}
    {...props}
  />
)
SheetFooter.displayName = "SheetFooter"

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold text-foreground", sanitizePrimitiveClassNameStrict(className))}
    {...props}
  />
))
SheetTitle.displayName = SheetPrimitive.Title.displayName

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", sanitizePrimitiveClassNameStrict(className))}
    {...props}
  />
))
SheetDescription.displayName = SheetPrimitive.Description.displayName

export {
  Sheet,
  SheetPortal,
  SheetOverlay,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}
