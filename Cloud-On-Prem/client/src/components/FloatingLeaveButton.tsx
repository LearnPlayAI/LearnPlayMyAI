import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ArrowLeft, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface FloatingLeaveButtonProps {
  onLeave: () => void;
  onForfeit?: () => void;
  isGameActive?: boolean;
  gameMode?: string;
  className?: string;
}

export const FloatingLeaveButton: React.FC<FloatingLeaveButtonProps> = ({
  onLeave,
  onForfeit,
  isGameActive = false,
  gameMode = 'single',
  className = ''
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  
  const isMultiplayer = gameMode !== 'single';
  const shouldForfeit = isGameActive && isMultiplayer;
  
  const handleClick = () => {
    if (shouldForfeit) {
      setShowConfirm(true);
    } else {
      onLeave();
    }
  };
  
  const handleConfirm = () => {
    setShowConfirm(false);
    setIsExpanded(false);
    if (shouldForfeit && onForfeit) {
      onForfeit();
    } else {
      onLeave();
    }
  };
  
  const handleCancel = () => {
    setShowConfirm(false);
    setIsExpanded(false);
  };

  return (
    <div className={`fixed top-24 left-4 z-40 ${className}`}>
      <AnimatePresence>
        {showConfirm && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: -10 }}
            className="absolute top-12 left-0 bg-card/95 backdrop-blur-sm border border-border rounded-lg p-3 shadow-elevated min-w-[200px]"
          >
            <div className="text-sm font-medium mb-2 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              {shouldForfeit ? 'Forfeit Game?' : 'Leave Game?'}
            </div>
            <div className="text-xs text-muted-foreground mb-3">
              {shouldForfeit 
                ? 'You will lose this game if you leave now.' 
                : 'Are you sure you want to leave?'
              }
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" onClick={handleConfirm} className="text-xs h-7 px-3" >
                {shouldForfeit ? 'Forfeit' : 'Leave'}
              </Button>
              <Button size="sm" variant="secondary" onClick={handleCancel} className="text-xs h-7 px-3" >
                Cancel
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      <motion.div
        onHoverStart={() => setIsExpanded(true)}
        onHoverEnd={() => !showConfirm && setIsExpanded(false)}
        onTapStart={() => setIsExpanded(true)}
        className="relative"
      >
        <motion.button
          onClick={handleClick}
          className={`
            floating-action-btn
            relative rounded-full flex items-center justify-center
            transition-all duration-200 shadow-elevated backdrop-blur-sm
            font-medium border-2
            touch-manipulation ring-2 ring-[var(--action-accent)]/20
          `}
          whileHover={{ scale: 1.05, boxShadow: "0 0 20px var(--state-halo-active)" }}
          whileTap={{ scale: 0.95 }}
          data-testid={shouldForfeit ? "button-forfeit-floating" : "button-leave-floating"}
        >
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            {shouldForfeit ? <X className="w-5 h-5" /> : <ArrowLeft className="w-5 h-5" />}
          </motion.div>
        </motion.button>
        
        {/* Expanded label */}
        <AnimatePresence>
          {isExpanded && !showConfirm && (
            <motion.div
              initial={{ opacity: 0, x: -10, scale: 0.8 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: -10, scale: 0.8 }}
              className="absolute top-1/2 left-14 -translate-y-1/2 backdrop-blur-sm border rounded-md px-3 py-1 shadow-elevated whitespace-nowrap"
              style={{
                background: 'linear-gradient(90deg, var(--gradient-accent-from), var(--gradient-accent-to))',
                borderColor: 'var(--action-accent)',
              }}
            >
              <div className="text-xs font-bold text-accent-foreground">
                {shouldForfeit ? 'Forfeit Game' : 'Leave Game'}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* Connection indicator for multiplayer */}
        {isMultiplayer && (
          <motion.div
            className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-primary border-2 border-[var(--warning)]/50"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        )}
      </motion.div>
    </div>
  );
};
