import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Crown, Target, Sparkles, Award, Zap } from 'lucide-react';
import { getThemeConfettiColors } from '@/lib/themePalettes';

// Confetti Component
const Confetti = ({ colors = getThemeConfettiColors() }) => {
  const confettiPieces = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    delay: Math.random() * 3,
    duration: 3 + Math.random() * 2,
    x: Math.random() * 100,
    rotation: Math.random() * 360,
    color: colors[Math.floor(Math.random() * colors.length)]
  }));

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {confettiPieces.map((piece) => (
        <motion.div
          key={piece.id}
          className="absolute w-2 h-2 rounded"
          style={{
            backgroundColor: piece.color,
            left: `${piece.x}%`,
            top: '-10px'
          }}
          initial={{ 
            y: -20, 
            rotate: 0,
            scale: 0
          }}
          animate={{ 
            y: window.innerHeight + 20,
            rotate: piece.rotation * 4,
            scale: [0, 1, 1, 0],
            x: [0, Math.random() * 100 - 50, Math.random() * 200 - 100]
          }}
          transition={{
            duration: piece.duration,
            delay: piece.delay,
            ease: "easeOut"
          }}
        />
      ))}
    </div>
  );
};

// Floating particles for lose animation
const FloatingParticles = () => {
  const particles = Array.from({ length: 20 }, (_, i) => ({
    id: i,
    delay: Math.random() * 2,
    duration: 4 + Math.random() * 2,
    x: Math.random() * 100,
    y: Math.random() * 100
  }));

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {particles.map((particle) => (
        <motion.div
          key={particle.id}
          className="absolute w-1 h-1 bg-destructive/30 rounded-full"
          style={{
            left: `${particle.x}%`,
            top: `${particle.y}%`
          }}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ 
            scale: [0, 1, 0],
            opacity: [0, 0.6, 0],
            y: [-20, -60],
            x: [0, Math.random() * 40 - 20]
          }}
          transition={{
            duration: particle.duration,
            delay: particle.delay,
            repeat: Infinity,
            ease: "easeOut"
          }}
        />
      ))}
    </div>
  );
};

// Sparkle animation for tie
const SparkleAnimation = () => {
  const sparkles = Array.from({ length: 15 }, (_, i) => ({
    id: i,
    delay: Math.random() * 1.5,
    x: Math.random() * 100,
    y: Math.random() * 100
  }));

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {sparkles.map((sparkle) => (
        <motion.div
          key={sparkle.id}
          className="absolute w-1 h-1 bg-[var(--game-gold)] rounded-full"
          style={{
            left: `${sparkle.x}%`,
            top: `${sparkle.y}%`
          }}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ 
            scale: [0, 1.5, 0],
            opacity: [0, 1, 0]
          }}
          transition={{
            duration: 1.5,
            delay: sparkle.delay,
            repeat: Infinity,
            ease: "easeInOut"
          }}
        />
      ))}
    </div>
  );
};

const GameOverlay = ({ type, onClose, showContinueButton, onContinue, cardsWon = 1, cardsFromTie = 0 }) => {
  const [showText, setShowText] = useState(false);

  useEffect(() => {
    if (type) {
      setTimeout(() => setShowText(true), 100); // Quick text reveal so users can read the message
    } else {
      setShowText(false);
    }
  }, [type]);

  const overlayVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
    exit: { opacity: 0 }
  };

  const textVariants = {
    hidden: { scale: 0, opacity: 0, rotateY: 180 },
    visible: { 
      scale: 1, 
      opacity: 1, 
      rotateY: 0,
      transition: {
        type: "spring",
        damping: 12,
        stiffness: 200
      }
    }
  };

  const iconVariants = {
    hidden: { scale: 0, rotate: -180 },
    visible: { 
      scale: 1, 
      rotate: 0,
      transition: {
        type: "spring",
        damping: 10,
        stiffness: 300,
        delay: 0.2
      }
    }
  };

  const getOverlayContent = () => {
    switch (type) {
      case 'win':
        // Show intuitive card gains: +1 for normal wins, higher for tie wins
        const intuitive_cards_won = cardsFromTie > 0 ? cardsFromTie + 1 : 1;
        const winSubtitle = cardsFromTie > 0 
          ? `+${intuitive_cards_won} Cards Won (${cardsFromTie} from ties!)`
          : `+${intuitive_cards_won} Card Won`;
        return {
          title: "Round Won!",
          subtitle: winSubtitle,
          icon: Trophy,
          bgColor: "bg-success/20",
          textColor: "text-success",
          iconColor: "text-glow-gold",
          animation: <Confetti />
        };
      
      case 'lose':
        // Show intuitive card losses: -1 for normal losses, higher for tie losses
        const intuitive_cards_lost = cardsFromTie > 0 ? cardsFromTie + 1 : 1;
        const loseSubtitle = cardsFromTie > 0
          ? `-${intuitive_cards_lost} Cards Lost (including ${cardsFromTie} from ties)`
          : `-${intuitive_cards_lost} Card Lost`;
        return {
          title: "Round Lost",
          subtitle: loseSubtitle,
          icon: Target,
          bgColor: "bg-destructive/20",
          textColor: "text-destructive",
          iconColor: "text-destructive",
          animation: <FloatingParticles />
        };
      
      case 'tie':
        return {
          title: "It's a Tie!",
          subtitle: "Cards stay in play",
          icon: Sparkles,
          bgColor: "bg-surface-raised",
          textColor: "text-secondary",
          iconColor: "text-glow-gold",
          animation: <SparkleAnimation />
        };
      
      case 'victory':
        return {
          title: "VICTORY!",
          subtitle: "You conquered all cards!",
          icon: Crown,
          bgColor: "bg-[var(--game-gold)]/30",
          textColor: "text-glow-gold",
          iconColor: "text-glow-gold",
          animation: <Confetti />
        };
      
      case 'game-over':
        return {
          title: "Game Over",
          subtitle: "Better luck next time!",
          icon: Zap,
          bgColor: "bg-muted/30",
          textColor: "text-muted-foreground",
          iconColor: "text-muted-foreground",
          animation: <FloatingParticles />
        };
      
      default:
        return null;
    }
  };

  const content = getOverlayContent();
  if (!content) return null;

  const IconComponent = content.icon;

  return (
    <AnimatePresence>
      {type && (
        <motion.div
          className={`fixed inset-0 z-50 flex items-center justify-center ${content.bgColor} backdrop-blur-sm fast-overlay p-4 sm:p-6 lg:p-8`}
          variants={overlayVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={{ duration: 0.2 }} // Quick entry but allow time to read content
        >
          {content.animation}
          
          <motion.div
            className="text-center px-4 sm:px-6 lg:px-8 py-4 sm:py-6 bg-[var(--modal-bg)] rounded-xl border border-[var(--modal-border)] backdrop-blur-md w-full max-w-sm sm:max-w-md lg:max-w-lg"
            variants={textVariants}
            initial="hidden"
            animate={showText ? "visible" : "hidden"}
          >
            <motion.div
              variants={iconVariants}
              initial="hidden"
              animate={showText ? "visible" : "hidden"}
              className="flex justify-center mb-4"
            >
              <IconComponent className={`w-12 h-12 sm:w-16 sm:h-16 ${content.iconColor}`} />
            </motion.div>
            
            <motion.h2
              className={`text-2xl sm:text-3xl lg:text-4xl font-bold ${content.textColor} mb-2`}
              variants={textVariants}
            >
              {content.title}
            </motion.h2>
            
            <motion.p
              className="text-sm sm:text-base lg:text-lg text-foreground/80"
              variants={textVariants}
            >
              {content.subtitle}
            </motion.p>

            {/* Continue button for game-ending events */}
            {showContinueButton && onContinue && (
              <motion.div
                className="mt-4 sm:mt-6"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }} // Reduced delay so button appears faster
              >
                <button
                  onClick={onContinue}
                  className="px-4 sm:px-6 lg:px-8 py-2 sm:py-3 bg-primary hover:bg-primary/90 text-btn-primary-foreground text-sm sm:text-base font-semibold rounded-lg shadow-elevated transition-all duration-200 transform hover:scale-105 min-h-[48px] min-w-[120px] w-full sm:w-auto"
                  data-testid="button-continue-game"
                >
                  Continue
                </button>
              </motion.div>
            )}
            

            {/* Pulse effect for major events */}
            {(type === 'victory' || type === 'game-over') && (
              <motion.div
                className="absolute inset-0 border-2 border-[var(--modal-border)] rounded-xl"
                animate={{
                  scale: [1, 1.05, 1],
                  opacity: [0.5, 0.8, 0.5]
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
              />
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default GameOverlay;
