# Session Auth Legacy Code Cleanup Guide

## Overview
This document outlines the legacy code that can be removed after successful 48-hour production validation of the session-based authentication system.

## Prerequisites
Before removing legacy code:
- [ ] 48-hour production validation passed (see `docs/session-auth-production-validation.md`)
- [ ] No auth-related errors in production logs
- [ ] Session store stable and performant
- [ ] Database query reduction verified

## Code Removal Tasks

### 1. Remove Database Fallback Paths
Once session auth is stable, remove fallback database lookups in:

**File: `server/middleware/sessionAuthMiddleware.ts`**
- Remove `else` branches that fallback to `storage.getUserRoles()`
- Keep only session-based auth paths

**File: `server/routes/public.ts`**
- Remove database fallback in `/api/user-status` endpoint
- Use only session context

**File: `server/routes.ts`**
- Remove database fallback in `/api/auth/user` endpoint
- Simplify to session-only path

### 2. Simplify Feature Flags
**File: `server/featureFlags.ts`**
- Remove `SESSION_AUTH_ENABLED` flag (always enabled)
- Keep `SESSION_PAYLOAD_MONITORING` for ongoing observability
- Keep `ENABLE_MULTI_ORG_SWITCHING`

### 3. Clean Up Redundant Database Queries
Remove direct database queries that duplicate session context:
- `storage.getUserRoles()` calls in authenticated routes
- `storage.getOrganization()` calls for org name/type
- Direct `userOrganizationRoles` table queries for role checks

### 4. Archive Migration Tools
Move to archive or delete:
- `scripts/session-auth-codemod.ts` (migration complete)
- `scripts/session-auth-load-test.ts` (benchmarking complete)

### 5. Update Documentation
- Move `docs/session-auth-production-validation.md` to archive
- Update `replit.md` to remove "in validation" status
- Update session auth section to reflect stable, production state

## Estimated Code Reduction
- ~50 lines of fallback logic removed
- ~30 redundant database query calls eliminated
- Cleaner middleware with single code path

## Rollback Considerations
Keep the following for 30 days after cleanup:
- Git tags/commits for rollback reference
- Archived copies of removed code
- Database schema unchanged (sessionVersion column remains)

## Timeline
- Week 1-2: Production validation (48 hours active monitoring)
- Week 2: Legacy code cleanup (this guide)
- Week 3: Final documentation updates
- Week 4+: Monitor and archive
