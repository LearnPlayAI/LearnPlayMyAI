import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';
import { Crown, Zap, Users, Timer, Clock, ArrowLeft, User, Swords, Gamepad2 } from 'lucide-react';

const CollectionModal = ({ collection, isOpen, onClose }) => {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState('gameMode'); // 'gameMode', '1v1Settings', 'singlePlayerSettings'
  const [selectedGameMode, setSelectedGameMode] = useState(null);
  const [roundTimeSeconds, setRoundTimeSeconds] = useState(5);
  const [gameTimeSeconds, setGameTimeSeconds] = useState(120);
  const [autoMatchmaking, setAutoMatchmaking] = useState(false); // Default to off
  const [isFindingGame, setIsFindingGame] = useState(false);

  // Reset modal state when closed
  useEffect(() => {
    if (!isOpen) {
      setStep('gameMode');
      setSelectedGameMode(null);
      setAutoMatchmaking(false); // Reset to default off
      setIsFindingGame(false);
    }
  }, [isOpen]);

  const findGameMutation = useMutation({
    mutationFn: async () => {
      // Use the new collection-only matchmaking system
      const gameId = `find_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      setLocation(`/multiplayer-1v1/${collection.id}?roundTime=${roundTimeSeconds}&gameTime=${gameTimeSeconds}&gameId=${gameId}&collectionOnly=true&autoMatchmaking=${autoMatchmaking}`);
      return { success: true };
    },
    onSuccess: () => {
      onClose();
    },
  });

  const startSinglePlayerMutation = useMutation({
    mutationFn: async () => {
      // Navigate to single player with selected timer settings
      setLocation(`/single-player/${collection.id}?roundTime=${roundTimeSeconds}&gameTime=${gameTimeSeconds}`);
      return { success: true };
    },
    onSuccess: () => {
      onClose();
    },
  });

  const handleGameModeSelect = (mode) => {
    setSelectedGameMode(mode);
    
    if (mode === 'single') {
      setStep('singlePlayerSettings');
    } else if (mode === '1v1') {
      setStep('1v1Settings');
    }
  };

  const handleFindGame = () => {
    setIsFindingGame(true);
    findGameMutation.mutate();
  };

  const handleStartSinglePlayer = () => {
    startSinglePlayerMutation.mutate();
  };

  const handleBack = () => {
    if (step === '1v1Settings' || step === 'singlePlayerSettings') {
      setStep('gameMode');
      setSelectedGameMode(null);
    }
  };

  if (!collection) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] max-w-2xl mx-auto max-h-[90vh] overflow-y-auto border-2 border-accent/30 shadow-dialog bg-background">
        <DialogHeader className="text-center px-2 sm:px-4">
          <DialogTitle className="text-xl sm:text-2xl md:text-3xl font-bold gradient-text flex items-center justify-center gap-2 flex-wrap">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg overflow-hidden border-2 border-accent/30 flex-shrink-0">
              {collection.imageKey ? (
                <img 
                  src={`/api/collections/${collection.id}/cover-image`}
                  alt={collection.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full bg-surface-base flex items-center justify-center text-primary-foreground font-bold">
                  {collection.name[0]}
                </div>
              )}
            </div>
            <span className="break-words">{collection.name}</span>
          </DialogTitle>
          <DialogDescription className="text-sm sm:text-base mt-2 px-2">
            {step === 'gameMode' && "Choose your game mode"}
            {step === '1v1Settings' && "Configure your 1v1 game settings"}
            {step === 'singlePlayerSettings' && "Configure your single player game"}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 sm:mt-6 px-2 sm:px-4 pb-4">
          {/* Back Button */}
          {step !== 'gameMode' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              className="mb-4 flex items-center gap-2 hover:bg-accent/10"
              disabled={isFindingGame}
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
          )}

          {/* Step 1: Game Mode Selection */}
          {step === 'gameMode' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              {/* Single Player */}
              <Card 
                className="cursor-pointer transition-all duration-300 hover:scale-105 border-2 hover:border-accent/50 hover:shadow-elevated"
                onClick={() => handleGameModeSelect('single')}
                data-testid="gamemode-single"
              >
                <CardHeader className="text-center pb-2">
                  <div className="flex justify-center mb-2">
                    <Zap className="w-12 h-12 text-muted-foreground" />
                  </div>
                  <CardTitle className="text-lg">Single Player</CardTitle>
                  <CardDescription className="text-sm">Play against AI opponent</CardDescription>
                </CardHeader>
                <CardContent className="pt-2">
                  <div className="flex items-center justify-center gap-2">
                    <User className="w-4 h-4" />
                    <span className="text-sm font-medium">1 Player</span>
                  </div>
                </CardContent>
              </Card>

              {/* 1v1 Multiplayer */}
              <Card 
                className="cursor-pointer transition-all duration-300 hover:scale-105 border-2 hover:border-accent/50 hover:shadow-elevated"
                onClick={() => handleGameModeSelect('1v1')}
                data-testid="gamemode-1v1"
              >
                <CardHeader className="text-center pb-2">
                  <div className="flex justify-center mb-2">
                    <Crown className="w-12 h-12 text-muted-foreground" />
                  </div>
                  <CardTitle className="text-lg">1v1 Head to Head</CardTitle>
                  <CardDescription className="text-sm">Challenge another player</CardDescription>
                </CardHeader>
                <CardContent className="pt-2">
                  <div className="flex items-center justify-center gap-2">
                    <Users className="w-4 h-4" />
                    <span className="text-sm font-medium">2 Players</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Step 2: 1v1 Game Settings */}
          {step === '1v1Settings' && (
            <div className="space-y-6">
              {/* Find Game Button - Moved to Top */}
              <Button
                onClick={handleFindGame}
                disabled={isFindingGame}
                className="w-full font-bold py-3 bg-accent hover:scale-105 transition-all duration-300"
                data-testid="button-find-game"
              >
                {isFindingGame ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                    Finding Game...
                  </>
                ) : (
                  <>
                    <Swords className="w-4 h-4 mr-2" />
                    Find Game ({Math.floor(gameTimeSeconds / 60)}m, {roundTimeSeconds}s rounds)
                  </>
                )}
              </Button>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                {/* Round Time Selection */}
                <Card className="border-accent/20">
                  <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6">
                    <CardTitle className="text-sm sm:text-base font-medium flex items-center gap-2">
                      <Timer className="w-4 h-4 sm:w-5 sm:h-5" />
                      Round Time
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 px-3 sm:px-6 pb-3 sm:pb-6">
                    <div className="space-y-1 sm:space-y-2">
                      {[
                        { value: 3, label: "3 seconds", desc: "Quick rounds" },
                        { value: 5, label: "5 seconds", desc: "Standard" },
                        { value: 10, label: "10 seconds", desc: "Thoughtful" }
                      ].map((option) => (
                        <div
                          key={option.value}
                          onClick={() => setRoundTimeSeconds(option.value)}
                          className={`cursor-pointer p-2 sm:p-3 rounded-lg border transition-all hover:scale-[1.02] ${
                            roundTimeSeconds === option.value 
                              ? 'border-accent bg-accent/10 text-accent ring-2 ring-accent/20' 
                              : 'border-muted hover:border-accent/50 hover:bg-accent/5'
                          }`}
                          data-testid={`timer-round-${option.value}`}
                        >
                          <div className="flex justify-between items-center">
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-xs sm:text-sm">{option.label}</div>
                              <div className="text-xs text-muted-foreground">{option.desc}</div>
                            </div>
                            {roundTimeSeconds === option.value && (
                              <div className="w-2 h-2 sm:w-3 sm:h-3 bg-accent rounded-full flex-shrink-0 ml-2"></div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Game Time Selection */}
                <Card className="border-accent/20">
                  <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6">
                    <CardTitle className="text-sm sm:text-base font-medium flex items-center gap-2">
                      <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
                      Game Time
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 px-3 sm:px-6 pb-3 sm:pb-6">
                    <div className="space-y-1 sm:space-y-2">
                      {[
                        { value: 60, label: "1 minute", desc: "Quick match" },
                        { value: 120, label: "2 minutes", desc: "Standard" },
                        { value: 180, label: "3 minutes", desc: "Extended" },
                        { value: 300, label: "5 minutes", desc: "Marathon" }
                      ].map((option) => (
                        <div
                          key={option.value}
                          onClick={() => setGameTimeSeconds(option.value)}
                          className={`cursor-pointer p-2 sm:p-3 rounded-lg border transition-all hover:scale-[1.02] ${
                            gameTimeSeconds === option.value 
                              ? 'border-accent bg-accent/10 text-accent ring-2 ring-accent/20' 
                              : 'border-muted hover:border-accent/50 hover:bg-accent/5'
                          }`}
                          data-testid={`timer-game-${option.value}`}
                        >
                          <div className="flex justify-between items-center">
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-xs sm:text-sm">{option.label}</div>
                              <div className="text-xs text-muted-foreground">{option.desc}</div>
                            </div>
                            {gameTimeSeconds === option.value && (
                              <div className="w-2 h-2 sm:w-3 sm:h-3 bg-accent rounded-full flex-shrink-0 ml-2"></div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Find Game Description */}
              <Card className="bg-accent/5 border-accent/20">
                <CardContent className="p-4 text-center">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Swords className="w-5 h-5 text-accent" />
                    <span className="font-medium text-accent">Smart Matchmaking</span>
                  </div>
                  <p className="text-sm text-muted-foreground mb-4">
                    We'll find you an opponent for <strong>{collection.name}</strong>. If someone is already hosting with different timer settings, you'll join their game. Otherwise, you'll host with your preferred settings.
                  </p>
                  
                  {/* Auto-matchmaking toggle */}
                  <div className="flex items-center justify-center gap-3 pt-2 border-t border-accent/20">
                    <span className="text-sm font-medium text-foreground">Auto-matching</span>
                    <Switch 
                      checked={autoMatchmaking}
                      onCheckedChange={setAutoMatchmaking}
                      data-testid="switch-auto-matchmaking"
                    />
                    <span className="text-xs text-muted-foreground">
                      {autoMatchmaking ? 'On' : 'Off'}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Step 3A: Single Player Timer Settings */}
          {step === 'singlePlayerSettings' && (
            <div className="space-y-6">
              {/* Start Single Player Button - Moved to Top */}
              <Button
                onClick={handleStartSinglePlayer}
                disabled={startSinglePlayerMutation.isPending}
                className="w-full font-bold py-3 bg-accent hover:scale-105 transition-all duration-300"
                data-testid="button-start-single-player"
              >
                {startSinglePlayerMutation.isPending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                    Starting Game...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 mr-2" />
                    Start Single Player ({Math.floor(gameTimeSeconds / 60)}m, {roundTimeSeconds}s rounds)
                  </>
                )}
              </Button>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
                {/* Round Time Selection */}
                <Card className="border-accent/20">
                  <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6">
                    <CardTitle className="text-sm sm:text-base font-medium flex items-center gap-2">
                      <Timer className="w-4 h-4 sm:w-5 sm:h-5" />
                      Round Time
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 px-3 sm:px-6 pb-3 sm:pb-6">
                    <div className="space-y-1 sm:space-y-2">
                      {[
                        { value: 3, label: "3 seconds", desc: "Quick rounds" },
                        { value: 5, label: "5 seconds", desc: "Standard" },
                        { value: 10, label: "10 seconds", desc: "Thoughtful" }
                      ].map((option) => (
                        <div
                          key={option.value}
                          onClick={() => setRoundTimeSeconds(option.value)}
                          className={`cursor-pointer p-2 sm:p-3 rounded-lg border transition-all hover:scale-[1.02] ${
                            roundTimeSeconds === option.value 
                              ? 'border-accent bg-accent/10 text-accent ring-2 ring-accent/20' 
                              : 'border-muted hover:border-accent/50 hover:bg-accent/5'
                          }`}
                          data-testid={`timer-round-${option.value}`}
                        >
                          <div className="flex justify-between items-center">
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-xs sm:text-sm">{option.label}</div>
                              <div className="text-xs text-muted-foreground">{option.desc}</div>
                            </div>
                            {roundTimeSeconds === option.value && (
                              <div className="w-2 h-2 sm:w-3 sm:h-3 bg-accent rounded-full flex-shrink-0 ml-2"></div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Game Time Selection */}
                <Card className="border-accent/20">
                  <CardHeader className="pb-2 sm:pb-3 px-3 sm:px-6">
                    <CardTitle className="text-sm sm:text-base font-medium flex items-center gap-2">
                      <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
                      Game Time
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 px-3 sm:px-6 pb-3 sm:pb-6">
                    <div className="space-y-1 sm:space-y-2">
                      {[
                        { value: 60, label: "1 minute", desc: "Quick match" },
                        { value: 120, label: "2 minutes", desc: "Standard" },
                        { value: 180, label: "3 minutes", desc: "Extended" },
                        { value: 300, label: "5 minutes", desc: "Marathon" }
                      ].map((option) => (
                        <div
                          key={option.value}
                          onClick={() => setGameTimeSeconds(option.value)}
                          className={`cursor-pointer p-2 sm:p-3 rounded-lg border transition-all hover:scale-[1.02] ${
                            gameTimeSeconds === option.value 
                              ? 'border-accent bg-accent/10 text-accent ring-2 ring-accent/20' 
                              : 'border-muted hover:border-accent/50 hover:bg-accent/5'
                          }`}
                          data-testid={`timer-game-${option.value}`}
                        >
                          <div className="flex justify-between items-center">
                            <div className="min-w-0 flex-1">
                              <div className="font-medium text-xs sm:text-sm">{option.label}</div>
                              <div className="text-xs text-muted-foreground">{option.desc}</div>
                            </div>
                            {gameTimeSeconds === option.value && (
                              <div className="w-2 h-2 sm:w-3 sm:h-3 bg-accent rounded-full flex-shrink-0 ml-2"></div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}


          {/* Find Game Loading State */}
          {isFindingGame && (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent mx-auto mb-4"></div>
              <h3 className="text-lg font-semibold mb-2">Finding Match...</h3>
              <p className="text-sm text-muted-foreground">Searching for available games in {collection.name} collection</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CollectionModal;