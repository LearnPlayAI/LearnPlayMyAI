# Routes.ts Refactoring Inventory

## Overview
- **Original file size:** 31,403 lines
- **Total routes:** 606 endpoints
- **Backup location:** server/routes.ts.backup

## Domain Assignments

### 1. miscRoutes.ts (LOW RISK - Extract First)
Routes: /api/server-time, /api/monitoring/*, /api/gamma/* (non-admin), /api/notifications/*
Line ranges: 1153-1224, 15918-15960
Middleware: isSuperAdmin (monitoring), withSessionAuthMiddleware (gamma, notifications)

### 2. authRoutes.ts (LOW RISK)
Routes: /api/auth/*, /api/internal/session-*
Line ranges: 4052-5808
Middleware: various (public routes + withSessionAuthMiddleware)

### 3. aiRoutes.ts (LOW RISK)
Routes: /api/ai/*
Line ranges: 9177-9984+
Middleware: isSuperAdmin, withSessionAuthMiddleware

### 4. gameRoutes.ts (MEDIUM RISK - Socket.IO)
Routes: /api/game/*
Socket handlers: Lines 28060-31394 (io.on, socket.on events)
Middleware: optionalAuth

### 5. quizRoutes.ts (MEDIUM RISK)
Routes: /api/quiz-*, /api/cards/*, /api/collections/*, /api/drafts/*
Middleware: withSessionAuthMiddleware, isTeacherOrAdmin

### 6. courseRoutes.ts (MEDIUM RISK)
Routes: /api/courses/*, /api/lessons/*, /api/course-builder/*, /api/my-courses
Middleware: withSessionAuthMiddleware, isTeacherOrAdmin, multer uploads

### 7. orgRoutes.ts (MEDIUM RISK)
Routes: /api/organizations/*, /api/org/*, /api/org-wallet/*
Middleware: withSessionAuthMiddleware, enforceOrgIsolation

### 8. paymentsRoutes.ts (HIGH RISK - Webhooks)
Routes: /api/payments/*, /api/webhooks/*, /api/credit-*, /api/subscriptions/*, /api/invoices/*
CRITICAL: Keep exact paths for webhook signature verification
Middleware: various

### 9. reportRoutes.ts (LOW RISK)
Routes: /api/reports/*
Middleware: withSessionAuthMiddleware, isAdmin

### 10. gamificationRoutes.ts (MEDIUM RISK)
Routes: /api/gamification/*, /api/season-pass/*, /api/cosmetics/*, /api/powerups/*
Middleware: withSessionAuthMiddleware

### 11. adminRoutes.ts (MEDIUM RISK - Largest)
Routes: /api/admin/* (except gamma which goes to misc)
Middleware: isAdmin, isSuperAdmin, isTeacherOrAdmin

### 12. superAdminRoutes.ts (MEDIUM RISK)
Routes: /api/superadmin/*
Middleware: isSuperAdmin

## Socket.IO Events (Keep in routes.ts, call registerSocketHandlers)
- join-1v1-queue, join-single-player, join-specific-player
- join-match, select-stat, game-timeout, turn-timeout
- animation-complete, player-ready-1v1, leave-game
- Quiz events: join-quiz-1v1-queue, start-quiz-single-game, quiz-player-ready
- quiz-answer-submitted, quiz-next-card, quiz-game-ended
- disconnect, join-game, player-ready

## Multer Configurations
- imageStyleUpload (lines 1249-1251) - admin gamma image styles
- Course thumbnail uploads
- Avatar uploads

## Shared State (Keep in routes.ts index)
- Session configuration (configureSession)
- HTTP server creation (createServer)
- Socket.IO initialization (new SocketIOServer)

## Safety Checklist Per Extraction
- [ ] Copy exact middleware chain
- [ ] Preserve error response format
- [ ] Test 2-3 critical endpoints
- [ ] Keep old routes until new tested
- [ ] Commit after each extraction
