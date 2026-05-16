import { cn } from "@/lib/utils";
import { LPCreditIcon } from "./LPCreditIcon";
import { LP_CREDITS_SHORT } from "@shared/creditConstants";

interface LpCreditAmountProps {
  amount: number;
  variant?: "compact" | "full";
  showIcon?: boolean;
  showCode?: boolean;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  iconClassName?: string;
}

export function formatLpCredits(amount: number): string {
  return new Intl.NumberFormat("en-US").format(amount);
}

export function LpCreditAmount({
  amount,
  variant = "compact",
  showIcon = true,
  showCode = true,
  size = "md",
  className,
  iconClassName,
}: LpCreditAmountProps) {
  const formattedAmount = formatLpCredits(amount);
  
  const textSizeMap = {
    xs: "text-xs",
    sm: "text-sm",
    md: "text-base",
    lg: "text-lg",
    xl: "text-xl",
  };
  
  const gapMap = {
    xs: "gap-0.5",
    sm: "gap-1",
    md: "gap-1.5",
    lg: "gap-2",
    xl: "gap-2.5",
  };
  
  if (variant === "full") {
    return (
      <span className={cn("inline-flex items-center", gapMap[size], className)}>
        {showIcon && <LPCreditIcon size={size} className={iconClassName} />}
        <span className={cn("font-semibold", textSizeMap[size])}>
          {formattedAmount}
        </span>
        {showCode && (
          <span className={cn("text-muted-foreground", textSizeMap[size])}>
            {LP_CREDITS_SHORT}
          </span>
        )}
      </span>
    );
  }
  
  return (
    <span className={cn("inline-flex items-center", gapMap[size], className)}>
      {showIcon && <LPCreditIcon size={size} className={iconClassName} />}
      <span className={cn("font-medium", textSizeMap[size])}>
        {formattedAmount} {showCode && LP_CREDITS_SHORT}
      </span>
    </span>
  );
}

export default LpCreditAmount;
