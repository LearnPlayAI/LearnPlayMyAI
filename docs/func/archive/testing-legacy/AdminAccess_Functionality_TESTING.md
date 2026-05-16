# AdminAccess Functionality Testing

## About
This document provides test steps for validating privileged admin API access, including impersonation-safe entitlement behavior.

## Scope
- SuperAdmin-only route access
- SuperAdmin-or-CustSuper route access
- Impersonation behavior for entitled users

## Feature Index
1. SuperAdmin route access (normal)
2. SuperAdmin route access while impersonating
3. SuperAdmin-or-CustSuper route access in onprem mode
4. Negative authorization checks

## Preconditions
- Test users exist for:
  - SuperAdmin
  - CustSuper (onprem)
  - Non-privileged user
- Impersonation feature is enabled and usable
- Target environment selected:
  - cloud DEV or cloud ACC for cloud checks
  - onprem DEV or onprem ACC for onprem checks

## Test Cases

### 1. SuperAdmin route access (normal)
1. Log in as SuperAdmin.
2. Call a SuperAdmin route such as:
   - `GET /api/admin/gamma/image-styles`
   - `GET /api/admin/gamma/themes`

Expected result:
- HTTP 200 response for both endpoints.

### 2. SuperAdmin route access while impersonating
1. Log in as SuperAdmin.
2. Start impersonation into a target organization.
3. Call:
   - `GET /api/admin/gamma/image-styles`
   - `GET /api/admin/gamma/themes`

Expected result:
- Calls remain authorized (HTTP 200), not HTTP 403.
- Data loads in admin gamma themes UI while impersonating.

### 3. SuperAdmin-or-CustSuper route access in onprem mode
1. In onprem mode, log in as CustSuper.
2. Call one route guarded by SuperAdmin-or-CustSuper middleware.

Expected result:
- Route is authorized for CustSuper on onprem.

### 4. Negative authorization checks
1. Log in as non-privileged user.
2. Call the same privileged routes.

Expected result:
- HTTP 403 is returned.
- Error messaging indicates privileged access is required.

## Negative/Edge Cases
- If session context `effectiveRole` is narrowed by impersonation, entitlement fallback still authorizes truly entitled platform admins.
- If user record is missing or session is invalid, middleware returns HTTP 401.

## Change Summary
- 2026-03-23: Added testing guidance for impersonation-safe SuperAdmin/CustSuper entitlement fallback behavior on privileged admin routes.
