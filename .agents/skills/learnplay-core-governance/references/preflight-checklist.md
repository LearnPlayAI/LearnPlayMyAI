# Preflight Checklist

1. Goal understood and confirmed.
2. Scope and variants identified.
3. Affected domains listed (UI, API, DB, scripts, runtime/deploy).
4. Root cause path found in code.
5. Edge cases listed.
6. Validation and review plan defined.
7. Role-journey matrix prepared for `cloud` and `onprem` (`role x stage x variant`).
8. Variant-specific deltas documented with rationale and parity risk.
9. Expert panel tracks assigned (audit, UX, API/data, security, performance, release).
10. Data readiness confirmed; deterministic DEV seed plan defined for missing users/orgs/content.
11. Remediation cycle owner, closure criteria, and re-audit evidence plan defined.
12. Bootstrap identity baseline verified for all active tracks (`dev`,`acc`,`prd`) and both variants (`cloud`,`onprem`) with required role mapping.
13. Mandatory deployment gate completed before testing: latest change set deployed to both DEV runtimes (`stcloud` + `stonprem`) using devadmin tools/scripts.
