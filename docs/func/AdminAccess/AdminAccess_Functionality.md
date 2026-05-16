# AdminAccess Functionality

## About
This document defines platform admin-access behavior for privileged admin APIs, with focus on impersonation-aware authorization outcomes.

## Scope
- SuperAdmin and CustSuper middleware behavior
- Session-context fast-path authorization
- Impersonation compatibility for platform-level entitlements

## Feature List
- `SuperAdmin`-only API protection for platform admin routes
- `SuperAdmin or CustSuper` API protection where onprem mode permits CustSuper access
- Session-context fast path authorization
- Entitlement fallback checks to prevent false denials during impersonation

## Rules and Constraints
- Platform-wide privileged APIs remain restricted to users with platform admin entitlement.
- Impersonation may narrow effective role context for org-scoped work, but must not incorrectly remove underlying platform entitlement.
- In cloud mode, SuperAdmin entitlement governs privileged platform routes.
- In onprem mode, SuperAdmin and CustSuper entitlement can be accepted where route policy allows it.

## Environment-Specific Behavior
- cloud DEV/cloud ACC/cloud PRD:
  - SuperAdmin routes require SuperAdmin entitlement.
- onprem DEV/onprem ACC/onprem PRD:
  - SuperAdmin routes require SuperAdmin entitlement.
  - SuperAdmin-or-CustSuper routes can accept CustSuper entitlement.

## Integrations
- Session auth context (`effectiveRole`)
- User storage entitlement flags (`isSuperAdmin`, `isCustSuper`)
- Admin route middleware chain

## Assumptions
- Session contains a valid authenticated `userId`.
- User entitlement flags in storage are accurate.
- Impersonation context can change `effectiveRole` without changing underlying account entitlement.

## Out of Scope
- Org-level role assignment management
- Feature-level authorization beyond middleware gate logic

## Change Summary
- 2026-03-23: Added impersonation-safe entitlement fallback behavior so platform-admin routes remain accessible to entitled accounts even when session effective role is narrowed during impersonation.
