import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Trophy, X } from 'lucide-react';

interface CardData {
  id: string;
  name: string;
  imageKey?: string;
  stats: Array<{
    statTypeId: string;
    statName: string;
    value: string;
  }>;
}

interface RoundResultOverlayProps {
  show: boolean;
  winnerCard: CardData | null;
  loserCard: CardData | null;
  selectedStatId: string | null;
  selectedStatName: string | null;
  winnerValue: number | null;
  loserValue: number | null;
  isPlayerWinner: boolean;
  onComplete: () => void;
  isTie?: boolean;
}

export function RoundResultOverlay({
  show,
  winnerCard,
  loserCard,
  selectedStatId,
  selectedStatName,
  winnerValue,
  loserValue,
  isPlayerWinner,
  onComplete,
  isTie = false
}: RoundResultOverlayProps) {
  
  useEffect(() => {
    if (show) {
      // Auto-dismiss after animation completes
      const timer = setTimeout(() => {
        onComplete();
      }, 3000);
      
      return () => clearTimeout(timer);
    }
  }, [show, onComplete]);

  if (!show || !winnerCard || !loserCard) return null;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--modal-overlay)] backdrop-blur-sm"
          data-testid="overlay-round-result"
        >
          {/* Result Header */}
          <motion.div
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="absolute top-8 left-1/2 transform -translate-x-1/2 z-50"
          >
            <div className={`px-6 py-3 rounded-full font-bold text-lg ${
              isTie ? 'bg-[var(--game-gold)] text-accent-foreground' : 
              isPlayerWinner ? 'bg-success text-success-foreground' : 'bg-destructive text-destructive-foreground'
            }`}>
              {isTie ? '🤝 TIE!' : isPlayerWinner ? '🎉 YOU WIN!' : '😔 YOU LOSE'}
            </div>
          </motion.div>

          {/* Stacked Cards Container */}
          <div className="relative w-full max-w-sm px-4">
            {/* Loser Card - Behind, peeking out with name and stat visible */}
            <motion.div
              initial={{ y: 120, opacity: 0, scale: 0.85 }}
              animate={{ y: 140, opacity: 0.85, scale: 0.92 }}
              transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
              className="absolute inset-0 flex justify-center"
              style={{ zIndex: 1 }}
            >
              <Card className="w-full max-w-[280px] aspect-[5/7] border-4 border-[var(--destructive)]/50 overflow-hidden">
                <div className="w-full h-full relative">
                  {/* Card image */}
                  <div className="absolute inset-0">
                    {loserCard.imageKey ? (
                      <img 
                        src={`/api/cards/${loserCard.id}/image`}
                        alt={loserCard.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-destructive flex items-center justify-center text-[var(--destructive-foreground)]/20 text-6xl font-bold">
                        {loserCard.name[0]}
                      </div>
                    )}
                    <div className="absolute inset-0 bg-background/40"></div>
                  </div>
                  
                  {/* Loser card name - always visible at top */}
                  <div className="relative z-10 h-full flex flex-col">
                    <div className="absolute top-2 left-2 right-2">
                      <div className="bg-destructive/95 backdrop-blur-sm rounded-lg px-3 py-1.5 text-center shadow-elevated">
                        <div className="font-bold text-sm text-destructive-foreground">{loserCard.name}</div>
                      </div>
                    </div>
                    
                    {/* Show losing stat value at bottom */}
                    {selectedStatName && loserValue !== null && (
                      <div className="absolute bottom-2 left-2 right-2">
                        <div className="bg-destructive/95 backdrop-blur-sm rounded-lg px-4 py-3 text-center shadow-elevated">
                          <div className="text-xs text-[var(--destructive-foreground)]/90 font-medium">{selectedStatName}</div>
                          <div className="text-3xl font-bold text-destructive-foreground mt-1">{loserValue}</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </motion.div>

            {/* Winner Card - On top, full visibility */}
            <motion.div
              initial={{ y: -100, opacity: 0, scale: 1.1 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              transition={{ delay: 0.4, type: 'spring', stiffness: 200 }}
              className="relative flex justify-center"
              style={{ zIndex: 2 }}
            >
              <Card className={`w-full max-w-[280px] aspect-[5/7] border-4 overflow-hidden ${
                isTie ? 'border-[var(--game-gold)]' : 'border-[var(--success)] shadow-dialog shadow-[var(--success)]/50'
              }`}>
                <div className="w-full h-full relative">
                  {/* Trophy icon for winner */}
                  {!isTie && (
                    <motion.div
                      initial={{ scale: 0, rotate: -180 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ delay: 0.6, type: 'spring' }}
                      className="absolute top-4 right-4 z-30"
                    >
                      <div className="bg-[var(--game-gold)] rounded-full p-2">
                        <Trophy className="w-6 h-6 text-accent-foreground" />
                      </div>
                    </motion.div>
                  )}
                  
                  {/* Card image */}
                  <div className="absolute inset-0">
                    {winnerCard.imageKey ? (
                      <img 
                        src={`/api/cards/${winnerCard.id}/image`}
                        alt={winnerCard.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-success flex items-center justify-center text-success-foreground/20 text-6xl font-bold">
                        {winnerCard.name[0]}
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 h-1/2 bg-background/90"></div>
                  </div>
                  
                  {/* Winner card content */}
                  <div className="relative z-10 h-full flex flex-col">
                    <div className="absolute top-2 left-2 right-2">
                      <div className={`backdrop-blur-sm rounded-lg px-3 py-1.5 text-center ${
                        isTie ? 'bg-[var(--game-gold)]/95 text-accent-foreground' : 'bg-success/95 text-success-foreground'
                      }`}>
                        <div className="font-bold text-sm">{winnerCard.name}</div>
                      </div>
                    </div>
                    
                    {/* Show winning stat value at bottom */}
                    {selectedStatName && winnerValue !== null && (
                      <div className="absolute bottom-2 left-2 right-2">
                        <div className={`backdrop-blur-sm rounded-lg px-4 py-3 text-center ${
                          isTie ? 'bg-[var(--game-gold)]/95' : 'bg-success/95'
                        }`}>
                          <div className="text-xs text-success-foreground/90">{selectedStatName}</div>
                          <div className="text-3xl font-bold text-success-foreground">{winnerValue}</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </motion.div>
          </div>

          {/* Skip button */}
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            onClick={onComplete}
            className="absolute bottom-8 left-1/2 transform -translate-x-1/2 px-6 py-2 bg-foreground/20 hover:bg-foreground/30 backdrop-blur-sm rounded-full text-foreground font-medium transition-colors"
            data-testid="button-skip-overlay"
          >
            <X className="w-4 h-4 inline mr-2" />
            Skip
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
