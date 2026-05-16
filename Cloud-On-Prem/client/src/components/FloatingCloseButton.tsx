import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface FloatingCloseButtonProps {
  onClose: () => void;
  className?: string;
}

export const FloatingCloseButton: React.FC<FloatingCloseButtonProps> = ({
  onClose,
  className = ''
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const handleClick = () => {
    onClose();
  };

  return (
    <div className={`fixed top-4 right-4 z-50 ${className}`}>
      <motion.div
        onHoverStart={() => setIsExpanded(true)}
        onHoverEnd={() => setIsExpanded(false)}
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
          data-testid="button-close-floating"
        >
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <X className="w-5 h-5" />
          </motion.div>
        </motion.button>
        
        {/* Expanded label */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, x: 10, scale: 0.8 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 10, scale: 0.8 }}
              className="absolute top-1/2 right-14 -translate-y-1/2 backdrop-blur-sm border rounded-md px-3 py-1 shadow-elevated whitespace-nowrap"
              style={{
                background: 'linear-gradient(90deg, var(--gradient-accent-from), var(--gradient-accent-to))',
                borderColor: 'var(--action-accent)',
              }}
            >
              <div className="text-xs font-bold text-accent-foreground">
                Close
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
};
