-- Add quiz_generation to lpTransactionType enum
ALTER TYPE "lpTransactionType" ADD VALUE IF NOT EXISTS 'quiz_generation';
