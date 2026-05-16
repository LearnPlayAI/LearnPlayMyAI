# LearnPlay Project Brief

## Overview
LearnPlay is an AI-powered learning platform that enables organizations to create, deliver, and track AI-enhanced courses with gamification and real-time analytics. The platform supports both cloud-hosted and on-premise deployment models to meet varying data sovereignty and security requirements.

## Core Goals
- **Democratize AI-powered education**: Make AI-assisted course creation accessible to all organizations
- **Flexible deployment**: Support cloud, on-premise, and hybrid deployment models
- **Engage through gamification**: Increase learner engagement via gamification systems (XP, badges, leaderboards)
- **Enterprise-grade**: Meet strict EU security standards with on-premise deployment option
- **Multi-format content**: Support courses, podcasts, quizzes, and document-based learning

## Key Features
- AI-powered course generation and thumbnail creation
- Gamification catalog (XP system, badges, achievements, leaderboards)
- Enterprise portal with license management and telemetry
- Content translation and internationalization
- Podcast creation and playback
- Real-time analytics and progress tracking
- Theme system with dual-token architecture for white-labeling
- Document processing (PDF, DOCX, PPTX)
- File upload via Uppy with S3-compatible storage
- Real-time communication via Socket.IO

## Target Users
- **Educational institutions**: Schools, universities, training departments
- **Corporate training**: Businesses and enterprises for employee development
- **Course creators**: Independent creators building and monetizing courses
- **On-premise organizations**: Entities requiring data sovereignty (government, healthcare, finance)

## Deployment Modes
1. **Cloud**: Hosted on LearnPlay infrastructure (`stcloud.learnplay.co.za`)
2. **On-Premise**: Self-hosted with licensed production server (`stonprem.learnplay.co.za`)

## Tech Stack Summary
- **Frontend**: React 18, TypeScript, Vite, TailwindCSS, Radix UI
- **Backend**: Express.js, Socket.IO, Passport.js
- **Database**: PostgreSQL with Drizzle ORM
- **Storage**: Google Cloud Storage / Replit Object Storage
- **AI**: Google Generative AI
- **Testing**: Jest, Supertest, k6 (load testing)