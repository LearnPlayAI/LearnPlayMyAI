# Session-Based Authentication Migration Guide

## Overview

This guide provides a systematic approach to migrating LearnPlay's ~180 API endpoints from database-based role/org lookups to session-based authentication.

## Migration Strategy

### Phase 1: Foundation (COMPLETE)
- ✅ Added `sessionVersion` column to users table
- ✅ Created SessionContextService and SessionInvalidationService
- ✅ Built dual-path middleware with feature flag
- ✅ Added /api/auth/refresh and /api/internal/session-metrics endpoints
- ✅ Documented X-Organization-Context protocol

### Phase 2: High-Traffic Endpoint Migration (Recommended)

Migrate the highest-traffic endpoints first to maximize performance gains:

**Priority 1: Authentication & Session Management**
- ✅ POST /api/auth/login (session context population complete)
- ✅ POST /api/auth/refresh (session refresh complete)
- GET /api/auth/user (migrate to use req.session.context)

**Priority 2: Course & Lesson Access**
- GET /api/courses (high-traffic learner endpoint)
- GET /api/courses/:id (course detail page)
- GET /api/lessons/:id (lesson viewer)
- POST /api/lessons/:id/progress (lesson progress tracking)

**Priority 3: Quiz Gameplay**
- GET /api/quiz/collections (quiz listing)
- POST /api/quiz/start (quiz gameplay initialization)
- POST /api/quiz/submit (quiz submission)

**Priority 4: Feature Access Checks**
- GET /api/features/check (feature flag validation)
- GET /api/ai/quota (AI credit checks)
- GET /api/gamification/inventory (user inventory)

### Phase 3: Bulk Migration (tasks 13, 19)

Use automated tooling to migrate remaining endpoints systematically.

## Migration Patterns

### Pattern 1: Simple Role Check

**Before (Database Lookup):**
```typescript
app.get("/api/courses", requireAuth, async (req: Request, res: Response) => {
  const userId = req.session.userId!;
  
  // Database lookup - expensive
  const userRoles = await storage.getUserRoles(userId);
  if (userRoles.length === 0) {
    return res.status(403).json({ error: "No organization access" });
  }
  
  const organizationId = userRoles[0].organizationId;
  const courses = await storage.getCourses(organizationId);
  
  res.json({ courses });
});
```

**After (Session-Based):**
```typescript
app.get("/api/courses", requireAuth, withOrgContext, async (req: RequestWithOrgContext, res: Response) => {
  // No database lookup - read from session
  const { organizationId } = req.orgContext!;
  
  const courses = await storage.getCourses(organizationId);
  
  res.json({ courses });
});
```

**Performance Gain:** Eliminates 1-2 database queries per request

### Pattern 2: Role-Based Authorization

**Before (Database Lookup):**
```typescript
app.post("/api/quizzes", requireAuth, async (req: Request, res: Response) => {
  const userId = req.session.userId!;
  
  // Check if user has teacher or admin role
  const userRoles = await storage.getUserRoles(userId);
  const roleTypes = userRoles.map(r => r.roleType);
  
  if (!roleTypes.includes('Teacher') && !roleTypes.includes('OrgAdmin')) {
    return res.status(403).json({ error: "Insufficient permissions" });
  }
  
  const organizationId = userRoles[0].organizationId;
  // ... create quiz
});
```

**After (Session-Based):**
```typescript
app.post("/api/quizzes", requireAuth, requireRole(['Teacher', 'OrgAdmin']), async (req: RequestWithOrgContext, res: Response) => {
  // Role check handled by middleware - no database lookup
  const { organizationId } = req.orgContext!;
  
  // ... create quiz
});
```

**Performance Gain:** Eliminates 1 database query + role filtering per request

### Pattern 3: Subscription Feature Access

**Before (Database Lookup):**
```typescript
app.post("/api/ai/generate-quiz", requireAuth, async (req: Request, res: Response) => {
  const userId = req.session.userId!;
  
  // Get user's organization
  const userRoles = await storage.getUserRoles(userId);
  const organizationId = userRoles[0].organizationId;
  
  // Check subscription tier
  const [license] = await db
    .select()
    .from(organizationLicenses)
    .where(eq(organizationLicenses.organizationId, organizationId))
    .limit(1);
    
  if (!license || license.tier !== 'Gold') {
    return res.status(403).json({ error: "Gold subscription required" });
  }
  
  // ... generate quiz
});
```

**After (Session-Based):**
```typescript
app.post("/api/ai/generate-quiz", requireAuth, requireSubscription(['ai_quiz_generation']), async (req: RequestWithOrgContext, res: Response) => {
  // Subscription check handled by middleware - no database lookups
  const { organizationId } = req.orgContext!;
  
  // ... generate quiz
});
```

**Performance Gain:** Eliminates 2 database queries per request

### Pattern 4: Multi-Organization Switching

**New Capability (Not Possible Before):**
```typescript
// Client sends header to switch organization context
fetch('/api/courses', {
  headers: {
    'X-Organization-Context': 'org-uuid-123',
  },
  credentials: 'include',
});

// Server middleware handles switching automatically
app.get("/api/courses", requireAuth, withOrgContext, async (req: RequestWithOrgContext, res: Response) => {
  // req.orgContext reflects the requested organization (if user has access)
  const { organizationId, organizationName } = req.orgContext!;
  
  const courses = await storage.getCourses(organizationId);
  res.json({ courses });
});
```

**Performance Gain:** Enables multi-org workflows without additional database queries

## Automated Migration Tooling (Task 13)

### Codemod Approach

Create a codemod to automatically identify and migrate common patterns:

**1. Identify Candidates:**
```typescript
// Find all instances of getUserRoles() in routes.ts
const candidates = grep('storage.getUserRoles', 'server/routes.ts');
```

**2. Analyze Context:**
```typescript
// For each candidate, analyze:
// - Is it using organizationId for queries?
// - Is it checking roleType for authorization?
// - Is it checking subscription tier?
```

**3. Generate Replacement:**
```typescript
// Replace with appropriate middleware:
// - getUserRoles() + org access → withOrgContext
// - getUserRoles() + role check → requireRole([...])
// - subscription check → requireSubscription([...])
```

**4. Test Coverage:**
```typescript
// Run integration tests before/after migration
// Verify behavior is identical
```

### Manual Review Points

**Endpoints requiring manual review:**
- Complex multi-step authorization logic
- Dynamic role checks (e.g., "owner of this resource")
- Cross-organization queries
- Service layer calls (not HTTP endpoints)

## Session Invalidation Triggers (Task 12)

**Already Implemented:**
- ✅ Join request approval (single & bulk)

**Remaining Triggers to Add:**
```typescript
// When roles change
app.post("/api/org/users/:userId/roles", async (req, res) => {
  await storage.updateUserRole(userId, organizationId, newRole);
  await SessionInvalidationService.invalidateUserSession(userId, 'Role updated');
});

// When licenses are provisioned/updated
app.post("/api/licenses/provision", async (req, res) => {
  await storage.createOrganizationLicense(organizationId, licenseData);
  
  // Invalidate sessions for all users in org (bulk invalidation)
  const orgUsers = await storage.getOrganizationUsers(organizationId);
  await SessionInvalidationService.bulkInvalidateSessions(
    orgUsers.map(u => u.id),
    'Organization license updated'
  );
});

// When subscription expires
// (Handled by billing scheduler)
async function expireSubscriptions() {
  const expiredLicenses = await findExpiredLicenses();
  
  for (const license of expiredLicenses) {
    await markLicenseExpired(license.id);
    
    // Invalidate all users in organization
    const orgUsers = await storage.getOrganizationUsers(license.organizationId);
    await SessionInvalidationService.bulkInvalidateSessions(
      orgUsers.map(u => u.id),
      'Subscription expired'
    );
  }
}
```

## Testing Strategy (Task 15)

### Integration Tests

**Test 1: Session Context Population on Login**
```typescript
describe('Session Context Population', () => {
  it('should populate session context on successful login', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'password123' });
      
    expect(response.status).toBe(200);
    
    // Verify session context was built
    const sessionCookie = response.headers['set-cookie'];
    const metricsResponse = await request(app)
      .get('/api/internal/session-metrics')
      .set('Cookie', sessionCookie);
      
    expect(metricsResponse.body.metrics.organizations).toBeGreaterThan(0);
    expect(metricsResponse.body.metrics.effectiveRole).toBeDefined();
  });
});
```

**Test 2: Multi-Organization Switching**
```typescript
describe('Multi-Organization Context Switching', () => {
  it('should switch organization via header', async () => {
    // User has access to org1 and org2
    const loginResponse = await login(multiOrgUser);
    const sessionCookie = loginResponse.headers['set-cookie'];
    
    // Request with org2 context
    const response = await request(app)
      .get('/api/courses')
      .set('Cookie', sessionCookie)
      .set('X-Organization-Context', org2.id);
      
    expect(response.status).toBe(200);
    expect(response.body.courses[0].organizationId).toBe(org2.id);
  });
  
  it('should reject invalid organization ID', async () => {
    const loginResponse = await login(singleOrgUser);
    const sessionCookie = loginResponse.headers['set-cookie'];
    
    // Request with org user doesn't have access to
    const response = await request(app)
      .get('/api/courses')
      .set('Cookie', sessionCookie)
      .set('X-Organization-Context', 'invalid-org-id');
      
    expect(response.status).toBe(403);
  });
});
```

**Test 3: Session Invalidation on Role Change**
```typescript
describe('Session Invalidation', () => {
  it('should invalidate session when user role changes', async () => {
    const loginResponse = await login(user);
    const sessionCookie = loginResponse.headers['set-cookie'];
    
    // Initial request succeeds
    const response1 = await request(app)
      .get('/api/courses')
      .set('Cookie', sessionCookie);
    expect(response1.status).toBe(200);
    
    // Admin changes user's role
    await adminChangeUserRole(user.id, 'Teacher');
    
    // Subsequent request should fail with STALE_SESSION
    const response2 = await request(app)
      .get('/api/courses')
      .set('Cookie', sessionCookie);
    expect(response2.status).toBe(401);
    expect(response2.body.code).toBe('STALE_SESSION');
  });
});
```

**Test 4: Subscription Feature Access**
```typescript
describe('Subscription-Based Authorization', () => {
  it('should allow AI features for Gold tier', async () => {
    const loginResponse = await login(goldTierUser);
    const sessionCookie = loginResponse.headers['set-cookie'];
    
    const response = await request(app)
      .post('/api/ai/generate-quiz')
      .set('Cookie', sessionCookie)
      .send({ topic: 'Mathematics' });
      
    expect(response.status).toBe(200);
  });
  
  it('should reject AI features for Blue tier', async () => {
    const loginResponse = await login(blueTierUser);
    const sessionCookie = loginResponse.headers['set-cookie'];
    
    const response = await request(app)
      .post('/api/ai/generate-quiz')
      .set('Cookie', sessionCookie)
      .send({ topic: 'Mathematics' });
      
    expect(response.status).toBe(403);
    expect(response.body.error).toContain('subscription');
  });
});
```

### Load Testing (Task 16)

**Baseline (Feature Flag Disabled):**
```bash
# Measure database query count per request
SESSION_AUTH_ENABLED=false npm run load-test

# Expected: ~200 queries per session (roles, orgs, subscriptions)
# Response time: 150-250ms per request
```

**With Session Auth (Feature Flag Enabled):**
```bash
# Measure reduced query count
SESSION_AUTH_ENABLED=true npm run load-test

# Expected: ~0 auth queries per request (all from session)
# Response time: 50-100ms per request
# Improvement: 50-60% faster
```

## Rollout Plan (Tasks 18, 21)

### Stage 1: Internal Testing
```bash
# Enable for development environment
SESSION_AUTH_ENABLED=true
```

**Duration:** 1 week  
**Validation:**
- All integration tests pass
- Manual QA on key user journeys
- No stale session errors in logs
- Session sizes <4KB

### Stage 2: Canary Deployment
```bash
# Enable for 10% of production users
# (Use load balancer or user ID hash if available)
```

**Duration:** 48 hours  
**Metrics to Monitor:**
- Auth failure rate (<0.1% baseline)
- STALE_SESSION errors (<1% of sessions)
- Response time improvement (>40%)
- Session store size (<4KB average)

### Stage 3: Full Rollout
```bash
# Enable for all users
SESSION_AUTH_ENABLED=true
```

**Duration:** Ongoing  
**Success Criteria:**
- 50% reduction in database queries
- 40% improvement in response times
- <0.5% increase in auth errors
- No critical incidents

### Stage 4: Cleanup (Task 22)
```bash
# After 30 days stable, remove feature flag
# Remove legacy getUserRoles() database code
# Remove dual-path middleware fallback logic
```

## Migration Checklist

### Per-Endpoint Migration:
- [ ] Identify database lookup pattern (getUserRoles, subscription check, etc.)
- [ ] Add appropriate middleware (withOrgContext, requireRole, requireSubscription)
- [ ] Replace database queries with req.orgContext access
- [ ] Add integration test for endpoint
- [ ] Verify behavior with feature flag enabled/disabled
- [ ] Update API documentation
- [ ] Code review and merge

### Per-Admin Action:
- [ ] Identify role/org/subscription modification
- [ ] Add SessionInvalidationService.invalidateUserSession() call
- [ ] Test that sessions are actually invalidated
- [ ] Verify users are logged out appropriately
- [ ] Document in runbook

### Pre-Production:
- [ ] All high-traffic endpoints migrated
- [ ] Integration test suite passes
- [ ] Load tests show performance improvement
- [ ] Rollback procedures tested in staging
- [ ] On-call engineer briefed
- [ ] Monitoring dashboards configured

### Post-Production:
- [ ] Monitor metrics for 48 hours
- [ ] No increase in error rates
- [ ] Measure actual query reduction
- [ ] Document lessons learned
- [ ] Plan cleanup (task 22)

## Expected Outcomes

**Performance:**
- 50-60% reduction in auth-related database queries
- 40-50% faster response times for authenticated requests
- Reduced database load (CPU, memory, connections)

**Functionality:**
- Transparent to end users (zero functional changes)
- Enables multi-organization switching
- Better session management and invalidation

**Operational:**
- Feature flag allows instant rollback
- Better observability (session metrics endpoint)
- Clearer separation of concerns (auth vs business logic)

## Next Steps

1. **Complete Task 12:** Add session invalidation to all admin actions
2. **Complete Task 13:** Build/run codemod tooling for bulk migration
3. **Complete Task 14:** Manually migrate priority endpoints
4. **Complete Task 15:** Build integration test suite
5. **Complete Task 16:** Run load tests and measure improvements
6. **Complete Tasks 18-21:** Execute gradual rollout plan
7. **Complete Task 22:** Clean up legacy code after validation
