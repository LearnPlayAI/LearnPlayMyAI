# Session-Based Authentication Protocol

## Overview

LearnPlay uses a session-based authentication optimization system that caches user organization, role, and subscription data in the session store, eliminating repeated database lookups on every request.

This document describes the protocol for client applications to interact with the session-based auth system.

## Feature Flag

Session-based authentication is controlled by the `SESSION_AUTH_ENABLED` environment variable:

```bash
# Enable session-based auth (recommended for production)
SESSION_AUTH_ENABLED=true

# Disable (falls back to database lookups)
SESSION_AUTH_ENABLED=false
```

When disabled, all middleware falls back to database lookups with no behavioral changes.

## Session Context Structure

After successful login, the session contains:

```typescript
interface SessionContext {
  primaryOrganization: {
    orgId: string;
    orgName: string;
    orgType: 'education' | 'business' | 'elearning';
    roles: string[]; // ['Learner', 'OrgAdmin', etc.]
  } | null;
  
  organizations: Array<{
    orgId: string;
    orgName: string;
    orgType: 'education' | 'business' | 'elearning';
    roles: string[];
  }>; // Limited to 10 organizations max
  
  effectiveRole: string; // 'SuperAdmin' | 'OrgAdmin' | 'Teacher' | 'Learner'
  
  subscription: {
    tier: string | null; // 'Blue' | 'Red' | 'Gold'
    status: string | null; // 'active' | 'expired' | 'suspended'
    expiresAt: Date | null;
    features: string[]; // Feature flags enabled
  } | null;
  
  sessionVersion: number; // Invalidation counter
}
```

## Multi-Organization Switching

Users with access to multiple organizations can switch context using the `X-Organization-Context` header:

### Request Header

```http
GET /api/courses HTTP/1.1
X-Organization-Context: <organization-id>
Cookie: connect.sid=<session-cookie>
```

### Behavior

1. **Header present**: Use specified organization if user has access
2. **Header absent**: Use primary organization (first in list)
3. **Invalid org ID**: Reject with 403 Forbidden

### Example

```javascript
// Frontend: Switch to specific organization
fetch('/api/courses', {
  headers: {
    'X-Organization-Context': 'org-uuid-123',
  },
  credentials: 'include',
});
```

## Session Invalidation

When a user's roles, organizations, or subscription changes, their `sessionVersion` is incremented. This forces:

1. **Stale session detection**: Middleware compares `session.context.sessionVersion` against `users.sessionVersion`
2. **Automatic logout**: If mismatch detected, session destroyed and 401 returned
3. **Re-authentication required**: User must log in again to get fresh context

### Invalidation Events

Sessions are automatically invalidated when:
- User role added/removed
- User joins/leaves organization
- Organization subscription changes
- Admin manually triggers invalidation

## Session Refresh Endpoint

To update session context without full re-authentication:

### Request

```http
POST /api/auth/refresh HTTP/1.1
Cookie: connect.sid=<session-cookie>
```

### Responses

**Success (200 OK)**:
```json
{
  "message": "Session refreshed successfully",
  "context": {
    "organizations": 2,
    "effectiveRole": "OrgAdmin",
    "sessionVersion": 3
  }
}
```

**Stale Session (401 Unauthorized)**:
```json
{
  "error": "Session expired",
  "message": "Your account settings have changed. Please log in again.",
  "code": "STALE_SESSION"
}
```

**Feature Disabled (501 Not Implemented)**:
```json
{
  "error": "Session refresh not available",
  "message": "Session-based authentication is not enabled"
}
```

## Monitoring

### Session Metrics Endpoint

Admin users can check session context size and health:

```http
GET /api/internal/session-metrics HTTP/1.1
Cookie: connect.sid=<session-cookie>
```

**Response**:
```json
{
  "authenticated": true,
  "sessionAuth": true,
  "metrics": {
    "sessionSize": 1234,
    "contextSize": 890,
    "organizations": 2,
    "effectiveRole": "OrgAdmin",
    "sessionVersion": 3,
    "hasSubscription": true
  },
  "warnings": {
    "sizeWarning": false,
    "sizeCritical": false
  }
}
```

### Size Limits

- **Warning threshold**: 3KB session context
- **Critical threshold**: 8KB session context
- **Maximum organizations**: 10 per user session

Exceeding limits triggers console warnings but does not block requests.

## Client Implementation

### Login Flow

```javascript
// 1. Login
const response = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
  credentials: 'include',
});

// 2. Session context auto-populated (if SESSION_AUTH_ENABLED=true)
// No additional client action required

// 3. Subsequent requests automatically use session context
const courses = await fetch('/api/courses', {
  credentials: 'include', // Include session cookie
});
```

### Handling Stale Sessions

```javascript
async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
  });

  const data = await response.json();

  // Handle stale session
  if (response.status === 401 && data.code === 'STALE_SESSION') {
    // Clear local state
    localStorage.clear();
    
    // Redirect to login
    window.location.href = '/login?reason=session_expired';
    return;
  }

  return { response, data };
}
```

### Multi-Organization Switching

```javascript
// Store current organization in state
const [currentOrgId, setCurrentOrgId] = useState(null);

// Include header on all requests
async function fetchWithOrgContext(url, options = {}) {
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      ...(currentOrgId && { 'X-Organization-Context': currentOrgId }),
    },
    credentials: 'include',
  });
}

// Switch organization
function switchOrganization(newOrgId) {
  setCurrentOrgId(newOrgId);
  // Subsequent requests will use new organization
}
```

## Performance Impact

### With Feature Flag Enabled

- **Zero database lookups** for role/org checks on authenticated requests
- **Single query at login** to build session context
- **O(1) authorization checks** from session memory

### With Feature Flag Disabled

- **Database lookup per request** for user roles/org
- **No performance degradation** from legacy behavior
- **Gradual migration path** via dual-path middleware

## Security Considerations

1. **Session hijacking**: Use HTTPS in production (`secure: true` cookies)
2. **Session expiration**: 4-hour TTL, configurable in session config
3. **Version mismatch**: Automatic logout prevents stale permission escalation
4. **Payload size**: Limited to 10 organizations prevents denial-of-service
5. **CSRF protection**: Maintained via sameSite cookie settings

## Rollback Plan

If issues arise, disable the feature flag:

```bash
SESSION_AUTH_ENABLED=false
```

System automatically falls back to database lookups with zero downtime.
