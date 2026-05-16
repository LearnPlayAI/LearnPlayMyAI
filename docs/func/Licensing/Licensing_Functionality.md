# Licensing Functionality

## About
This document describes the LearnPlay licensing behavior between onprem systems (DEV, ACC, PRD) and cloud PRD licensing management (SuperAdmin portal).

It is functional and human-readable. It explains expected behavior, business rules, and integration flow.

## Unlicensed System Restrictions (Onprem DEV/ACC/PRD)

### Onprem DEV (`development`) when unlicensed
- Maximum `1` registered organization can exist on the system.
- Maximum `1` CustSuper user can exist system-wide.
- Per organization role caps are enforced:
  - maximum `2` Org Admin users,
  - maximum `2` Trainer/Instructor/Team Lead users,
  - maximum `0` learner users.
- Learner registration is disabled.
- Branding and white-label administration is disabled.
- System may not receive or install any update packages while unlicensed.
- Login lock mode applies after unlicensed grace expiry:
  - for the first 30 days after install anchor, logins are allowed,
  - after grace expiry, only CustSuper can login until licensing is completed.
- If clock tampering/system time rollback is detected, only CustSuper can login until remediation/revalidation.
- System remains in unlicensed/deactivated state and surfaces cloud-provided reason where available.

### Onprem ACC (`qa`) when unlicensed
- Maximum `1` registered organization can exist on the system.
- Maximum `1` CustSuper user can exist system-wide.
- Per organization role caps are enforced:
  - maximum `2` Org Admin users,
  - maximum `2` Trainer/Instructor/Team Lead users,
  - maximum `0` learner users.
- Learner registration is disabled.
- Branding and white-label administration is disabled.
- System may not receive or install any update packages while unlicensed.
- Login lock mode applies after unlicensed grace expiry:
  - for the first 30 days after install anchor, logins are allowed,
  - after grace expiry, only CustSuper can login until licensing is completed.
- If clock tampering/system time rollback is detected, only CustSuper can login until remediation/revalidation.
- System remains in unlicensed/deactivated state and surfaces cloud-provided reason where available.

### Onprem PRD (`production`) when unlicensed
- Maximum `1` registered organization can exist on the system.
- Maximum `1` CustSuper user can exist system-wide.
- Per organization role caps are enforced:
  - maximum `2` Org Admin users,
  - maximum `2` Trainer/Instructor/Team Lead users,
  - maximum `0` learner users.
- Learner registration is disabled.
- Branding and white-label administration is disabled.
- System may not receive or install any update packages while unlicensed.
- Login lock mode applies after unlicensed grace expiry:
  - for the first 30 days after install anchor, logins are allowed,
  - after grace expiry, only CustSuper can login until licensing is completed.
- If clock tampering/system time rollback is detected, only CustSuper can login until remediation/revalidation.
- System remains in unlicensed/deactivated state and surfaces cloud-provided reason where available.

## Licensed System Unlocks (Onprem DEV/ACC/PRD)

### Onprem DEV (`development`) when licensed
- System is recognized as licensed for the `development` track.
- Organization and admin/instructor caps from unlicensed mode are removed.
- Branding and white-label administration is enabled.
- Ongoing renewal/check-in lifecycle operates under policy and billing rules.
- Important non-production rule: learner users remain disabled on DEV even when licensed.

### Onprem ACC (`qa`) when licensed
- System is recognized as licensed for the `qa` track.
- Organization and admin/instructor caps from unlicensed mode are removed.
- Branding and white-label administration is enabled.
- Ongoing renewal/check-in lifecycle operates under policy and billing rules.
- Important non-production rule: learner users remain disabled on ACC even when licensed.

### Onprem PRD (`production`) when licensed
- System is recognized as licensed for the `production` track.
- Organization and role caps from unlicensed mode are removed.
- Learner registration and learner role usage are enabled.
- Branding and white-label administration is enabled.
- Ongoing renewal/check-in lifecycle operates under policy and billing rules.

## Terminology and Track Mapping
- Onprem `DEV` = `development`
- Onprem `ACC` = `qa`
- Onprem `PRD` = `production`
- Cloud PRD licensing management = SuperAdmin control-plane for customer licensing policy and lifecycle

## Functional Feature Set
- `LIC-F01`: Automated onprem licensing lifecycle
- `LIC-F02`: Track-bound license enforcement (DEV/ACC/PRD)
- `LIC-F03`: Business profile sync and licensing preconditions
- `LIC-F04`: Policy-driven approval and issuance (billing aware)
- `LIC-F05`: SuperAdmin policy save/persistence
- `LIC-F06`: Manual SuperAdmin activation/deactivation controls
- `LIC-F07`: Customer suspension cascade behavior
- `LIC-F08`: Customer/system license visibility in cloud portal
- `LIC-F09`: Per-system royalty settings

## Current Implemented Behavior

### LIC-F01: Automated onprem lifecycle
- Manual request export/import as a normal operating path is retired.
- Onprem now uses cloud sync and check-in flow for bootstrap and renewal.
- After Business Information (Cloud Sync) is saved and complete, onprem can immediately check in and install returned license updates.
- Onprem check-in exchanges telemetry and receives renewal/bootstrap keys when policy allows.

### LIC-F02: Track-bound enforcement
- License payload must match the system track (`development`, `qa`, `production`).
- Hardware key and hostname must match the receiving onprem system.
- Mismatched track/system identity is rejected.
- Unlicensed onprem systems must reject update package install/apply actions until a valid license is active.

### LIC-F03: Business profile and sync status
- Business profile completeness is required before licensing check-in.
- If business identity changes require reissue, check-in is blocked until replacement licensing is approved.
- Onprem stores remote status and reason from cloud, and this reason is shown in unlicensed/deactivated states.

### LIC-F04: Policy-driven approval and issuance
- All tracks (DEV/ACC/PRD) use the same policy logic:
  - If monthly fee is zero, licensing can auto-approve/auto-issue.
  - If monthly fee is greater than zero and billing is `paid` or `waived`, licensing can auto-approve/auto-issue.
  - If monthly fee is greater than zero and billing is not settled, approval/activation remains controlled by SuperAdmin.
- Auto-renewal requires approved request, auto-renew enabled, and billing state that allows renewal.

### LIC-F05: SuperAdmin policy persistence
- SuperAdmin policy changes on customer detail page persist and hydrate correctly:
  - Monthly Fee
  - Currency
  - Grace Days
  - Billing Status
  - Auto-Approve Renewals
- Monthly Fee input accepts comma or dot decimal delimiter and is normalized to 2 decimals for policy values.

### LIC-F06: Manual activation/deactivation controls
- SuperAdmin has per-system actions:
  - Activate License
  - Deactivate License
- Deactivation requires a reason.
- Activation/deactivation attempts immediate push to the customer onprem system.
- Onprem reflects deactivated state and surfaces the deactivation reason to customer-side administrators.

### LIC-F07: Suspension cascade
- When a customer is suspended in cloud PRD:
  - all linked system licenses are deactivated,
  - active keys are revoked,
  - deactivation is pushed to customer systems.
- Suspended customers are blocked from normal licensing access until reactivated.

### LIC-F08: Cloud visibility improvements
- Enterprise customer list now exposes per-track license state badges:
  - DEV Active/Inactive
  - ACC Active/Inactive
  - PRD Active/Inactive
- Badge color convention:
  - Active = green
  - Inactive = red

### LIC-F09: Royalty setting placement
- Royalty setting is managed per system license policy on Customer Details.
- Royalty input is removed from generic customer edit page.
- Telemetry royalty calculations use per-system royalty configuration (with fallback behavior where needed).

## DEV/ACC/PRD Rule Summary

### DEV (`development`)
- Non-production track.
- Learner usage remains restricted by non-production policy.
- Auto-license behavior follows billing policy rules above.

### ACC (`qa`)
- Non-production acceptance track.
- Learner usage remains restricted by non-production policy.
- Auto-license behavior follows billing policy rules above.

### PRD (`production`)
- Production track for customer runtime.
- Normal licensed production behavior when active.
- Auto-license behavior follows billing policy rules above.

## Integration Points
- Cloud PRD SuperAdmin Licensing Portal:
  - customer/system policy management,
  - approval and key lifecycle,
  - manual activate/deactivate operations,
  - suspension controls.
- Onprem License Management:
  - business info sync,
  - check-in operations,
  - license state updates from cloud push and check-in.
- Onprem/Cloud push channel:
  - signed push updates for immediate activation/deactivation propagation.
- Telemetry sync:
  - onprem uploads usage/organization metrics during check-ins.

## Assumptions and Out of Scope
- This document describes functional behavior; low-level cryptographic internals are out of scope.
- Legacy/manual licensing artifacts may still exist in code for compatibility but are no longer the required operating process.

## Change Summary
- 2026-03-24: Added explicit rule that unlicensed onprem systems (DEV/ACC/PRD) cannot receive or install update packages.
- 2026-03-24: Expanded top-of-file licensing matrix with explicit unlicensed limitations and licensed unlock behavior per onprem track (DEV/ACC/PRD), including role/org caps, learner rules, branding gate, and lock-mode behavior.
- 2026-03-22: Updated for automated licensing flow, retired manual operating path, billing-aware auto-approval, manual activate/deactivate controls, suspension cascade, track status badges, and per-system royalty policy.
- 2026-03-22: Initial baseline created.
