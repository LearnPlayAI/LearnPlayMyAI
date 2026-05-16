# Session Auth Production Validation Checklist

## Overview
This document outlines the validation steps required for the session-based authentication system in production.

## Pre-Deployment Checklist
- [x] Feature flag `SESSION_AUTH_ENABLED=true` set in production environment
- [x] Feature flag `SESSION_PAYLOAD_MONITORING=true` set in production environment
- [x] Rollback runbook reviewed (see `docs/session-auth-rollback-runbook.md`)
- [x] Session invalidation hooks verified in:
  - Join request approvals (single & bulk)
  - Role assignment/removal
  - Payment fulfillment
  - License activation/deactivation
  - Background job license expiry
  - Subscription suspensions

## Monitoring Metrics (48-hour window)

### 1. Authentication Success Rate
Monitor for unexpected 401/403 errors:
```
- Target: <0.1% auth rejection rate from session version mismatches
- Action if exceeded: Check SessionInvalidation logs for unexpected triggers
```

### 2. Session Store Performance
Watch PostgreSQL session table metrics:
```
- Session table row count: Should remain stable
- Session size average: Target <4KB per session
- Session store query latency: Target <10ms p95
```

### 3. Database Query Reduction (NEW INSTRUMENTATION)
Use the new auth query tracking system:
```
GET /api/internal/auth-query-metrics (SuperAdmin only)

Expected metrics:
- Fast Path Hit Rate: >80% (session context used, no DB query)
- Slow Path Rate: <20% (database fallback required)
- Estimated Time Saved: Should show significant savings

Targets:
- Before: ~7 queries per authenticated request (getUserRoles, getOrganization, etc.)
- Target: ~1-2 queries per authenticated request (session context hit)
- Expected reduction: 70-80% of auth-related DB queries
```

### 4. Session Health Metrics (NEW)
Use the session health monitoring system:
```
GET /api/internal/session-health (SuperAdmin only)

Key metrics to monitor:
- Context Build Time: Target <100ms avg, <500ms P95
- Cache Hit Rate: Target >80% (healthy), warning <80% (degraded)
- Invalidation Rate: Should correlate with admin actions (role changes, etc.)
- Health Status: Should be "healthy" (auto-calculated)

Health Status Thresholds:
- Critical: Cache hit rate <50%, build failure rate >5%
- Degraded: Cache hit rate <80%, slow build rate >10%
- Healthy: All metrics within acceptable ranges
```

### 5. Error Logs to Watch
```bash
grep -E "(SessionInvalidation|stale session|session version)" /var/log/app.log
```

## Success Criteria
After 48 hours of production traffic:
- [ ] No increase in auth-related errors (401/403 responses)
- [ ] Session store size remains stable (no memory leaks)
- [ ] Database query count reduced by ~70% for authenticated requests
- [ ] No user-reported login/session issues
- [ ] Session invalidation triggers firing correctly on role/subscription changes

## Rollback Triggers
Immediate rollback if:
- Auth rejection rate exceeds 1%
- Session store grows unbounded
- Users report widespread login issues
- Database connection exhaustion

## Post-Validation Actions
After successful 48-hour validation:
1. Mark Task 21 as complete
2. Proceed with Task 22: Legacy code cleanup
3. Update replit.md to reflect production-ready status

## Monitoring Commands

### Check Feature Flag Status
```bash
curl https://your-app.replit.app/api/internal/session-metrics
```

### Auth Query Metrics (NEW)
```bash
# Get auth query reduction metrics (requires SuperAdmin auth)
curl https://your-app.replit.app/api/internal/auth-query-metrics

# Response includes:
# - fastPathHits: Number of times session context was used (no DB query)
# - slowPathHits: Number of times database fallback was required
# - hitRate: Percentage of fast path hits (target: >80%)
# - estimatedTimeSaved: Estimated milliseconds saved
# - contextBreakdown: Per-middleware metrics
```

### Session Health Check (NEW)
```bash
# Get session health metrics (requires SuperAdmin auth)
curl https://your-app.replit.app/api/internal/session-health

# Response includes:
# - healthStatus: "healthy", "degraded", or "critical"
# - buildMetrics: Context build time statistics
# - cacheMetrics: Cache hit/miss rates
# - invalidationMetrics: Session invalidation events

# Quick summary endpoint
curl https://your-app.replit.app/api/internal/session-health/summary
```

### Reset Metrics (if needed)
```bash
# Reset auth query metrics
curl -X POST https://your-app.replit.app/api/internal/auth-query-metrics/reset

# Reset session health metrics
curl -X POST https://your-app.replit.app/api/internal/session-health/reset
```

### View Recent Session Invalidations
```sql
SELECT * FROM audit_logs 
WHERE action LIKE '%session%' 
ORDER BY created_at DESC 
LIMIT 20;
```

### Check Session Payload Sizes
Look for warnings in logs:
```
[Session Payload] Warning: Session size approaching limit
[SessionHealth] Warning: Slow context build (>500ms)
```
