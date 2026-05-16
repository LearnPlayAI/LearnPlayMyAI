import { motion } from 'framer-motion';

interface PremiumCircularTimerProps {
  timeRemaining: number;
  totalTime: number;
  size?: 'sm' | 'md' | 'lg';
  label: string;
  isActive?: boolean;
  className?: string;
}

export const PremiumCircularTimer: React.FC<PremiumCircularTimerProps> = ({
  timeRemaining,
  totalTime,
  size = 'md',
  label,
  isActive = true,
  className = ''
}) => {
  const percentage = Math.max(0, (timeRemaining / totalTime) * 100);
  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;
  
  // Size configurations
  const sizeConfig = {
    sm: { radius: 20, strokeWidth: 3, fontSize: 'text-xs', containerSize: 'w-12 h-12' },
    md: { radius: 28, strokeWidth: 4, fontSize: 'text-sm', containerSize: 'w-16 h-16' },
    lg: { radius: 35, strokeWidth: 5, fontSize: 'text-base', containerSize: 'w-20 h-20' }
  };
  
  const config = sizeConfig[size];
  const circumference = 2 * Math.PI * config.radius;
  const strokeDasharray = circumference;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;
  
  // Dynamic color system - PURPLE AND GOLD ONLY (uses CSS variables for theming)
  const getTimerColor = () => {
    if (percentage > 60) return { 
      stroke: 'var(--action-accent)', // gold/accent color
      glow: 'drop-shadow-[0_0_8px_color-mix(in_srgb,_var(--action-accent)_60%,_transparent)]',
      text: 'text-accent'
    };
    if (percentage > 30) return { 
      stroke: 'var(--action-primary)', // primary brand color
      glow: 'drop-shadow-[0_0_8px_color-mix(in_srgb,_var(--game-glow)_60%,_transparent)]',
      text: 'text-primary'
    };
    return { 
      stroke: 'var(--action-secondary)', // secondary for urgency
      glow: 'drop-shadow-[0_0_8px_color-mix(in_srgb,_var(--game-glow)_60%,_transparent)]',
      text: 'text-secondary'
    };
  };
  
  const colors = getTimerColor();
  const isUrgent = percentage <= 30;
  const isCritical = percentage <= 10;

  return (
    <div className={`relative ${config.containerSize} ${className}`}>
      {/* Background glow effect */}
      {isActive && (
        <motion.div 
          className="absolute inset-0 rounded-full bg-primary/20 blur-md"
          animate={{ 
            scale: isUrgent ? [1, 1.2, 1] : 1,
            opacity: isUrgent ? [0.5, 0.8, 0.5] : 0.3
          }}
          transition={{ 
            duration: isCritical ? 0.5 : 1.5,
            repeat: isUrgent ? Infinity : 0
          }}
        />
      )}
      
      {/* SVG Circular Progress */}
      <svg 
        className={`${config.containerSize} transform -rotate-90 ${colors.glow}`}
        viewBox={`0 0 ${(config.radius + config.strokeWidth) * 2} ${(config.radius + config.strokeWidth) * 2}`}
      >
        {/* Background circle */}
        <circle
          cx={config.radius + config.strokeWidth}
          cy={config.radius + config.strokeWidth}
          r={config.radius}
          stroke="currentColor"
          strokeWidth={config.strokeWidth}
          fill="transparent"
          className="text-muted/20"
        />
        
        {/* Progress circle */}
        <motion.circle
          cx={config.radius + config.strokeWidth}
          cy={config.radius + config.strokeWidth}
          r={config.radius}
          stroke={colors.stroke}
          strokeWidth={config.strokeWidth}
          fill="transparent"
          strokeLinecap="round"
          strokeDasharray={strokeDasharray}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
          className="drop-shadow-elevated"
        />
      </svg>
      
      {/* Time display in center */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.div 
          className={`font-bold ${config.fontSize} ${colors.text}`}
          animate={isCritical ? { scale: [1, 1.1, 1] } : {}}
          transition={{ duration: 0.5, repeat: isCritical ? Infinity : 0 }}
        >
          {totalTime >= 60 ? `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}` : `${timeRemaining}s`}
        </motion.div>
        <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">
          {label}
        </div>
      </div>
      
      {/* Critical state pulse effect - uses CSS variable for urgency */}
      {isCritical && isActive && (
        <motion.div 
          className="absolute inset-0 rounded-full border-2 border-primary"
          animate={{ 
            scale: [1, 1.3, 1],
            opacity: [0.8, 0, 0.8]
          }}
          transition={{ duration: 1, repeat: Infinity }}
        />
      )}
    </div>
  );
};