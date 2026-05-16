# Cloud vs OnPrem Feature Difference Matrix

Last updated: 2026-04-13

## Purpose
This document is the canonical parity baseline for role-journey audits across LearnPlay cloud and onprem variants.

## Confirmed Differences
| ID | Domain | Cloud | OnPrem | Evidence |
|---|---|---|---|---|
| FD-001 | Enterprise portal | Enabled | Disabled (routes not mounted) | `server/routes/enterprisePortalRoutes.ts:1329`, `server/routes/enterpriseAuthRoutes.ts:110`, `client/src/App.tsx:186` |
| FD-002 | Enterprise management nav | Visible for superadmin | Hidden | `client/src/config/adminNavConfig.ts:126`, `client/src/config/adminNavConfig.ts:132`, `client/src/config/adminNavConfig.ts:982` |
| FD-003 | Billing/invoices/subscriptions consoles | Enabled | Hidden/disabled in UI | `client/src/config/adminNavConfig.ts:542`, `client/src/config/adminNavConfig.ts:571`, `client/src/config/adminNavConfig.ts:803`, `client/src/config/adminNavConfig.ts:1057` |
| FD-004 | Payment integration admin APIs | Enabled | Blocked by mode/flag | `server/routes/superAdminRoutes.ts:34`, `server/routes/superAdminRoutes.ts:60`, `server/featureFlags.ts:67`, `server/featureFlags.ts:69` |
| FD-005 | CustSuper platform management section | N/A | Onprem-only section | `client/src/config/adminNavConfig.ts:331`, `client/src/config/adminNavConfig.ts:336`, `client/src/config/adminNavConfig.ts:1022` |
| FD-006 | Onprem license management | N/A | Enabled | `client/src/App.tsx:237`, `server/routes/onpremLicenseRoutes.ts:36`, `server/routes/onpremLicenseRoutes.ts:251` |
| FD-007 | Enrollment reconciliation (`/admin/enrollment-management`) | N/A/denied | Enabled | `client/src/App.tsx:235`, `server/routes/adminRoutes.ts:8066`, `server/routes/adminRoutes.ts:8068`, `server/routes/adminRoutes.ts:8350` |
| FD-008 | Organization boundary model | Fully isolated per organization (no inter-org assignment/sharing) | Inter-org course sharing and assignment allowed via explicit rules | `client/src/pages/InterOrgConfig.tsx:292`, `server/routes/adminRoutes.ts:377`, `server/routes/adminRoutes.ts:387`, `server/routes/courseRoutes.ts:4169` |
| FD-009 | Course transfer/export-import APIs | Rejected | Enabled | `server/routes/courseRoutes.ts:1701`, `server/routes/courseRoutes.ts:1702`, `server/routes/courseRoutes.ts:1723` |
| FD-010 | Course purchase flow | `/checkout` payment flow | `/onprem-enroll` payment-bypass flow | `client/src/pages/CoursePurchase.tsx:89`, `client/src/pages/CoursePurchase.tsx:101`, `server/routes/paymentsRoutes.ts:422`, `server/routes/paymentsRoutes.ts:424` |
| FD-011 | `custsuper` role access | Not functional as top-level role | Functional top-level role | `client/src/components/ProtectedRoute.tsx:29`, `client/src/components/ProtectedRoute.tsx:30`, `server/adminAuth.ts:205` |
| FD-012 | Registration/login policy | Standard cloud auth behavior | License and system-type dependent restrictions | `server/routes/authRoutes.ts:99`, `server/routes/authRoutes.ts:112`, `server/routes/authRoutes.ts:283`, `server/routes/authRoutes.ts:718` |
| FD-013 | Credits + subscription economics | LPC purchase flows active (user/org wallets), org subscription billing required | No user LPC purchase requirement and no mandatory monthly org subscription billing requirement | `server/featureFlags.ts:69`, `client/src/config/adminNavConfig.ts:542`, `client/src/config/adminNavConfig.ts:571`, `client/src/pages/CoursePurchase.tsx:89`, `server/routes/superAdminRoutes.ts:34` |
| FD-014 | Onprem track-based learner login policy | N/A | Learner users may login only on onprem `production` track; `development`/`qa(acc)` tracks block learner login even when licensed | `server/services/onpremLicensePolicy.ts:45`, `server/services/onpremLicensePolicy.ts:96`, `server/routes/authRoutes.ts:754` |
| FD-015 | White-label/theme entitlement model | Available by default (no license restriction) | Disabled when onprem system is unlicensed; branding/theme APIs hard-blocked | `server/brandingRoutes.ts:585`, `server/brandingRoutes.ts:591`, `server/services/onpremLicensePolicy.ts:45` |
| FD-016 | Onprem cloud check-in/license governance | N/A | Onprem check-ins sync metrics/status to cloud PRD and renew/apply licenses per cloud policy/approvals | `server/services/onpremLicenseScheduler.ts:53`, `server/services/onpremLicenseSyncService.ts:92`, `server/routes/enterprisePortalRoutes.ts:2691`, `server/routes/onpremLicenseRoutes.ts:952` |

## Open Ambiguities (Needs Follow-Up)
1. Enterprise UI pages are routed client-side even when onprem APIs are not mounted, creating likely dead-end journeys on onprem.
Evidence: `client/src/App.tsx:186`, `server/routes/enterprisePortalRoutes.ts:1329`, `server/routes/enterpriseAuthRoutes.ts:110`.
2. Enterprise revenue export route registration appears inconsistent with mode guards and may be unreachable.
Evidence: `server/routes/enterpriseRevenueRoutes.ts:17`, `server/routes/enterpriseRevenueRoutes.ts:24`, `server/routes/enterpriseRevenueRoutes.ts:29`.

## Mandatory Use In Audit Waves
1. Every wave must reference this matrix when constructing role-journey test coverage.
2. Any new variant-specific behavior must be added here before wave closure.
3. Any mismatch with this matrix is a finding (`P1` minimum, `P0` if critical flow breakage).
