import { useState, useEffect } from 'react';
import { useLocation, useParams } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { io, Socket } from 'socket.io-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Brain, Trophy, Home, Check, X, Zap, Star, Target, Flame, RefreshCw, XCircle } from 'lucide-react';
import { GamefiedQuizResultModal } from '@/components/GamefiedQuizResultModal';
import { ActivePowerUpsOverlay } from '@/components/ActivePowerUpsOverlay';
import { queryClient } from '@/lib/queryClient';
import { useShowcaseMode } from '@/hooks/useShowcaseMode';
import { ShowcaseBanner } from '@/components/ShowcaseBanner';
import { saveQuizScore } from '@/lib/anonymousProgress';

let socket: Socket | null = null;

interface QuizCard {
  id: string;
  question: string;
  questionType?: 'multiple-choice' | 'true-false' | 'match' | 'fill-blank';
  answers?: string[];
  correctAnswerIndex?: number;
  matchPairs?: { left: string; right: string }[];
  rightItems?: Array<{ text: string; originalIndex: number }>;
  correctAnswer?: string;
  imageKey?: string;
  imageAltText?: string;
  imageCaption?: string;
}

interface GameState {
  gameId: string;
  currentCard: QuizCard | null;
  roundNumber: number;
  totalQuestions: number;
  player1Score: number;
  player1Name: string;
  gameStatus: 'waiting' | 'playing' | 'finished';
}

interface Term {
  id: string;
  term: string;
  definition: string;
}

interface ExplanationData {
  explanation: string;
  terms: Term[];
}

export default function QuizSinglePlayer() {
  const { collectionId } = useParams<{ collectionId: string }>();
  const [, setLocation] = useLocation();
  const { data: user } = useQuery<any>({ queryKey: ['/api/user-status'] });
  
  // Showcase mode detection for anonymous users
  const { isShowcaseMode } = useShowcaseMode();
  
  // Extract course context from URL params (filter out "null"/"undefined" strings)
  const searchParams = new URLSearchParams(window.location.search);
  const urlCourseIdRaw = searchParams.get('courseId');
  const urlLessonIdRaw = searchParams.get('lessonId');
  const urlCourseId = urlCourseIdRaw && urlCourseIdRaw !== 'null' && urlCourseIdRaw !== 'undefined' ? urlCourseIdRaw : null;
  const urlLessonId = urlLessonIdRaw && urlLessonIdRaw !== 'null' && urlLessonIdRaw !== 'undefined' ? urlLessonIdRaw : null;
  
  // Fetch quiz collection to display name (authenticated mode only)
  const { data: quizCollection } = useQuery<any>({ 
    queryKey: [`/api/quiz/collections/${collectionId}/details`],
    enabled: !!collectionId && !isShowcaseMode
  });

  // Fetch linked lesson info for navigation (authenticated mode only)
  const { data: linkedLesson } = useQuery<{ lessonId: string | null; courseId: string | null }>({
    queryKey: [`/api/quiz/collections/${collectionId}/linked-lesson`],
    enabled: !!collectionId && !isShowcaseMode
  });
  
  // Fetch quiz cards from public API for showcase mode
  const { data: showcaseData, isLoading: isLoadingShowcase, isError: isShowcaseError } = useQuery<{
    collection: { id: string; name: string; description?: string; passPercentage?: number };
    cards: Array<{
      id: string;
      question: string;
      questionType?: string;
      answer1?: string;
      answer2?: string;
      answer3?: string;
      answer4?: string;
      answer5?: string;
      answer6?: string;
      correctAnswerIndex?: number;
      matchPairs?: any;
      correctAnswer?: string;
      imageKey?: string;
      imageAltText?: string;
      imageCaption?: string;
      displayOrder?: number;
    }>;
  }>({
    queryKey: [`/api/public/quiz/${collectionId}/cards`],
    enabled: !!collectionId && isShowcaseMode,
    retry: false,
  });
  
  // State for showcase mode client-side quiz
  const [showcaseCards, setShowcaseCards] = useState<QuizCard[]>([]);
  const [showcaseCardIndex, setShowcaseCardIndex] = useState(0);
  
  // Effective course/lesson IDs: prefer URL params, fallback to linked lesson data
  const courseId = urlCourseId || linkedLesson?.courseId || null;
  const lessonId = urlLessonId || linkedLesson?.lessonId || null;
  
  const [gameState, setGameState] = useState<GameState>({
    gameId: '',
    currentCard: null,
    roundNumber: 0,
    totalQuestions: 0,
    player1Score: 0,
    player1Name: '',
    gameStatus: 'waiting'
  });

  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [matchAnswers, setMatchAnswers] = useState<number[]>([]);
  const [selectedLeftItem, setSelectedLeftItem] = useState<number | null>(null);
  const [shuffledRightItems, setShuffledRightItems] = useState<Array<{ text: string; originalIndex: number }>>([]);
  const [fillBlankAnswer, setFillBlankAnswer] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [roundResult, setRoundResult] = useState<any>(null);
  const [showExplanationPanel, setShowExplanationPanel] = useState(false);
  const [explanationViewedForCurrent, setExplanationViewedForCurrent] = useState(false);
  const [isAnswering, setIsAnswering] = useState(false);
  const [answerStartTime, setAnswerStartTime] = useState<number>(0);
  const [, setStreak] = useState(0);
  const [showCelebration, setShowCelebration] = useState(false);
  const [xpResult, setXpResult] = useState<any>(null);
  const [showGamefiedResultModal, setShowGamefiedResultModal] = useState(false);
  
  // Keyboard navigation state for match questions
  const [keyboardFocusedColumn, setKeyboardFocusedColumn] = useState<'left' | 'right' | null>(null);
  const [keyboardFocusedIndex, setKeyboardFocusedIndex] = useState<number>(0);

  const isCurrentAnswerCorrect = !!(roundResult?.player1Correct || roundResult?.roundResult === 'correct');
  const requiresExplanationBeforeNext = showResult && !isCurrentAnswerCorrect;
  const resultSelectedAnswerIndex = typeof roundResult?.player1Answer === 'number' ? roundResult.player1Answer : null;
  const resultCorrectAnswerIndex = typeof roundResult?.correctIndex === 'number' ? roundResult.correctIndex : null;

  const incrementStreak = () => {
    setStreak((prev) => {
      const next = prev + 1;
      if (next >= 3) {
        setShowCelebration(true);
        setTimeout(() => setShowCelebration(false), 2000);
      }
      return next;
    });
  };

  const explanationApiEndpoint = isShowcaseMode
    ? `/api/public/quiz/cards/${gameState.currentCard?.id}/explain`
    : `/api/quiz-cards/${gameState.currentCard?.id}/explanation`;

  const {
    data: explanationData,
    isLoading: isLoadingExplanation,
    isFetched: isExplanationFetched,
    error: explanationError,
  } = useQuery<ExplanationData>({
    queryKey: [explanationApiEndpoint],
    enabled: showResult && showExplanationPanel && !!gameState.currentCard?.id,
    retry: false,
    staleTime: 1000 * 60 * 5,
  });

  const canGoToNextQuestion =
    !requiresExplanationBeforeNext ||
    (explanationViewedForCurrent && !isLoadingExplanation && (isExplanationFetched || !!explanationError));

  // Fetch active power-ups (only for authenticated users)
  // Initialize showcase mode quiz when data is loaded
  useEffect(() => {
    if (!isShowcaseMode || !showcaseData?.cards?.length) return;
    
    // Convert public API card format to QuizCard format
    const cards: QuizCard[] = showcaseData.cards
      .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0))
      .map(card => {
        // Build answers array from answer1-answer6 fields
        const answers: string[] = [];
        if (card.answer1) answers.push(card.answer1);
        if (card.answer2) answers.push(card.answer2);
        if (card.answer3) answers.push(card.answer3);
        if (card.answer4) answers.push(card.answer4);
        if (card.answer5) answers.push(card.answer5);
        if (card.answer6) answers.push(card.answer6);
        
        return {
          id: card.id,
          question: card.question,
          questionType: card.questionType as QuizCard['questionType'],
          answers: answers.length > 0 ? answers : undefined,
          correctAnswerIndex: card.correctAnswerIndex,
          matchPairs: card.matchPairs,
          correctAnswer: card.correctAnswer,
          imageKey: card.imageKey,
          imageAltText: card.imageAltText,
          imageCaption: card.imageCaption,
        };
      });
    
    setShowcaseCards(cards);
    setShowcaseCardIndex(0);
    
    // Start the game immediately for showcase mode
    const firstCard = cards[0];
    if (firstCard) {
      // Prepare match pairs if needed
      let rightItems: Array<{ text: string; originalIndex: number }> | undefined;
      if (firstCard.questionType === 'match' && firstCard.matchPairs) {
        rightItems = shuffleRightItems(firstCard.matchPairs);
        setShuffledRightItems(rightItems);
        setMatchAnswers(new Array(firstCard.matchPairs.length).fill(-1));
      }
      
      setGameState({
        gameId: `showcase_${collectionId}`,
        currentCard: { ...firstCard, rightItems },
        roundNumber: 1,
        totalQuestions: cards.length,
        player1Score: 0,
        player1Name: 'Guest',
        gameStatus: 'playing'
      });
      setAnswerStartTime(Date.now());
    }
  }, [isShowcaseMode, showcaseData, collectionId]);

  // Fisher-Yates shuffle algorithm
  const shuffleRightItems = (pairs: { left: string; right: string }[]) => {
    const items = pairs.map((pair, index) => ({ text: pair.right, originalIndex: index }));
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  };

  // Keyboard navigation for match questions
  useEffect(() => {
    if (gameState.currentCard?.questionType !== 'match' || showResult || isAnswering) return;
    
    const handleKeyDown = (e: KeyboardEvent) => {
      const matchPairs = gameState.currentCard?.matchPairs || [];
      if (matchPairs.length === 0) return;
      
      // Initialize focus if not set
      if (keyboardFocusedColumn === null && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.key)) {
        setKeyboardFocusedColumn('left');
        setKeyboardFocusedIndex(0);
        e.preventDefault();
        return;
      }
      
      if (keyboardFocusedColumn === null) return;
      
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          setKeyboardFocusedIndex(prev => Math.max(0, prev - 1));
          break;
          
        case 'ArrowDown':
          e.preventDefault();
          const maxIndex = keyboardFocusedColumn === 'left' ? matchPairs.length - 1 : shuffledRightItems.length - 1;
          setKeyboardFocusedIndex(prev => Math.min(maxIndex, prev + 1));
          break;
          
        case 'ArrowLeft':
          e.preventDefault();
          if (keyboardFocusedColumn === 'right') {
            setKeyboardFocusedColumn('left');
            setKeyboardFocusedIndex(Math.min(keyboardFocusedIndex, matchPairs.length - 1));
          }
          break;
          
        case 'ArrowRight':
          e.preventDefault();
          if (keyboardFocusedColumn === 'left') {
            setKeyboardFocusedColumn('right');
            setKeyboardFocusedIndex(Math.min(keyboardFocusedIndex, shuffledRightItems.length - 1));
          }
          break;
          
        case 'Tab':
          e.preventDefault();
          if (e.shiftKey) {
            // Shift+Tab goes left
            if (keyboardFocusedColumn === 'right') {
              setKeyboardFocusedColumn('left');
              setKeyboardFocusedIndex(Math.min(keyboardFocusedIndex, matchPairs.length - 1));
            }
          } else {
            // Tab goes right
            if (keyboardFocusedColumn === 'left') {
              setKeyboardFocusedColumn('right');
              setKeyboardFocusedIndex(Math.min(keyboardFocusedIndex, shuffledRightItems.length - 1));
            }
          }
          break;
          
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (keyboardFocusedColumn === 'left') {
            handleLeftItemClick(keyboardFocusedIndex);
          } else if (keyboardFocusedColumn === 'right') {
            handleRightItemClick(keyboardFocusedIndex);
          }
          break;
          
        case 'Escape':
          e.preventDefault();
          setSelectedLeftItem(null);
          setKeyboardFocusedColumn(null);
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState.currentCard, keyboardFocusedColumn, keyboardFocusedIndex, shuffledRightItems, showResult, isAnswering, matchAnswers, selectedLeftItem]);

  // Socket connection effect - only for authenticated users (not showcase mode)
  useEffect(() => {
    if (!collectionId || isShowcaseMode) return;

    socket = io({
      path: '/socket.io',
      transports: ['polling', 'websocket'],
      withCredentials: true
    });

    socket.on('connect', () => {
      console.log('Connected to socket');
      const playerName = user?.guestName || user?.gamerName || 'Player';
      const playerId = user?.guestName ? `guest_${Date.now()}` : (user?.id || `anon_${Date.now()}`);

      socket?.emit('start-quiz-single-game', {
        collectionId,
        roundTime: 30,
        gameTime: 300
      });
    });

    socket.on('quiz-game-started', (data: any) => {
      setGameState({
        gameId: data.gameId,
        currentCard: data.currentCard,
        roundNumber: 1,
        totalQuestions: data.totalQuestions,
        player1Score: 0,
        player1Name: data.player1Name,
        gameStatus: 'playing'
      });
      setMatchAnswers(data.currentCard?.matchPairs ? new Array(data.currentCard.matchPairs.length).fill(-1) : []);
      if (data.currentCard?.rightItems) {
        setShuffledRightItems(data.currentCard.rightItems);
      }
      setAnswerStartTime(Date.now());
    });

    socket.on('quiz-round-result', (data: any) => {
      console.log('Round result:', data);
      setRoundResult(data);
      setShowResult(true);
      setShowExplanationPanel(!(data.player1Correct || data.roundResult === 'correct'));
      setExplanationViewedForCurrent(!(data.player1Correct || data.roundResult === 'correct'));
      
      // Update streak for correct answers
      if (data.player1Correct || data.roundResult === 'correct') {
        incrementStreak();
      } else {
        setStreak(0);
      }
      
      setGameState(prev => ({
        ...prev,
        player1Score: data.player1Score,
        roundNumber: data.roundNumber
      }));
    });

    socket.on('quiz-next-card', (data: any) => {
      console.log('📝 Next card received:', data.currentCard?.question);
      console.log('🔄 Resetting all states for new question');
      setGameState(prev => ({
        ...prev,
        currentCard: data.currentCard,
        roundNumber: data.roundNumber
      }));
      setSelectedAnswer(null);
      setMatchAnswers(data.currentCard?.matchPairs ? new Array(data.currentCard.matchPairs.length).fill(-1) : []);
      setSelectedLeftItem(null);
      setKeyboardFocusedColumn(null);
      setKeyboardFocusedIndex(0);
      if (data.currentCard?.rightItems) {
        setShuffledRightItems(data.currentCard.rightItems);
      }
      setFillBlankAnswer('');
      setShowResult(false);
      setRoundResult(null);
      setShowExplanationPanel(false);
      setExplanationViewedForCurrent(false);
      setIsAnswering(false);
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
        player1Score: data.player1Score
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
      
      // Invalidate course queries so CourseDetail page refreshes with updated progress/completion
      queryClient.invalidateQueries({ queryKey: ['/api/courses'], exact: false });
      queryClient.invalidateQueries({ queryKey: ['/api/my-courses'], exact: false });
      // Invalidate specific course and certificate status if we have the courseId
      if (courseId) {
        queryClient.invalidateQueries({ queryKey: [`/api/courses/${courseId}`] });
        // Also invalidate certificate status so button appears when course is complete
        queryClient.invalidateQueries({ queryKey: [`/api/courses/${courseId}/certificate-status`] });
      }
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

    return () => {
      socket?.disconnect();
      socket = null;
    };
  }, [collectionId, user]);

  const handleAnswerSelect = (answerIndex: number) => {
    // Prevent multiple submissions - check and set immediately to avoid race conditions
    if (isAnswering || showResult || !gameState.currentCard) return;
    
    // Set isAnswering FIRST to block subsequent clicks immediately
    setIsAnswering(true);
    setSelectedAnswer(answerIndex);
    const answerTime = Date.now() - answerStartTime;
    
    // Handle showcase mode locally
    if (isShowcaseMode) {
      // DB stores 1-based correctAnswerIndex, answerIndex is 0-based from UI click
      const normalizedCorrectIndex = (gameState.currentCard.correctAnswerIndex ?? 1) - 1;
      const isCorrect = answerIndex === normalizedCorrectIndex;
      const newScore = isCorrect ? gameState.player1Score + 1 : gameState.player1Score;
      
      // Compute correct answer text for display (correctAnswer field may be null for MCQ)
      const correctAnswerText = gameState.currentCard.correctAnswer || 
        (gameState.currentCard.answers && gameState.currentCard.answers[normalizedCorrectIndex]) || '';
      
      // Update streak
      if (isCorrect) {
        incrementStreak();
      } else {
        setStreak(0);
      }
      
      setRoundResult({
        player1Correct: isCorrect,
        roundResult: isCorrect ? 'correct' : 'incorrect',
        player1Score: newScore,
        correctAnswerIndex: normalizedCorrectIndex,
        correctIndex: normalizedCorrectIndex,
        correctAnswer: correctAnswerText,
        player1Answer: answerIndex,
      });
      setShowResult(true);
      setShowExplanationPanel(!isCorrect);
      setExplanationViewedForCurrent(!isCorrect);
      setGameState(prev => ({ ...prev, player1Score: newScore }));
      return;
    }
    
    socket?.emit('quiz-answer-submitted', {
      gameId: gameState.gameId,
      answerIndex,
      answerTime
    });
  };

  const handleMatchSubmit = () => {
    // Prevent multiple submissions
    if (isAnswering || showResult || !gameState.currentCard) return;
    if (matchAnswers.some(a => a === -1)) return; // Not all pairs matched
    
    // Set isAnswering FIRST to block multiple submissions
    setIsAnswering(true);
    
    // Map shuffled indices back to original indices for server validation
    const originalIndices = matchAnswers.map(shuffledIdx => 
      shuffledIdx >= 0 ? shuffledRightItems[shuffledIdx]?.originalIndex ?? -1 : -1
    );
    
    // Handle showcase mode locally
    if (isShowcaseMode) {
      // For match questions, check if each left index matches its original index
      const isCorrect = originalIndices.every((origIdx, leftIdx) => origIdx === leftIdx);
      const newScore = isCorrect ? gameState.player1Score + 1 : gameState.player1Score;
      
      if (isCorrect) {
        incrementStreak();
      } else {
        setStreak(0);
      }
      
      setRoundResult({
        player1Correct: isCorrect,
        roundResult: isCorrect ? 'correct' : 'incorrect',
        player1Score: newScore,
      });
      setShowResult(true);
      setShowExplanationPanel(!isCorrect);
      setExplanationViewedForCurrent(!isCorrect);
      setGameState(prev => ({ ...prev, player1Score: newScore }));
      return;
    }
    
    const answerTime = Date.now() - answerStartTime;
    socket?.emit('quiz-answer-submitted', {
      gameId: gameState.gameId,
      matchAnswers: originalIndices,
      answerTime
    });
  };

  const handleLeftItemClick = (leftIndex: number) => {
    if (showResult || isAnswering) return;
    
    const isConnected = matchAnswers[leftIndex] !== -1;
    
    // If this item is already connected, disconnect it
    if (isConnected) {
      const updated = [...matchAnswers];
      updated[leftIndex] = -1;
      setMatchAnswers(updated);
      setSelectedLeftItem(null);
      return;
    }
    
    // If clicking already selected left item, deselect it
    if (selectedLeftItem === leftIndex) {
      setSelectedLeftItem(null);
    } else {
      setSelectedLeftItem(leftIndex);
    }
  };

  const handleRightItemClick = (shuffledIndex: number) => {
    if (showResult || isAnswering) return;
    
    // Find if this right item is already connected
    const connectedLeftIndex = matchAnswers.findIndex(val => val === shuffledIndex);
    
    // If clicking a connected right item, disconnect it
    if (connectedLeftIndex !== -1) {
      const updated = [...matchAnswers];
      updated[connectedLeftIndex] = -1;
      setMatchAnswers(updated);
      setSelectedLeftItem(null);
      return;
    }
    
    // Must have a left item selected to make a new connection
    if (selectedLeftItem === null) return;
    
    const updated = [...matchAnswers];
    // Make the new connection
    updated[selectedLeftItem] = shuffledIndex;
    setMatchAnswers(updated);
    setSelectedLeftItem(null); // Deselect after connection
  };

  const handleFillBlankSubmit = () => {
    // Prevent multiple submissions
    if (isAnswering || showResult || !gameState.currentCard) return;
    if (!fillBlankAnswer.trim()) return;
    
    // Set isAnswering FIRST to block multiple submissions
    setIsAnswering(true);
    
    // Handle showcase mode locally
    if (isShowcaseMode) {
      const correctAnswer = gameState.currentCard.correctAnswer || '';
      const isCorrect = fillBlankAnswer.trim().toLowerCase() === correctAnswer.toLowerCase();
      const newScore = isCorrect ? gameState.player1Score + 1 : gameState.player1Score;
      
      if (isCorrect) {
        incrementStreak();
      } else {
        setStreak(0);
      }
      
      setRoundResult({
        player1Correct: isCorrect,
        roundResult: isCorrect ? 'correct' : 'incorrect',
        player1Score: newScore,
        correctAnswer: correctAnswer,
      });
      setShowResult(true);
      setShowExplanationPanel(!isCorrect);
      setExplanationViewedForCurrent(!isCorrect);
      setGameState(prev => ({ ...prev, player1Score: newScore }));
      return;
    }
    
    const answerTime = Date.now() - answerStartTime;
    socket?.emit('quiz-answer-submitted', {
      gameId: gameState.gameId,
      fillBlankAnswer: fillBlankAnswer.trim(),
      answerTime
    });
  };

  const handleNextQuestion = () => {
    // Handle showcase mode locally
    if (isShowcaseMode) {
      const nextIndex = showcaseCardIndex + 1;
      
      // Check if quiz is complete
      if (nextIndex >= showcaseCards.length) {
        // Quiz finished - save score locally and show result
        const percentage = Math.round((gameState.player1Score / gameState.totalQuestions) * 100);
        saveQuizScore({
          quizId: collectionId || '',
          score: gameState.player1Score,
          totalQuestions: gameState.totalQuestions,
          percentage,
          completedAt: new Date().toISOString(),
          lessonId: lessonId || undefined,
        });
        
        setGameState(prev => ({ ...prev, gameStatus: 'finished' }));
        setShowGamefiedResultModal(true);
        return;
      }
      
      // Move to next question
      const nextCard = showcaseCards[nextIndex];
      setShowcaseCardIndex(nextIndex);
      
      // Prepare match pairs if needed
      let rightItems: Array<{ text: string; originalIndex: number }> | undefined;
      if (nextCard.questionType === 'match' && nextCard.matchPairs) {
        rightItems = shuffleRightItems(nextCard.matchPairs);
        setShuffledRightItems(rightItems);
        setMatchAnswers(new Array(nextCard.matchPairs.length).fill(-1));
      } else {
        setMatchAnswers([]);
      }
      
      setGameState(prev => ({
        ...prev,
        currentCard: { ...nextCard, rightItems },
        roundNumber: nextIndex + 1
      }));
      setSelectedAnswer(null);
      setSelectedLeftItem(null);
      setKeyboardFocusedColumn(null);
      setKeyboardFocusedIndex(0);
      setFillBlankAnswer('');
      setShowResult(false);
      setRoundResult(null);
      setShowExplanationPanel(false);
      setExplanationViewedForCurrent(false);
      setIsAnswering(false);
      setAnswerStartTime(Date.now());
      return;
    }
    
    socket?.emit('quiz-next-card', {
      gameId: gameState.gameId
    });
  };

  const navigateBack = () => {
    if (isShowcaseMode) {
      // For showcase mode, navigate to public courses or login
      if (courseId) {
        setLocation(`/public/courses/${courseId}`);
      } else {
        setLocation('/browse');
      }
      return;
    }
    
    if (linkedLesson?.lessonId && linkedLesson?.courseId && typeof linkedLesson.lessonId === 'string') {
      setLocation(`/lessons/${linkedLesson.lessonId}?courseId=${linkedLesson.courseId}`);
    } else {
      setLocation('/my-courses');
    }
  };

  const handleBackToLobby = () => {
    // For showcase mode, no socket cleanup needed
    if (isShowcaseMode) {
      navigateBack();
      return;
    }
    
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

  // Showcase mode error state - quiz not available for public access
  if (isShowcaseMode && isShowcaseError) {
    return (
      <div className="min-h-screen bg-[var(--quiz-lobby-bg)] flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardContent className="flex flex-col items-center justify-center py-12 px-6">
            <XCircle className="h-16 w-16 text-destructive mb-4" />
            <h3 className="text-lg font-semibold mb-2 text-center">Quiz not available</h3>
            <p className="text-muted-foreground mb-6 text-sm text-center">
              This quiz is not available for preview. Please register or login to access more content.
            </p>
            <div className="flex gap-3">
              <Button onClick={() => setLocation(`/register?returnTo=${encodeURIComponent(window.location.pathname)}`)}
                className="min-h-[44px] touch-manipulation bg-primary hover:bg-primary/90"
              >
                Register
              </Button>
              <Button variant="outline" onClick={() => setLocation(`/login?returnTo=${encodeURIComponent(window.location.pathname)}`)}
                className="min-h-[44px] touch-manipulation"
              >
                Login
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Showcase mode loading state
  if (isShowcaseMode && isLoadingShowcase) {
    return (
      <div className="min-h-screen bg-[var(--quiz-lobby-bg)] flex items-center justify-center p-4">
        <div className="text-center">
          <div className="relative mb-8">
            <div className="absolute inset-0 animate-ping">
              <Brain className="w-20 h-20 text-primary mx-auto opacity-30" />
            </div>
            <Brain className="w-20 h-20 text-primary mx-auto relative" />
          </div>
          <h3 className="text-3xl font-bold text-foreground mb-2 animate-pulse">
            Loading Quiz
          </h3>
          <p className="text-primary">
            Preparing showcase quiz...
          </p>
        </div>
      </div>
    );
  }

  if (gameState.gameStatus === 'waiting') {
    return (
      <div className="min-h-screen bg-[var(--quiz-lobby-bg)] flex items-center justify-center p-4">
        <div className="text-center">
          <div className="relative mb-8">
            <div className="absolute inset-0 animate-ping">
              <Brain className="w-20 h-20 text-primary mx-auto opacity-30" />
            </div>
            <Brain className="w-20 h-20 text-primary mx-auto relative" />
          </div>
          <h3 className="text-3xl font-bold text-foreground mb-2 animate-pulse">
            Preparing Your Quiz
          </h3>
          <p className="text-primary">
            Loading questions...
          </p>
        </div>
      </div>
    );
  }

  // If game is finished, show the gamified result modal
  if (gameState.gameStatus === 'finished') {
    return (
      <div className="min-h-screen">
        <GamefiedQuizResultModal
          open={showGamefiedResultModal}
          onClose={handleBackToLobby}
          playerScore={gameState.player1Score}
          aiScore={null}
          totalQuestions={gameState.totalQuestions}
          quizId={collectionId}
          courseId={courseId || undefined}
          lessonId={lessonId || undefined}
          xpResult={isShowcaseMode ? null : xpResult}
          onPlayAgain={() => {
            window.location.reload();
          }}
          user={user}
          onNavigate={(path: string) => setLocation(path)}
          isShowcaseMode={isShowcaseMode}
          variant="inline"
        />
      </div>
    );
  }

  const progressPercent = (gameState.roundNumber / gameState.totalQuestions) * 100;
  
  // Quiz name from appropriate source
  const quizName = isShowcaseMode 
    ? (showcaseData?.collection?.name || 'Showcase Quiz')
    : (quizCollection?.name || 'Quiz Battle');

  return (
    <div className="h-screen overflow-hidden bg-[var(--quiz-lobby-bg)] flex flex-col">
      {/* Power-ups overlay - only for authenticated users */}
      {!isShowcaseMode && <ActivePowerUpsOverlay />}
      
      {/* Showcase Banner for anonymous users */}
      {isShowcaseMode && (
        <div className="flex-none px-3 pt-2 md:px-6 md:pt-3">
          <ShowcaseBanner currentPath={window.location.pathname + window.location.search} />
        </div>
      )}
      
      {/* Compact Header - Fixed */}
      <div className="flex-none px-3 py-2 md:px-6 md:py-4 flex items-center justify-between border-b border-primary/20">
        <div className="flex items-center gap-2 md:gap-3">
          <Brain className="w-6 h-6 md:w-8 md:h-8 text-primary" />
          <div className="flex flex-col max-w-[300px] md:max-w-[500px]">
            <h1 className="text-lg md:text-2xl font-bold text-foreground truncate" title={quizName} data-testid="text-quiz-name">
              {quizName}
            </h1>
            <p className="text-xs md:text-sm text-primary">
              Q {gameState.roundNumber}/{gameState.totalQuestions}
            </p>
          </div>
        </div>
        
        {/* Score Display */}
        <div className="flex items-center gap-2 md:gap-4">
          <div className="text-center px-3 py-1.5 rounded-lg" style={{ backgroundColor: 'var(--score-badge-bg)', color: 'var(--score-badge-fg)' }}>
            <div className="text-xs font-medium text-muted-foreground">Score</div>
            <div className="text-2xl md:text-3xl font-bold" data-testid="text-current-player-score">
              {gameState.player1Score}
            </div>
          </div>
          <div className="text-center px-3 py-1.5 rounded-lg bg-[var(--game-primary)] text-primary-foreground" style={{ boxShadow: '0 0 15px var(--game-glow)' }}>
            <div className="text-xs font-medium text-muted-foreground">Total</div>
            <div className="text-2xl md:text-3xl font-bold" data-testid="text-total-questions">
              {gameState.totalQuestions}
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleBackToLobby} className="ml-2" data-testid="button-quit" >
            <Home className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Progress Bar - Fixed */}
      <div className="flex-none px-3 pb-2 md:px-6 md:pb-3">
        <div className="rounded-full h-2 overflow-hidden border border-[var(--stroke-default)]" style={{ backgroundColor: 'var(--progress-bar-bg)' }}>
          <div 
            className="h-full rounded-full transition-all duration-500 ease-out"
            style={{ 
              width: `${progressPercent}%`, 
              background: 'linear-gradient(to right, var(--gradient-primary-from), var(--gradient-primary-to))',
              boxShadow: '0 0 8px var(--game-glow)'
            }}
          />
        </div>
      </div>

      {/* Celebration Overlay */}
      {showCelebration && (
        <div className="fixed inset-0 flex items-center justify-center pointer-events-none z-50">
          <div className="text-6xl md:text-8xl font-bold animate-bounce" style={{ 
            background: 'linear-gradient(to right, var(--celebration-from), var(--celebration-to))',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            filter: 'drop-shadow(0 0 20px var(--celebration-glow))'
          }}>
            🔥 STREAK! 🔥
          </div>
        </div>
      )}

      {/* Question and Answers - Scrollable Content Area */}
      {gameState.currentCard && (
        <div className="flex-1 overflow-y-auto px-3 md:px-6 pb-4">
          <div className="max-w-4xl mx-auto">
            {showResult && (
              <div className="mb-4 md:mb-6 grid grid-cols-1 lg:grid-cols-3 gap-3">
                <Card className={`lg:col-span-2 border-2 ${isCurrentAnswerCorrect ? 'border-[var(--success)]/60 bg-success/8' : 'border-[var(--destructive)]/60 bg-destructive/8'}`}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isCurrentAnswerCorrect ? 'bg-success/20' : 'bg-destructive/20'}`}>
                        {isCurrentAnswerCorrect ? (
                          <Check className="w-5 h-5 text-success" />
                        ) : (
                          <X className="w-5 h-5 text-destructive" />
                        )}
                      </div>
                      <div className="text-lg font-semibold">
                        {isCurrentAnswerCorrect ? 'Correct answer' : 'Incorrect answer'}
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {isCurrentAnswerCorrect
                        ? 'Great work. You can continue to the next question.'
                        : 'Review the explanation to continue to the next question.'}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-primary/30">
                  <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground mb-1">Current Score</p>
                    <p className="text-3xl font-bold text-primary">{gameState.player1Score}</p>
                    <p className="text-xs text-muted-foreground mt-1">Question {gameState.roundNumber} of {gameState.totalQuestions}</p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Question */}
            <div className="mb-4 md:mb-6">
              <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-primary/15 rounded-full border border-primary/30 mb-3">
                <Zap className="w-3 h-3 md:w-4 md:h-4 text-glow-gold" />
                <span className="text-primary text-xs md:text-sm font-medium">Quick Answer Bonus!</span>
              </div>
              <h2 className="text-xl md:text-3xl font-bold text-foreground leading-tight" data-testid="text-question">
                {gameState.currentCard.question}
              </h2>
            </div>

            {gameState.currentCard.imageKey && (
              <figure className="mb-4 md:mb-6 rounded-xl border border-border bg-muted/30 overflow-hidden">
                <img
                  src={`/api/quiz-cards/${gameState.currentCard.id}/image`}
                  alt={gameState.currentCard.imageAltText || gameState.currentCard.imageCaption || 'Question visual'}
                  className="w-full max-h-[340px] object-contain bg-background"
                  loading="lazy"
                />
                {gameState.currentCard.imageCaption && (
                  <figcaption className="px-3 py-2 text-xs text-muted-foreground">
                    {gameState.currentCard.imageCaption}
                  </figcaption>
                )}
              </figure>
            )}

            {showResult && (
              <div className="mb-4 flex flex-col sm:flex-row sm:justify-center gap-2">
                <Button variant="outline" onClick={() => {
                    setShowExplanationPanel(prev => !prev);
                    setExplanationViewedForCurrent(true);
                  }}
                  className="min-h-[44px] sm:min-w-[180px]"
                  data-testid="button-toggle-explanation-inline"
                >
                  {showExplanationPanel ? 'Hide Explanation' : 'Explain Answer'}
                </Button>
                <Button onClick={handleNextQuestion} disabled={!canGoToNextQuestion} className="min-h-[44px] sm:min-w-[180px]" data-testid="button-next-inline" >
                  Next Question
                </Button>
              </div>
            )}

            {/* Answers - Render based on question type */}
            {(!gameState.currentCard.questionType || gameState.currentCard.questionType === 'multiple-choice' || gameState.currentCard.questionType === 'true-false') && (
              <div className="grid gap-2 md:gap-3">
                {(gameState.currentCard.answers || []).map((answer, index) => {
                  const isSelected = showResult ? resultSelectedAnswerIndex === index : selectedAnswer === index;
                  const isCorrect = showResult && resultCorrectAnswerIndex === index;
                  const showCorrect = showResult && isCorrect;
                  const showWrong = showResult && isSelected && !isCorrect;

                  return (
                    <button
                      key={index}
                      onClick={() => handleAnswerSelect(index)}
                      disabled={isAnswering || showResult}
                      className="group relative p-3 md:p-5 rounded-xl text-left transition-all duration-300 transform active:scale-95 md:hover:scale-[1.02] disabled:cursor-not-allowed border-2"
                      style={{
                        backgroundColor: showCorrect 
                          ? 'var(--answer-option-correct-bg)' 
                          : showWrong 
                          ? 'var(--answer-option-incorrect-bg)' 
                          : isSelected 
                          ? 'var(--answer-option-selected-bg)' 
                          : 'var(--answer-option-bg)',
                        borderColor: showCorrect 
                          ? 'var(--answer-option-correct-border)' 
                          : showWrong 
                          ? 'var(--answer-option-incorrect-border)' 
                          : isSelected 
                          ? 'var(--answer-option-selected-border)' 
                          : 'var(--answer-option-border)',
                        boxShadow: showCorrect 
                          ? '0 0 15px var(--game-success)' 
                          : showWrong 
                          ? '0 0 15px var(--destructive)' 
                          : isSelected 
                          ? '0 0 10px var(--game-glow)' 
                          : 'none',
                        transform: showCorrect ? 'scale(1.02)' : undefined,
                        color: showCorrect 
                          ? 'var(--answer-option-correct-fg)' 
                          : showWrong 
                          ? 'var(--answer-option-incorrect-fg)' 
                          : isSelected 
                          ? 'var(--answer-option-selected-fg)' 
                          : 'var(--answer-option-fg)'
                      }}
                      data-testid={`button-answer-${index}`}
                    >
                      <div className="flex items-center gap-2 md:gap-4">
                        <div 
                          className="flex-shrink-0 w-8 h-8 md:w-10 md:h-10 rounded-full flex items-center justify-center font-bold text-sm md:text-lg transition-all"
                          style={{
                            backgroundColor: showCorrect 
                              ? 'var(--game-success)' 
                              : showWrong 
                              ? 'var(--destructive)'
                              : isSelected 
                              ? 'var(--action-primary)'
                              : 'var(--surface-muted)',
                            color: showCorrect || showWrong || isSelected 
                              ? 'white' 
                              : 'var(--text-muted)'
                          }}
                        >
                          {showCorrect ? '✓' : showWrong ? '✗' : String.fromCharCode(65 + index)}
                        </div>
                        <span className="flex-1 text-sm md:text-lg font-medium">
                          {answer}
                        </span>
                        {showCorrect && (
                          <div className="flex items-center gap-1 md:gap-2">
                            <Check className="w-5 h-5 md:w-6 md:h-6 animate-bounce" style={{ color: 'var(--game-success)' }} />
                            <span className="hidden md:inline text-sm font-semibold" style={{ color: 'var(--game-success)' }}>Correct!</span>
                          </div>
                        )}
                        {showWrong && <X className="w-5 h-5 md:w-6 md:h-6" style={{ color: 'var(--destructive)' }} />}
                        {showResult && isSelected && (
                          <Badge variant="outline" className="text-xs">Your answer</Badge>
                        )}
                      </div>
                      
                      {!showResult && !isSelected && (
                        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl" style={{ background: 'linear-gradient(to right, transparent, var(--answer-option-hover), transparent)' }} />
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Match pairs question - Tap to Connect UI */}
            {gameState.currentCard.questionType === 'match' && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 p-3 bg-secondary/10 border border-secondary/30 rounded-lg">
                    <Target className="w-5 h-5 text-secondary flex-shrink-0" />
                    <p className="text-secondary/80 text-sm">
                      Tap a question, then tap the matching answer to connect. Tap any connected item to disconnect.
                    </p>
                  </div>
                  <div className="hidden md:flex items-center gap-2 p-2 bg-primary/10 border border-primary/30 rounded text-xs text-primary/70">
                    <span className="font-semibold">⌨️ Keyboard:</span>
                    <span>Arrow keys to navigate</span>
                    <span>•</span>
                    <span>Enter/Space to select</span>
                    <span>•</span>
                    <span>Tab to switch columns</span>
                    <span>•</span>
                    <span>Esc to cancel</span>
                  </div>
                </div>

                {/* Two-column layout for match pairs */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Left column */}
                  <div className="space-y-2">
                    <h3 className="text-primary/70 text-sm font-semibold mb-2">Questions</h3>
                    {(gameState.currentCard.matchPairs || []).map((pair, leftIndex) => {
                      const connectedShuffledIndex = matchAnswers[leftIndex];
                      const isSelected = selectedLeftItem === leftIndex;
                      const isConnected = connectedShuffledIndex !== -1;
                      const connectionNumber = isConnected ? leftIndex + 1 : null;
                      
                      // Check correctness if showing results
                      const selectedOriginalIndex = connectedShuffledIndex >= 0 ? shuffledRightItems[connectedShuffledIndex]?.originalIndex : -1;
                      const isCorrect = showResult && selectedOriginalIndex === leftIndex;
                      const isWrong = showResult && connectedShuffledIndex !== -1 && selectedOriginalIndex !== leftIndex;
                      const hasKeyboardFocus = keyboardFocusedColumn === 'left' && keyboardFocusedIndex === leftIndex;

                      return (
                        <button
                          key={leftIndex}
                          onClick={() => handleLeftItemClick(leftIndex)}
                          disabled={showResult || isAnswering}
                          className={`w-full p-3 sm:p-4 rounded-xl text-left transition-all duration-200 disabled:cursor-default min-h-[60px] ${
                            showResult
                              ? isCorrect
                                ? 'bg-primary/20 border-2 border-primary'
                                : isWrong
                                ? 'bg-destructive/20 border-2 border-[var(--destructive)]/80'
                                : 'bg-[var(--surface-muted)]/50 border-2 border-[var(--stroke-default)]/50'
                              : isSelected
                              ? 'bg-game-surface-highlight border-2 border-primary ring-2 ring-state-halo-active scale-[1.02]'
                              : isConnected
                              ? 'bg-game-surface-success border-2 border-[var(--success)] ring-2 ring-state-halo-paired'
                              : 'bg-card border-2 border-[var(--stroke-default)]/50 active:scale-95 hover:bg-game-surface-highlight hover:border-primary/50'
                          } ${hasKeyboardFocus ? 'ring-2 ring-accent ring-offset-2 ring-offset-[var(--surface-primary)]' : ''}`}
                          data-testid={`button-left-${leftIndex}`}
                          aria-pressed={isSelected}
                          aria-label={`Question ${leftIndex + 1}: ${pair.left}`}
                        >
                          <div className="flex items-center gap-2 sm:gap-3">
                            <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                              showResult
                                ? isCorrect
                                  ? 'bg-primary text-primary-foreground'
                                  : isWrong
                                  ? 'bg-destructive text-destructive-foreground'
                                  : 'bg-[var(--surface-muted)] text-muted-foreground'
                                : isSelected
                                ? 'bg-secondary text-secondary-foreground ring-2 ring-secondary/30'
                                : isConnected
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-[var(--surface-muted)] text-muted-foreground'
                            }`}>
                              {connectionNumber || leftIndex + 1}
                            </div>
                            <span className={`flex-1 text-sm sm:text-base font-medium break-words ${
                              isSelected ? 'text-secondary' : isConnected ? 'text-primary' : 'text-[var(--text-primary)]/90'
                            }`}>
                              {pair.left}
                            </span>
                            {showResult && (
                              <>
                                {isCorrect && <Check className="w-5 h-5 text-primary flex-shrink-0" />}
                                {isWrong && <X className="w-5 h-5 text-destructive flex-shrink-0" />}
                              </>
                            )}
                          </div>
                          {showResult && !isCorrect && (
                            <div className="mt-2 text-xs sm:text-sm text-primary/70 ml-8 sm:ml-11 break-words">
                              Correct: {shuffledRightItems.find(item => item.originalIndex === leftIndex)?.text || ''}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Right column */}
                  <div className="space-y-2">
                    <h3 className="text-primary/70 text-sm font-semibold mb-2">Answers</h3>
                    {shuffledRightItems.map((item, shuffledIndex) => {
                      // Find which left item (if any) is connected to this right item
                      const connectedLeftIndex = matchAnswers.findIndex(val => val === shuffledIndex);
                      const isConnected = connectedLeftIndex !== -1;
                      const connectionNumber = isConnected ? connectedLeftIndex + 1 : null;
                      const canSelect = selectedLeftItem !== null && !showResult && !isAnswering;
                      const hasKeyboardFocus = keyboardFocusedColumn === 'right' && keyboardFocusedIndex === shuffledIndex;

                      return (
                        <button
                          key={shuffledIndex}
                          onClick={() => handleRightItemClick(shuffledIndex)}
                          disabled={showResult || isAnswering}
                          className={`w-full p-3 sm:p-4 rounded-xl text-left transition-all duration-200 min-h-[60px] ${
                            showResult
                              ? 'bg-[var(--surface-muted)]/30 border-2 border-[var(--stroke-default)]/50 cursor-default'
                              : isConnected
                              ? 'bg-game-surface-success border-2 border-[var(--success)] ring-2 ring-state-halo-paired hover:border-[var(--success)] active:scale-95 cursor-pointer'
                              : canSelect
                              ? 'bg-card border-2 border-[var(--stroke-default)]/50 hover:border-primary hover:bg-game-surface-highlight hover:ring-2 hover:ring-state-halo-active active:scale-95'
                              : 'bg-muted/40 border-2 border-[var(--stroke-default)]/30 text-muted-foreground'
                          } ${hasKeyboardFocus ? 'ring-2 ring-accent ring-offset-2 ring-offset-[var(--surface-primary)]' : ''}`}
                          data-testid={`button-right-${shuffledIndex}`}
                          aria-label={`Answer: ${item.text}${isConnected ? `. Tap to disconnect from question ${connectionNumber}` : canSelect ? '. Tap to connect' : ''}`}
                        >
                          <div className="flex items-center gap-2 sm:gap-3">
                            <div className={`w-6 h-6 sm:w-8 sm:h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                              isConnected
                                ? 'bg-primary text-primary-foreground'
                                : canSelect
                                ? 'bg-[var(--surface-muted)] text-muted-foreground group-hover:bg-secondary group-hover:text-secondary-foreground'
                                : 'bg-[var(--surface-muted)]/70 text-[var(--text-muted)]/50'
                            }`}>
                              {connectionNumber || '?'}
                            </div>
                            <span className={`flex-1 text-sm sm:text-base font-medium break-words ${
                              isConnected ? 'text-primary' : canSelect ? 'text-[var(--text-primary)]/90' : 'text-muted-foreground'
                            }`}>
                              {item.text}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {!showResult && (
                  <Button onClick={handleMatchSubmit} disabled={isAnswering || matchAnswers.some(a => a === -1)}
                    className="w-full h-12 sm:h-14 text-base sm:text-lg bg-hero-cta-primary disabled:text-[var(--input-disabled-fg)] disabled:cursor-not-allowed"
                    data-testid="button-submit-match"
                  >
                    {matchAnswers.some(a => a === -1) 
                      ? `Connect all pairs (${matchAnswers.filter(a => a !== -1).length}/${matchAnswers.length})`
                      : 'Submit Answers'
                    }
                  </Button>
                )}
              </div>
            )}

            {/* Fill in the blank question */}
            {gameState.currentCard.questionType === 'fill-blank' && (
              <div className="space-y-4">
                <div className={`p-4 rounded-xl border-2 ${
                  showResult 
                    ? roundResult?.player1Correct || roundResult?.roundResult === 'correct'
                      ? 'bg-primary/20 border-primary'
                      : 'bg-destructive/20 border-[var(--destructive)]/80'
                    : 'bg-[var(--surface-muted)]/50 border-[var(--stroke-default)]/50'
                }`}>
                  <Input
                    type="text"
                    value={fillBlankAnswer}
                    onChange={(e) => setFillBlankAnswer(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && fillBlankAnswer.trim()) {
                        handleFillBlankSubmit();
                      }
                    }}
                    disabled={showResult || isAnswering}
                    placeholder="Type your answer here..."
                    className="bg-[var(--surface-raised)] border-[var(--stroke-default)] text-foreground text-lg"
                    data-testid="input-fill-blank"
                  />
                  {showResult && (
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center gap-2">
                        {roundResult?.player1Correct || roundResult?.roundResult === 'correct' ? (
                          <>
                            <Check className="w-5 h-5 text-primary" />
                            <span className="text-primary/70 font-medium">Correct!</span>
                          </>
                        ) : (
                          <>
                            <X className="w-5 h-5 text-destructive" />
                            <span className="text-destructive/80 font-medium">Incorrect</span>
                          </>
                        )}
                      </div>
                      <div className="text-primary/70 text-sm">
                        Correct answer: <span className="text-foreground font-medium">{roundResult?.correctAnswer || gameState.currentCard.correctAnswer}</span>
                      </div>
                    </div>
                  )}
                </div>
                {!showResult && (
                  <Button onClick={handleFillBlankSubmit} disabled={isAnswering || !fillBlankAnswer.trim()} className="w-full" data-testid="button-submit-fill-blank" >
                    Submit Answer
                  </Button>
                )}
              </div>
            )}

            {showResult && (
              <div className="mt-4 md:mt-6 space-y-3">
                {!canGoToNextQuestion && (
                  <div className="text-sm text-destructive" data-testid="text-next-requirement">
                    Wait for explanation to finish loading before continuing.
                  </div>
                )}

                {showExplanationPanel && (
                  <Card className="border-primary/30">
                    <CardContent className="p-4 space-y-4">
                      <h3 className="text-lg font-semibold text-primary">Explanation</h3>

                      {isLoadingExplanation && (
                        <p className="text-sm text-muted-foreground">Loading explanation...</p>
                      )}

                      {!isLoadingExplanation && explanationError && (
                        <p className="text-sm text-muted-foreground">
                          Explanation is unavailable right now. You can still continue.
                        </p>
                      )}

                      {!isLoadingExplanation && !explanationError && explanationData?.explanation && (
                        <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">
                          {explanationData.explanation}
                        </p>
                      )}

                      {!isLoadingExplanation && !explanationError && !!explanationData?.terms?.length && (
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-primary">Key Terms</p>
                          <div className="grid gap-2">
                            {explanationData.terms.map((term) => (
                              <div key={term.id} className="rounded-md border border-primary/20 p-3">
                                <p className="text-sm font-semibold">{term.term}</p>
                                <p className="text-sm text-muted-foreground">{term.definition}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
