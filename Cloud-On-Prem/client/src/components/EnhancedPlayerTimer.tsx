import { Progress } from '@/components/ui/progress';
import { Timer, AlertTriangle } from 'lucide-react';
import { motion } from 'framer-motion';

interface EnhancedPlayerTimerProps {
  timeRemaining: number;
  totalTime?: number;
  isActive: boolean;
}

export const EnhancedPlayerTimer: React.FC<EnhancedPlayerTimerProps> = ({ 
  timeRemaining, 
  totalTime = 5, 
  isActive 
}) => {
  if (!isActive) return null;
  
  const percentage = (timeRemaining / totalTime) * 100;
  const isUrgent = timeRemaining <= 3;
  const isCritical = timeRemaining <= 1;

  return (
    <motion.div 
      className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50"
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ type: "spring", duration: 0.3 }}
    >
      {/* Backdrop blur overlay */}
      <div className="absolute inset-0 bg-[var(--modal-overlay)] backdrop-blur-sm rounded-3xl transform scale-150" />
      
      {/* Main timer container */}
      <div className={`
        relative bg-[var(--timer-critical)]/20 
        border-4 border-[var(--timer-critical)] rounded-3xl p-8 shadow-dialog 
        ${isUrgent ? 'animate-pulse' : ''}
        ${isCritical ? 'border-[var(--timer-critical)]/80 shadow-[var(--timer-critical)]/50' : ''}
      `}>
        {/* Warning icon for critical time */}
        {isCritical && (
          <motion.div 
            className="absolute -top-4 -right-4 bg-[var(--timer-critical)] rounded-full p-2"
            animate={{ rotate: [0, 10, -10, 0] }}
            transition={{ duration: 0.5, repeat: Infinity }}
          >
            <AlertTriangle className="w-6 h-6 text-[var(--timer-critical-foreground)]" />
          </motion.div>
        )}

        {/* Timer icon */}
        <div className="flex items-center justify-center mb-4">
          <Timer className={`w-12 h-12 ${isCritical ? 'text-[var(--timer-critical)]/80' : 'text-[var(--timer-critical)]'}`} />
        </div>

        {/* Main countdown number */}
        <motion.div 
          className={`
            text-center text-8xl font-black 
            ${isCritical ? 'text-[var(--timer-critical)]/80' : 'text-[var(--timer-critical)]'}
            drop-shadow-elevated
          `}
          key={timeRemaining}
          initial={{ scale: 1.2 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", duration: 0.3 }}
        >
          {timeRemaining}
        </motion.div>

        {/* Progress bar */}
        <div className="mt-6 mb-4">
          <Progress 
            value={percentage} 
            className={`
              h-4 w-32 mx-auto border-2 border-[var(--stroke-default)]
              ${isUrgent ? 'animate-pulse' : ''}
            `}
          />
        </div>

        {/* Your Turn text */}
        <motion.div 
          className="text-center text-modal-foreground text-2xl font-bold tracking-wide"
          animate={isUrgent ? { opacity: [1, 0.5, 1] } : {}}
          transition={{ duration: 0.5, repeat: Infinity }}
        >
          YOUR TURN
        </motion.div>

        {/* Subtle reminder text */}
        <div className="text-center text-modal-foreground/80 text-sm mt-2">
          Choose a stat from your card
        </div>
      </div>

      {/* Animated background rings */}
      {isUrgent && (
        <>
          <motion.div 
            className="absolute inset-0 border-4 border-[var(--timer-critical)]/30 rounded-3xl"
            animate={{ scale: [1, 1.1, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
          />
          <motion.div 
            className="absolute inset-0 border-4 border-[var(--timer-critical)]/20 rounded-3xl"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 1, repeat: Infinity, delay: 0.2 }}
          />
        </>
      )}
    </motion.div>
  );
};