# Session-Based Authentication Rollback Runbook

## Overview

This runbook provides step-by-step procedures to roll back the session-based authentication system in case of critical issues during or after deployment.

## Quick Reference

**Emergency Contacts:**
- On-call Engineer: [Your Team's On-Call Contact]
- Database Admin: [DBA Contact]
- Platform Lead: [Lead Engineer Contact]

**Key Metrics to Monitor:**
- Authentication failure rate: <0.1% baseline
- Session store size: <4KB per session
- Database query count: ~200 queries eliminated per session
- Response times: 50-100ms improvement expected

## Rollback Levels

### Level 1: Feature Flag Disable (Zero Downtime)

**When to use:**
- Initial rollout showing unexpected behavior
- Session context building errors
- Stale session rejection rate >5%
- Session payload size warnings

**Impact:**
- Zero downtime
- Immediate fallback to database lookups
- No data loss

**Procedure:**

1. **Disable the feature flag:**
   ```bash
   # In production environment variables
   SESSION_AUTH_ENABLED=false
   ```

2. **Restart the application:**
   ```bash
   # Replit will auto-deploy when env var changes
   # Or manually restart workflow: "Start application"
   ```

3. **Verify fallback:**
   ```bash
   # Check logs for feature flag status
   grep "Session-Based Auth.*DISABLED" logs/application.log
   
   # Test authentication flow
   curl -X POST https://your-app.replit.app/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"test123"}'
   
   # Verify no STALE_SESSION errors
   grep "STALE_SESSION" logs/application.log
   ```

4. **Monitor metrics:**
   - Authentication success rate should return to baseline
   - Database query count will increase (expected)
   - Response times may increase slightly (acceptable)

5. **Post-rollback:**
   - Investigate root cause in development environment
   - Review session context building logic
   - Check for race conditions or version mismatch issues

**Rollback Time:** <5 minutes

### Level 2: Session Payload Monitoring Disable

**When to use:**
- Session size warnings excessive
- Performance impact from monitoring overhead
- Memory pressure on session store

**Impact:**
- Removes monitoring overhead
- Session auth remains functional
- Reduced visibility into session sizes

**Procedure:**

1. **Disable payload monitoring:**
   ```bash
   SESSION_PAYLOAD_MONITORING=false
   ```

2. **Restart application and verify:**
   ```bash
   # Check logs - should not see session size warnings
   grep "SessionMonitoring" logs/application.log
   ```

**Rollback Time:** <3 minutes

### Level 3: Database Rollback (Destructive)

**When to use:**
- Critical data integrity issues
- Session version tracking causing cascading failures
- Cannot resolve issues with feature flag alone
- **Last resort only**

**Impact:**
- Requires database migration rollback
- May lose session version tracking data
- Requires application restart
- Potential downtime: 5-15 minutes

**Prerequisites:**
- Database backup confirmed available
- All stakeholders notified
- Off-hours maintenance window (if possible)

**Procedure:**

1. **Create backup (if not already done):**
   ```bash
   # Via Replit database UI: Export to backup
   # Or via CLI (if available):
   pg_dump $DATABASE_URL > backup_before_rollback_$(date +%Y%m%d_%H%M%S).sql
   ```

2. **Disable feature flags first:**
   ```bash
   SESSION_AUTH_ENABLED=false
   SESSION_PAYLOAD_MONITORING=false
   ```

3. **Remove sessionVersion column:**
   ```sql
   -- Connect to development database via Replit SQL tool
   ALTER TABLE users DROP COLUMN IF EXISTS session_version;
   ```

4. **Restart application:**
   ```bash
   # Restart workflow
   npm run dev
   ```

5. **Verify system health:**
   ```bash
   # Check authentication works
   curl -X POST https://your-app.replit.app/api/auth/login [...]
   
   # Check database queries
   grep "getUserRoles" logs/application.log
   ```

6. **Remove code references (optional):**
   - Revert commits related to session auth
   - Remove SessionContextService, SessionInvalidationService
   - Remove middleware from routes.ts

**Rollback Time:** 15-30 minutes

## Monitoring & Detection

### Key Indicators of Problems

**1. High Stale Session Rate (>5%)**

**Symptoms:**
- Users reporting "Session expired" errors
- Frequent 401 STALE_SESSION responses

**Detection:**
```bash
# Count STALE_SESSION errors
grep "STALE_SESSION" logs/application.log | wc -l

# Check session invalidation rate
grep "Session version incremented" logs/application.log | wc -l
```

**Action:**
- Review session invalidation triggers
- Check for overly aggressive version bumping
- Consider Level 1 rollback if >10% of sessions affected

**2. Session Store Bloat**

**Symptoms:**
- PostgreSQL session store performance degradation
- Session context size warnings in logs
- Memory pressure alerts

**Detection:**
```bash
# Check session sizes
grep "SessionMonitoring.*bytes" logs/application.log

# Check for critical size warnings
grep "Session context size.*exceeds safe limit" logs/application.log
```

**Action:**
- Reduce MAX_ORGANIZATIONS_IN_SESSION (currently 10)
- Investigate users with excessive org memberships
- Consider Level 2 rollback if widespread

**3. Version Mismatch Errors**

**Symptoms:**
- Users logged out unexpectedly
- Session version != database version

**Detection:**
```bash
# Check version mismatches
grep "Session version mismatch" logs/application.log
```

**Action:**
- Verify SessionInvalidationService is being called correctly
- Check for race conditions in role/org assignment
- Review transaction isolation levels

**4. Performance Degradation**

**Symptoms:**
- Response times not improving
- Database queries not reduced
- CPU usage higher than baseline

**Detection:**
```bash
# Check if session auth is actually being used
grep "SessionContext.*Built session context" logs/application.log

# Verify feature flag
grep "SESSION_AUTH_ENABLED.*true" logs/application.log
```

**Action:**
- Verify middleware is wired correctly
- Check that endpoints are using withOrgContext
- Review dual-path middleware logic

## Testing Rollback Procedures

### Pre-Deployment Testing

**1. Test Level 1 Rollback in Staging:**
```bash
# Enable session auth
SESSION_AUTH_ENABLED=true

# Run test suite
npm test

# Disable session auth
SESSION_AUTH_ENABLED=false

# Re-run test suite - should pass identically
npm test
```

**2. Test Version Mismatch Handling:**
```bash
# Simulate stale session by manually incrementing user sessionVersion
# Then attempt authenticated request - should get 401 STALE_SESSION
```

**3. Load Test with/without Feature Flag:**
```bash
# Measure baseline performance
# Enable flag, measure improvement
# Disable flag, verify return to baseline
```

## Post-Rollback Actions

### After Level 1 Rollback:

1. **Root Cause Analysis:**
   - Review logs for error patterns
   - Identify which endpoints are failing
   - Check session context payload structure

2. **Fix and Retest:**
   - Address root cause in development
   - Add integration tests for failure scenario
   - Re-enable in staging first

3. **Gradual Re-Rollout:**
   - Enable for internal users only
   - Monitor for 24 hours
   - Expand to 10% of production traffic
   - Full rollout after 48 hours stable

### After Level 3 Rollback:

1. **Post-Mortem:**
   - Document what went wrong
   - Identify gaps in testing
   - Update rollback procedures

2. **Architecture Review:**
   - Re-evaluate session context design
   - Consider alternative approaches
   - Consult with architect/senior engineers

3. **Enhanced Testing:**
   - Add end-to-end tests for rollback scenarios
   - Implement canary deployment
   - Set up automated rollback triggers

## Communication Templates

### Level 1 Rollback Notification

**Subject:** [Action Required] Session Auth Feature Flag Disabled

**Body:**
```
Team,

We've disabled the SESSION_AUTH_ENABLED feature flag due to [specific issue].

Impact:
- Zero downtime
- Users may not notice any change
- Database query count will temporarily increase

Next Steps:
- Investigating root cause
- Will provide update in [timeframe]

Current Status: [link to status page]
```

### Level 3 Rollback Notification

**Subject:** [Critical] Database Rollback in Progress - Session Auth

**Body:**
```
Team,

We are performing a database rollback of the session authentication system.

Impact:
- Expected downtime: 15-30 minutes
- All active sessions will be terminated
- Users will need to log in again

Reason: [critical issue description]

Timeline:
- Start: [time]
- Expected completion: [time]
- Status updates every 15 minutes

Emergency Contact: [on-call engineer]
```

## Checklist

### Pre-Rollout Checklist:
- [ ] Feature flag defaults to false (SESSION_AUTH_ENABLED=false)
- [ ] Database backup created
- [ ] Rollback runbook reviewed
- [ ] Monitoring dashboards configured
- [ ] On-call engineer briefed
- [ ] Level 1 rollback tested in staging

### Post-Rollback Checklist:
- [ ] All authentication flows tested
- [ ] Error rates returned to baseline
- [ ] Database performance normal
- [ ] Session store sizes normal
- [ ] Root cause identified
- [ ] Post-mortem scheduled
- [ ] Rollback runbook updated with lessons learned

## Appendix

### Useful Queries

**Check session versions:**
```sql
SELECT id, email, session_version 
FROM users 
WHERE session_version > 1 
ORDER BY session_version DESC 
LIMIT 20;
```

**Count users by org:**
```sql
SELECT organization_id, COUNT(DISTINCT user_id) as user_count
FROM user_organization_roles
GROUP BY organization_id
ORDER BY user_count DESC;
```

**Find users with many orgs:**
```sql
SELECT user_id, COUNT(DISTINCT organization_id) as org_count
FROM user_organization_roles
GROUP BY user_id
HAVING COUNT(DISTINCT organization_id) > 10
ORDER BY org_count DESC;
```

### Environment Variables Reference

```bash
# Core feature flag
SESSION_AUTH_ENABLED=true|false          # Enable/disable session-based auth

# Monitoring
SESSION_PAYLOAD_MONITORING=true|false    # Track session sizes

# Multi-org switching
ENABLE_MULTI_ORG_SWITCHING=true|false    # Allow X-Organization-Context header

# Legacy fallback
# When SESSION_AUTH_ENABLED=false, system uses database lookups (no additional config needed)
```

### Contact Information

- **Replit Support:** https://replit.com/support
- **Database Issues:** Use Replit database UI to rollback snapshots
- **Deployment Issues:** Check Replit deployments tab for rollback options

## Version History

- v1.0 (2025-11-25): Initial rollback runbook created
- [Future versions to be added here]
