-- Migration: AI Thumbnail Generation Feature
-- Created: 2025-12-02
-- Description: Adds support for AI-powered course thumbnail generation with LP Credits

-- Create thumbnailSource enum type
CREATE TYPE "thumbnailSource" AS ENUM('upload', 'ai');

-- Add new columns to courses table
ALTER TABLE courses 
ADD COLUMN "thumbnailSource" "thumbnailSource",
ADD COLUMN "thumbnailGeneratedAt" timestamp,
ADD COLUMN "thumbnailPromptSummary" text;

-- Add thumbnail_generation to lpTransactionType enum
ALTER TYPE "lpTransactionType" ADD VALUE 'thumbnail_generation';

-- Add creditsPerThumbnailGeneration to platformPricing table
ALTER TABLE "platformPricing" 
ADD COLUMN "creditsPerThumbnailGeneration" integer NOT NULL DEFAULT 15;
