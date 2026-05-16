import { cn } from "@/lib/utils";

interface LPCreditIconProps {
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}

const sizeMap = {
  xs: 12,
  sm: 16,
  md: 20,
  lg: 24,
  xl: 32,
};

export function LPCreditIcon({ size = "md", className }: LPCreditIconProps) {
  const pixelSize = sizeMap[size];
  
  return (
    <svg
      width={pixelSize}
      height={pixelSize}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("inline-block flex-shrink-0", className)}
      aria-label="LPC"
    >
      <defs>
        <linearGradient id="coinGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--chart-4)" />
          <stop offset="50%" stopColor="var(--action-primary)" />
          <stop offset="100%" stopColor="var(--btn-primary-active)" />
        </linearGradient>
        <linearGradient id="coinHighlight" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="var(--action-primary-fg)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="var(--action-primary)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="innerRing" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--chart-3)" />
          <stop offset="100%" stopColor="var(--accent-secondary-strong)" />
        </linearGradient>
      </defs>
      
      <circle cx="16" cy="16" r="15" fill="url(#coinGradient)" stroke="var(--accent-primary-strong)" strokeWidth="1" />
      
      <circle cx="16" cy="16" r="15" fill="url(#coinHighlight)" />
      
      <circle cx="16" cy="16" r="11.5" fill="none" stroke="url(#innerRing)" strokeWidth="1.5" />
      
      <text
        x="16"
        y="17"
        textAnchor="middle"
        dominantBaseline="middle"
        fill="var(--action-accent)"
        style={{ fontFamily: 'var(--font-body, Inter, system-ui, sans-serif)' }}
        fontWeight="700"
        fontSize="8"
        letterSpacing="-0.3"
      >
        LPC
      </text>
      
      <ellipse cx="16" cy="7" rx="8" ry="2" fill="var(--action-primary-fg)" fillOpacity="0.3" />
    </svg>
  );
}

export default LPCreditIcon;
