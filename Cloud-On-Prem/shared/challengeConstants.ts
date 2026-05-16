export const CHALLENGE_GOAL_TYPES = {
  QUIZ_WINS: 'quiz_wins',
  QUIZ_PASSES: 'quiz_passes',
  QUIZ_COMPLETIONS: 'quiz_completions',
  PERFECT_SCORES: 'perfect_scores',
  CORRECT_ANSWERS: 'correct_answers',
  XP_EARNED: 'xp_earned',
  DAILY_LOGINS: 'daily_logins',
  LESSON_COMPLETIONS: 'lesson_completions',
  BATTLE_WINS: 'battle_wins',
} as const;

export type ChallengeGoalType = typeof CHALLENGE_GOAL_TYPES[keyof typeof CHALLENGE_GOAL_TYPES];
