-- Add lesson_feedback and ai_content_improvement to orgCreditActivityType enum
ALTER TYPE "orgCreditActivityType" ADD VALUE IF NOT EXISTS 'lesson_feedback';
ALTER TYPE "orgCreditActivityType" ADD VALUE IF NOT EXISTS 'ai_content_improvement';
