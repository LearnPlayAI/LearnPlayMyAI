# LearnPlay System Patterns

## Architecture Overview
LearnPlay uses a monorepo architecture with a clear separation between frontend, backend, and shared code, deployed in either cloud or on-premise mode.

```
LearnPlayLocal/
├── Cloud-On-Prem/              # Main application codebase
│   ├── client/                 # React 18 + TypeScript frontend
│   │   └── src/                # Components, pages, hooks, lib
│   ├── server/                 # Express.js + Socket.IO backend
│   │   ├── api/, routes/, services/, middleware/
│   │   ├── schedulers/, workers/
│   ├── shared/                 # Shared TypeScript code
│   ├── drizzle/                # Drizzle ORM migrations
│   ├── cloud/                  # Cloud deployment scripts
│   ├── onprem/                 # On-premise deployment scripts
│   ├── scripts/                # Validation, audit, utility scripts
│   └── tests/                  # Load tests (k6)
├── scripts/                     # Root-level utilities
└── memory-bank/                 # Project documentation
```

## Key Technical Decisions

### Database
- **PostgreSQL** as primary relational database
- **Drizzle ORM** for type-safe database access
- **Drizzle Kit** for migration management (`drizzle-kit push`)
- **drizzle-zod** for schema-to-Zod integration
- **@neondatabase/serverless** for Neon serverless PostgreSQL support

### Authentication & Session
- **Passport.js** with `passport-local` strategy
- **express-session** with `connect-pg-simple` PostgreSQL store
- **bcrypt** for password hashing
- Session-based authentication (not JWT)

### Real-time Communication
- **Socket.IO** for bidirectional real-time events
- **ws** WebSocket implementation as fallback
- Integrated with Express.js middleware

### Storage
- **Google Cloud Storage** for cloud deployments
- **Replit Object Storage** for Replit-hosted instances
- **Multer** for multipart/form-data file uploads
- **Sharp** for image processing

### Frontend Architecture
- **React 18** with component composition pattern
- **Radix UI** for accessible headless component primitives
- **TailwindCSS** + `tailwindcss-animate` for styling
- **wouter** for lightweight client-side routing
- **React Hook Form** + **Zod** for form validation
- **@tanstack/react-query** for server state management
- **Framer Motion** for animations
- **React Context** for global state (themes, authentication)

### Backend Architecture
- **Express.js** RESTful API
- **Route-based organization** in `server/routes/` and `server/api/`
- **Service layer pattern** in `server/services/`
- **Middleware pattern** for cross-cutting concerns (auth, billing, usage limits)
- **Scheduler pattern** for background jobs in `server/schedulers/`
- **Worker pattern** for async tasks in `server/workers/`

## Design Patterns in Use

### Component Patterns (Frontend)
- **Compound components**: Related components working together (e.g., Carousel + Slide)
- **Higher-order components**: Reusable logic encapsulation
- **Custom hooks**: Stateful logic extraction (useAuth, useTheme, useCourse)
- **Render props**: Flexible component composition

### API Patterns (Backend)
- **RESTful endpoints**: Resource-based URL structure
- **Zod schema validation**: All API inputs/outputs validated
- **Error handling middleware**: Centralized error handling
- **Tenant middleware**: Multi-tenancy support via `tenantMiddleware.ts`

### Database Patterns
- **Migration-driven schema**: All schema changes via SQL migrations (100+ migrations)
- **Soft deletes**: `deletedAt` columns where appropriate
- **Index optimization**: Performance-focused database indexes
- **Foreign key constraints**: Referential integrity enforced

### Theme System Pattern
- **Dual-token architecture**: Base tokens + branding tokens for theming
- **Theme catalog**: Centralized theme definitions
- **Theme migration**: `themePresetIdsToCatalog` migration system
- **Brand-aware rendering**: Components respond to theme context

## Component Relationships

### Course Framework
```
Course → Topics → Lessons → Segments → Quizzes
  ↓
  └── Assignments → Submissions → Grades
```

### Gamification System
```
User → XP Earnings → Achievements → Leaderboards
      ↓
      └── Badge Unlocking → Catalog Rewards
```

### Enterprise System
```
Organization → License → Users → Business Profile
      ↓
      └── Telemetry → Metrics → Dashboard
```

### Payment/Billing
```
Organization → Subscription → Billing Events → Invoices
      ↓
      └── Usage Limits → Throttling → Alerts
```

## Critical Implementation Paths

### Course Creation Flow
1. Admin creates course via UI
2. AI generates content/thumbnails (Google Generative AI)
3. Course structured with topics and lessons
4. Gamification rules applied
5. Published to platform

### Learning Flow
1. Student enrolls in course
2. Progress tracked via lesson progress table
3. Quizzes taken and scored
4. XP earned and badges unlocked
5. Certificate awarded on completion

### Real-time Features
1. Socket.IO connection established
2. Events: progress updates, notifications, collaborations
3. Broadcast via Socket.IO rooms (course/org scoped)

### Migration System
1. SQL migration files in `drizzle/migrations/`
2. Versioned sequentially (0001_, 0002_, etc.)
3. Applied via `drizzle-kit push`
4. Schema validated via migration governance scripts