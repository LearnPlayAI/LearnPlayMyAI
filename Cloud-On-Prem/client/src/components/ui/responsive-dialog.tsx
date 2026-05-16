import { ReactNode } from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useIsMobile } from "@/hooks/use-mobile"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer"
import { Button } from "@/components/ui/button"

interface ResponsiveDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  description?: string
  children: ReactNode
  size?: "sm" | "md" | "lg" | "xl" | "full"
  showClose?: boolean
  className?: string
}

const sizeClasses = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  full: "max-w-[95vw] sm:max-w-4xl",
}

export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  size = "md",
  showClose = true,
  className,
}: ResponsiveDialogProps) {
  const isMobile = useIsMobile()

  if (isMobile && size === "full") {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent
          data-testid="responsive-dialog-drawer"
          className={cn(
            "max-h-[90vh] overflow-y-auto",
            className
          )}
        >
          <DrawerHeader className="relative px-4 sm:px-6 pt-4">
            {showClose && (
              <DrawerClose asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-2 min-h-[44px] min-w-[44px] rounded-md hover:bg-accent/10"
                  data-testid="responsive-dialog-close"
                >
                  <X className="h-5 w-5" />
                  <span className="sr-only">Close</span>
                </Button>
              </DrawerClose>
            )}
            {title && (
              <DrawerTitle
                data-testid="responsive-dialog-title"
                className="text-lg font-semibold pr-10"
              >
                {title}
              </DrawerTitle>
            )}
            {description && (
              <DrawerDescription
                data-testid="responsive-dialog-description"
                className="text-sm text-muted-foreground"
              >
                {description}
              </DrawerDescription>
            )}
          </DrawerHeader>
          <div
            className="px-4 sm:px-6 pb-6 overflow-y-auto"
            data-testid="responsive-dialog-content"
          >
            {children}
          </div>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="responsive-dialog-container"
        className={cn(
          "w-[95vw] sm:w-full max-h-[90vh] overflow-y-auto",
          "p-4 sm:p-6",
          "border border-border bg-background",
          sizeClasses[size],
          className
        )}
      >
        {showClose && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            className="absolute right-2 top-2 min-h-[44px] min-w-[44px] rounded-md hover:bg-accent/10 z-10"
            data-testid="responsive-dialog-close"
          >
            <X className="h-5 w-5" />
            <span className="sr-only">Close</span>
          </Button>
        )}
        <DialogHeader className="pr-10">
          {title && (
            <DialogTitle
              data-testid="responsive-dialog-title"
              className="text-lg font-semibold"
            >
              {title}
            </DialogTitle>
          )}
          {description && (
            <DialogDescription
              data-testid="responsive-dialog-description"
              className="text-sm text-muted-foreground"
            >
              {description}
            </DialogDescription>
          )}
        </DialogHeader>
        <div
          className="overflow-y-auto"
          data-testid="responsive-dialog-content"
        >
          {children}
        </div>
      </DialogContent>
    </Dialog>
  )
}

export type { ResponsiveDialogProps }
