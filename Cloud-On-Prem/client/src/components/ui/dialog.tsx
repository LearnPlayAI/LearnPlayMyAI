"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X, ChevronLeft } from "lucide-react"

import { cn } from "@/lib/utils"
import { sanitizePrimitiveClassNameStrict } from "@/components/ui/primitiveClassGuard"
import { useIsMobile } from "@/hooks/use-mobile"

const Dialog = DialogPrimitive.Root

const DialogTrigger = DialogPrimitive.Trigger

const DialogPortal = DialogPrimitive.Portal

const DialogClose = DialogPrimitive.Close

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-modal-overlay",
      "data-[state=open]:animate-in data-[state=closed]:animate-out",
      "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      "motion-reduce:animate-none motion-reduce:transition-none",
      sanitizePrimitiveClassNameStrict(className)
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

interface DialogContentProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  showMobileBack?: boolean;
  onMobileBack?: () => void;
  variant?: 'default' | 'game-success' | 'game-error';
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentProps
>(({ className, children, showMobileBack, onMobileBack, variant = 'default', ...props }, ref) => {
  const isMobile = useIsMobile();

  const getVariantClasses = () => {
    switch (variant) {
      case 'game-success':
        return 'border-2 border-[var(--success)] bg-game-surface-success';
      case 'game-error':
        return 'border-2 border-[var(--destructive)] bg-game-surface-error';
      default:
        return 'border border-modal-border bg-surface-overlay';
    }
  };
  
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed left-[50%] top-[50%] z-50 grid translate-x-[-50%] translate-y-[-50%]",
          "w-[calc(100vw-2rem)] sm:w-full",
          "max-w-[calc(100vw-2rem)] sm:max-w-md lg:max-w-lg",
          "max-h-[calc(100vh-2rem)] sm:max-h-[90vh]",
          "gap-3 sm:gap-4 text-modal-foreground shadow-dialog rounded-lg",
          getVariantClasses(),
          "p-4 sm:p-6",
          "pb-[calc(1rem+env(safe-area-inset-bottom,0px))] sm:pb-6",
          "duration-200",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          "data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]",
          "data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
          "motion-reduce:animate-none motion-reduce:transition-none",
          sanitizePrimitiveClassNameStrict(className)
        )}
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
        <DialogPrimitive.Close className="absolute right-2 top-2 rounded-md opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)] focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-[var(--dropdown-item-active-bg)] data-[state=open]:text-dropdown-item-active-foreground p-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-[var(--dropdown-item-hover-bg)] hover:text-dropdown-item-hover-foreground">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
})
DialogContent.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left pr-8",
      sanitizePrimitiveClassNameStrict(className)
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogBody = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "modal-body flex-1 overflow-y-auto overscroll-contain",
      "-mx-4 px-4 sm:-mx-6 sm:px-6",
      sanitizePrimitiveClassNameStrict(className)
    )}
    {...props}
  />
)
DialogBody.displayName = "DialogBody"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-0 sm:space-x-2",
      "pt-4 -mx-4 px-4 sm:-mx-6 sm:px-6",
      "border-t border-border/50 mt-auto",
      "pb-[env(safe-area-inset-bottom,0px)]",
      sanitizePrimitiveClassNameStrict(className)
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight",
      sanitizePrimitiveClassNameStrict(className)
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", sanitizePrimitiveClassNameStrict(className))}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
