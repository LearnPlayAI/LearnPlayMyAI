import { useState, useEffect } from 'react';
import { useLocation, useParams } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Brain, Trophy, Home, Check, X, Users, Zap, Star, Target, Flame, Swords, Clock } from 'lucide-react';
import { QuizRoundResultModal } from '@/components/QuizRoundResultModal';
import { GamefiedQuizResultModal } from '@/components/GamefiedQuizResultModal';
import { ActivePowerUpsOverlay } from '@/components/ActivePowerUpsOverlay';
import { queryClient } from '@/lib/queryClient';

let socket: Socket | null = null;

interface QuizCard {
  id: string;
  question: string;
  answers: string[];
  correctAnswerIndex: number;
}

interface GameState {
  gameId: string;
  currentCard: QuizCard | null;
  roundNumber: number;
  totalQuestions: number;
  player1Score: number;
  player2Score: number;
  player1Name: string;
  player2Name: string;
  gameStatus: 'matchmaking' | 'waiting' | 'playing' | 'finished';
}

export default function Quiz1v1() {
  const { collectionId } = useParams<{ collectionId: string }>();
  const [, setLocation] = useLocation();
  const { data: user } = useQuery<any>({ queryKey: ['/api/user-status'] });

  // Fetch linked lesson info for navigation
  const { data: linkedLesson } = useQuery<{ lessonId: string | null; courseId: string | null }>({
    queryKey: [`/api/quiz/collections/${collectionId}/linked-lesson`],
    enabled: !!collectionId
  });
  
  const [gameState, setGameState] = useState<GameState>({
    gameId: '',
    currentCard: null,
    roundNumber: 0,
    totalQuestions: 0,
    player1Score: 0,
    player2Score: 0,
    player1Name: '',
    player2Name: '',
    gameStatus: 'matchmaking'
  });

  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [roundResult, setRoundResult] = useState<any>(null);
  const [isAnswering, setIsAnswering] = useState(false);
  const [answerStartTime, setAnswerStartTime] = useState<number>(0);
  const [waitingForOpponent, setWaitingForOpponent] = useState(false);
  const [streak, setStreak] = useState(0);
  const [showCelebration, setShowCelebration] = useState(false);
  const [xpResult, setXpResult] = useState<any>(null);
  const [showGamefiedResultModal, setShowGamefiedResultModal] = useState(false);
  const [showWaitingPlayers, setShowWaitingPlayers] = useState(false);
  const resultCorrectAnswerIndex = typeof roundResult?.correctIndex === 'number' ? roundResult.correctIndex : null;

  // Fetch waiting quiz players
  const { data: waitingPlayers = [], refetch: refetchWaitingPlayers } = useQuery<any[]>({
    queryKey: ['/api/quiz/matchmaking/waiting-players'],
    refetchInterval: 5000, // Refresh every 5 seconds
    enabled: gameState.gameStatus === 'matchmaking'
  });

  useEffect(() => {
    if (!collectionId) return;

    socket = io({
      path: '/socket.io',
      transports: ['polling', 'websocket'],
      withCredentials: true
    });

    socket.on('connect', () => {
      console.log('Connected to socket');
      const playerName = user?.guestName || user?.gamerName || 'Player';
      const playerId = user?.guestName ? `guest_${Date.now()}` : (user?.id || `anon_${Date.now()}`);

      setGameState(prev => ({ ...prev, gameStatus: 'matchmaking' }));

      socket?.emit('join-quiz-1v1-queue', {
        collectionId,
        roundTime: 30,
        gameTime: 300
      });
    });

    socket.on('quiz-matchmaking', () => {
      console.log('Searching for opponent...');
      setGameState(prev => ({ ...prev, gameStatus: 'matchmaking' }));
    });

    socket.on('quiz-game-started', (data: any) => {
      setGameState({
        gameId: data.gameId,
        currentCard: data.currentCard,
        roundNumber: 1,
        totalQuestions: data.totalQuestions,
        player1Score: 0,
        player2Score: 0,
        player1Name: data.player1Name,
        player2Name: data.player2Name,
        gameStatus: 'playing'
      });
      setAnswerStartTime(Date.now());
    });

    socket.on('quiz-round-result', (data: any) => {
      console.log('Round result:', data);
      setRoundResult(data);
      setShowResult(true);
      setWaitingForOpponent(false);
      
      if (data.result === 'player1' || data.result === 'both') {
        setStreak(prev => prev + 1);
        if (streak >= 2) {
          setShowCelebration(true);
          setTimeout(() => setShowCelebration(false), 2000);
        }
      } else {
        setStreak(0);
      }
      
      setGameState(prev => ({
        ...prev,
        player1Score: data.player1Score,
        player2Score: data.player2Score,
        roundNumber: data.roundNumber
      }));
    });

    socket.on('quiz-waiting-opponent', () => {
      console.log('Waiting for opponent...');
      setWaitingForOpponent(true);
    });

    socket.on('quiz-next-card', (data: any) => {
      setGameState(prev => ({
        ...prev,
        currentCard: data.currentCard,
        roundNumber: data.roundNumber
      }));
      setSelectedAnswer(null);
      setShowResult(false);
      setRoundResult(null);
      setIsAnswering(false);
      setWaitingForOpponent(false);
      setAnswerStartTime(Date.now());
    });

    socket.on('quiz-game-should-end', (data: any) => {
      // Emit quiz-game-ended to trigger proper XP calculation on server
      socket?.emit('quiz-game-ended', { gameId: data.gameId });
    });

    socket.on('quiz-game-over', (data: any) => {
      setGameState(prev => ({
        ...prev,
        gameStatus: 'finished',
        player1Score: data.player1Score,
        player2Score: data.player2Score
      }));
      
      // Show gamified result modal with XP data
      setXpResult(data.xpResult);
      setShowGamefiedResultModal(true);
      
      // Invalidate number bubble counters in quiz lobby
      queryClient.invalidateQueries({
        queryKey: ["/api/quiz/completion-status"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/quiz/my-progress"],
      });
      queryClient.invalidateQueries({
        queryKey: ["/api/student/progress-stats"],
      });
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey[0];
          return typeof key === "string" && key.startsWith("/api/lessons/assigned");
        },
      });
    });

    socket.on('quiz-error', (data: any) => {
      console.error('Quiz error:', data);
      alert(data.message);
      if (linkedLesson?.lessonId && linkedLesson?.courseId && typeof linkedLesson.lessonId === 'string') {
        setLocation(`/lessons/${linkedLesson.lessonId}?courseId=${linkedLesson.courseId}`);
      } else {
        setLocation('/my-courses');
      }
    });

    socket.on('quiz-queue-updated', () => {
      console.log('Quiz queue updated, refreshing waiting players...');
      refetchWaitingPlayers();
    });

    return () => {
      socket?.disconnect();
      socket = null;
    };
  }, [collectionId, user, refetchWaitingPlayers]);

  const handleAnswerSelect = (answerIndex: number) => {
    // Prevent multiple submissions - check and set immediately to avoid race conditions
    if (isAnswering || showResult || !gameState.currentCard) return;
    
    // Set isAnswering FIRST to block subsequent clicks immediately
    setIsAnswering(true);
    setSelectedAnswer(answerIndex);
    
    const answerTime = Date.now() - answerStartTime;
    
    // Emit answer submission
    socket?.emit('quiz-answer-submitted', {
      gameId: gameState.gameId,
      answerIndex,
      answerTime
    });
  };

  const handleNextQuestion = () => {
    socket?.emit('quiz-next-card', {
      gameId: gameState.gameId
    });
  };

  const navigateBack = () => {
    if (linkedLesson?.lessonId && linkedLesson?.courseId && typeof linkedLesson.lessonId === 'string') {
      setLocation(`/lessons/${linkedLesson.lessonId}?courseId=${linkedLesson.courseId}`);
    } else {
      setLocation('/my-courses');
    }
  };

  const handleBackToLobby = () => {
    // Invalidate all quiz-related queries to ensure fresh data when returning
    queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
    queryClient.invalidateQueries({ queryKey: ['/api/quiz/completion-status'] });
    queryClient.invalidateQueries({ queryKey: ['/api/quiz-leaderboard'] });
    queryClient.invalidateQueries({ queryKey: ['/api/quiz/collections/organization'] });
    queryClient.invalidateQueries({ queryKey: ['/api/quiz/collections/public'] });
    queryClient.invalidateQueries({ queryKey: ['/api/student/progress-stats'] });
    queryClient.invalidateQueries({ queryKey: ['/api/quiz/my-progress'] });
    queryClient.invalidateQueries({ queryKey: ['/api/gamification/season-pass'] });
    queryClient.invalidateQueries({ queryKey: ['/api/gamification/dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['/api/gamification/challenges'] });
    
    socket?.disconnect();
    navigateBack();
  };

  if (gameState.gameStatus === 'matchmaking') {
    return (
      <div className="min-h-screen bg-[var(--quiz-lobby-bg)] flex items-center justify-center p-4">
        <div className="max-w-4xl w-full">
          <Card className="bg-[var(--surface-raised)]/50 backdrop-blur-xl border-2 border-primary/30 shadow-dialog">
            <CardContent className="py-16 text-center">
              <div className="relative mb-8">
                <div className="absolute inset-0 animate-ping">
                  <Swords className="w-20 h-20 text-primary mx-auto opacity-30" />
                </div>
                <Swords className="w-20 h-20 text-primary mx-auto relative animate-pulse" />
              </div>
              <h3 className="text-3xl font-bold text-foreground mb-3">
                Finding Opponent
              </h3>
              <p className="text-primary mb-6">
                Searching for a worthy challenger...
              </p>
              <div className="flex items-center justify-center gap-2 mb-6">
                <div className="w-3 h-3 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
                <div className="w-3 h-3 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                <div className="w-3 h-3 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
              </div>

              {/* Waiting Players Section */}
              {waitingPlayers.length > 0 && (
                <div className="mb-6">
                  <Button onClick={() => setShowWaitingPlayers(!showWaitingPlayers)}
                    variant="outline"
                    className="border-primary/30 hover:bg-primary/15 text-primary"
                    data-testid="button-toggle-waiting-players"
                  >
                    <Users className="w-4 h-4 mr-2" />
                    {showWaitingPlayers ? 'Hide' : 'Show'} Waiting Players ({waitingPlayers.length})
                  </Button>
                </div>
              )}

              {showWaitingPlayers && waitingPlayers.length > 0 && (
                <div className="max-h-96 overflow-y-auto mb-6 px-4">
                  <div className="space-y-3">
                    {waitingPlayers.map((player: any, index: number) => (
                      <div
                        key={index}
                        className="bg-[var(--surface-muted)]/50 border border-primary/30 rounded-lg p-4 hover:bg-[var(--surface-muted)]/70 transition-colors"
                      >
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
                            <Users className="w-5 h-5 text-primary-foreground" />
                          </div>
                          <div className="flex-1">
                            <p className="text-foreground font-semibold" data-testid={`text-waiting-player-${index}`}>
                              {player.playerName}
                            </p>
                            <p className="text-sm text-primary/80">
                              {player.collectionName}
                            </p>
                          </div>
                          <div className="text-right">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Clock className="w-4 h-4" />
                              <span>{player.waitTimeSeconds}s</span>
                            </div>
                            <div className="text-xs text-[var(--text-muted)]/80">
                              {player.roundTimeSeconds}s rounds
                            </div>
                          </div>
                        </div>
                        <Button onClick={() => {
                            socket?.emit('join-quiz-1v1-queue', {
                              collectionId: player.collectionId,
                              roundTime: player.roundTimeSeconds,
                              gameTime: player.gameTimeSeconds,
                              targetPlayerId: player.playerId
                            });
                          }}
                          className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                          data-testid={`button-quick-join-${index}`}
                        >
                          Quick Join
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Button onClick={handleBackToLobby} variant="outline" data-testid="button-cancel-queue" >
                Cancel
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (gameState.gameStatus === 'finished') {
    return (
      <div className="min-h-screen">
        <GamefiedQuizResultModal
          open={showGamefiedResultModal}
          onClose={handleBackToLobby}
          playerScore={gameState.player1Score}
          aiScore={gameState.player2Score}
          totalQuestions={gameState.totalQuestions}
          quizId={collectionId}
          courseId={linkedLesson?.courseId || undefined}
          lessonId={linkedLesson?.lessonId || undefined}
          xpResult={xpResult}
          onPlayAgain={() => {
            handleBackToLobby();
          }}
          user={user}
          onNavigate={(path: string) => setLocation(path)}
          variant="inline"
        />
      </div>
    );
  }

  const progressPercent = (gameState.roundNumber / gameState.totalQuestions) * 100;

  return (
    <div className="min-h-screen bg-[var(--quiz-lobby-bg)] p-4">
      <ActivePowerUpsOverlay />
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 bg-primary rounded-full blur-md opacity-50"></div>
              <Swords className="w-10 h-10 text-primary relative" />
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-primary hover:bg-primary/90 bg-clip-text text-transparent">
                1v1 Battle
              </h1>
              <p className="text-sm text-primary">
                Question {gameState.roundNumber} of {gameState.totalQuestions}
              </p>
            </div>
          </div>
          <Button variant="outline" onClick={handleBackToLobby} data-testid="button-quit" >
            <Home className="w-4 h-4 mr-2" />
            Quit
          </Button>
        </div>

        {/* Progress Bar */}
        <div className="mb-6 relative">
          <div className="bg-[var(--surface-muted)] rounded-full h-3 overflow-hidden border border-primary/30">
            <div 
              className="h-full bg-primary hover:bg-primary/90 transition-all duration-500 ease-out relative"
              style={{ width: `${progressPercent}%` }}
            >
              <div className="absolute inset-0 bg-transparent animate-shimmer"></div>
            </div>
          </div>
        </div>

        {/* Score Cards */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="relative group">
            <div className="absolute inset-0 bg-primary hover:bg-primary/90 rounded-2xl blur-sm opacity-50 group-hover:opacity-75 transition-opacity"></div>
            <Card className="relative bg-[var(--surface-raised)]/80 backdrop-blur-sm border-2 border-primary/50">
              <CardContent className="p-6 text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <div className="text-sm text-primary font-semibold uppercase tracking-wide">You</div>
                  {streak >= 3 && (
                    <Badge className="animate-pulse border-0" style={{ background: 'linear-gradient(to right, var(--celebration-from), var(--celebration-to))' }} >
                      <Flame className="w-3 h-3 mr-1" />
                      {streak}x
                    </Badge>
                  )}
                </div>
                <div className="text-5xl font-bold bg-primary hover:bg-primary/90 bg-clip-text text-transparent" data-testid="text-current-player-score">
                  {gameState.player1Score}
                </div>
                <div className="text-xs text-[var(--text-muted)]/80 mt-2 truncate">{gameState.player1Name}</div>
              </CardContent>
            </Card>
          </div>

          <div className="relative group">
            <div className="absolute inset-0 bg-destructive rounded-2xl blur-sm opacity-50 group-hover:opacity-75 transition-opacity"></div>
            <Card className="relative bg-[var(--surface-raised)]/80 backdrop-blur-sm border-2 border-[var(--destructive)]/50">
              <CardContent className="p-6 text-center">
                <div className="text-sm text-destructive font-semibold mb-2 uppercase tracking-wide">Opponent</div>
                <div className="text-5xl font-bold text-[var(--text-primary)]" data-testid="text-current-opponent-score">
                  {gameState.player2Score}
                </div>
                <div className="text-xs text-[var(--text-muted)]/80 mt-2 truncate">{gameState.player2Name}</div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Celebration Overlay */}
        {showCelebration && (
          <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-50">
            <div
              className="text-8xl font-bold bg-clip-text text-transparent animate-bounce"
              style={{
                backgroundImage: 'linear-gradient(to right, var(--celebration-from), var(--celebration-to))',
                filter: 'drop-shadow(0 0 20px var(--celebration-glow))',
              }}
            >
              🔥 ON FIRE! 🔥
            </div>
          </div>
        )}

        {/* Waiting for Opponent Message */}
        {waitingForOpponent && (
          <div className="mb-6">
            <Card className="bg-primary/15 backdrop-blur-sm border-2 border-primary/30">
              <CardContent className="py-4 text-center">
                <div className="flex items-center justify-center gap-3">
                  <Users className="w-5 h-5 text-primary animate-pulse" />
                  <span className="text-primary/80 font-medium">Waiting for opponent to answer...</span>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Question Card */}
        {gameState.currentCard && (
          <Card className="mb-6 bg-[var(--surface-raised)]/50 backdrop-blur-xl border-2 border-primary/30 shadow-dialog">
            <CardContent className="p-8">
              <div className="mb-6">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/15 rounded-full border border-primary/30 mb-4">
                  <Zap className="w-4 h-4 text-glow-gold" />
                  <span className="text-primary text-sm font-medium">Quick Answer Bonus!</span>
                </div>
                <h2 className="text-2xl md:text-3xl font-bold text-foreground leading-tight" data-testid="text-question">
                  {gameState.currentCard.question}
                </h2>
              </div>

              <div className="grid gap-3">
                {gameState.currentCard.answers.map((answer, index) => {
                  const isSelected = selectedAnswer === index;
                  const isCorrect = showResult && resultCorrectAnswerIndex === index;
                  const showCorrect = showResult && isCorrect;
                  const showWrong = showResult && isSelected && !isCorrect;
                  const opponentSelected = showResult && roundResult?.player2Answer === index;

                  return (
                    <button
                      key={index}
                      onClick={() => handleAnswerSelect(index)}
                      disabled={isAnswering || showResult}
                      className={`group relative p-5 rounded-xl text-left transition-all duration-300 transform hover:scale-[1.02] disabled:cursor-not-allowed ${
                        showCorrect 
                          ? 'bg-success border-2 border-[var(--success)]/80 shadow-elevated shadow-[var(--success)]/50 scale-[1.02]' 
                          : showWrong 
                          ? 'bg-destructive border-2 border-[var(--destructive)]/80 shadow-elevated shadow-[var(--destructive)]/50' 
                          : isSelected 
                          ? 'bg-primary hover:bg-primary/90 border-2 border-secondary' 
                          : 'bg-[var(--surface-muted)]/50 border-2 border-[var(--stroke-default)]/50 hover:border-primary/50 hover:bg-[var(--surface-muted)]/70'
                      }`}
                      data-testid={`button-answer-${index}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg transition-all ${
                          showCorrect 
                            ? 'bg-foreground/20 text-success-foreground' 
                            : showWrong 
                            ? 'bg-foreground/20 text-destructive-foreground'
                            : isSelected 
                            ? 'bg-foreground/20 text-primary-foreground'
                            : 'bg-primary/50 text-primary/80 group-hover:bg-primary group-hover:text-primary-foreground'
                        }`}>
                          {String.fromCharCode(65 + index)}
                        </div>
                        <span className={`flex-1 text-lg font-medium ${
                          showCorrect ? 'text-success-foreground' : showWrong ? 'text-destructive-foreground' : isSelected ? 'text-primary-foreground' : 'text-[var(--text-primary)]/90'
                        }`}>
                          {answer}
                        </span>
                        {showCorrect && (
                          <div className="flex items-center gap-2">
                            <Check className="w-6 h-6 text-success-foreground animate-bounce" />
                            <span className="text-sm font-semibold text-success-foreground">Correct!</span>
                          </div>
                        )}
                        {showWrong && <X className="w-6 h-6 text-destructive-foreground" />}
                        {showResult && isSelected && (
                          <Badge >Your answer</Badge>
                        )}
                        {opponentSelected && !isSelected && (
                          <Badge >
                            <Users className="w-3 h-3 mr-1" />
                            Opponent
                          </Badge>
                        )}
                      </div>
                      
                      {!showResult && !isSelected && (
                        <div className="absolute inset-0 bg-primary hover:bg-primary/90 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl"></div>
                      )}
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

      </div>

      {/* Round Result Modal */}
      <QuizRoundResultModal
        isOpen={showResult && gameState.gameStatus === 'playing'}
        roundResult={roundResult}
        currentCard={gameState.currentCard}
        onNext={handleNextQuestion}
        isMultiplayer={true}
      />

    </div>
  );
}
