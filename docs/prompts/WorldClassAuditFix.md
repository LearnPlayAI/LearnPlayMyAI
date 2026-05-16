# World-Class Audit & Remediation Prompt (Reusable Template)

Use this prompt when you want a complete, production-grade audit and fix rollout for any feature domain.

---

## Copyable Prompt Template

```text
Perform a comprehensive, production-grade, end-to-end audit and remediation for all issues related to: <FEATURE_DOMAIN>.

Use the following issue sources as mandatory input:
- Explicit issues I listed in this request
- Related evidence I attached (screenshots, logs, bug notes, tickets, docs)
- Any directly or indirectly related defects you discover during the audit

INITIAL EVIDENCE INGEST (MANDATORY FIRST STEP)
- First analyze all attached screenshots and annotations/comments in detail before coding.
- Produce a concise findings summary from screenshots (what is observed, impacted behavior, likely defect category, severity hint, open questions).
- Treat screenshot findings as primary context and use them to shape reproduction and test scenarios.
- Derive the feature domain(s) from screenshot evidence and your testing observations if <FEATURE_DOMAIN> is broad, ambiguous, or spans multiple domains.
- If multiple domains are implicated, explicitly list them and handle them as linked workstreams under one remediation plan.

IMPORTANT EXECUTION MODE
- Use multiple parallel agents/subtasks where useful (frontend, backend, data, QA, security, performance, accessibility, platform/SRE, and test engineering).
- Do not stop at analysis: implement fixes completely.
- Do not make cosmetic-only changes; prioritize correctness, reliability, consistency, and maintainability.
- Do not ask me to do manual investigation unless absolutely unavoidable; own the process end-to-end.

ENVIRONMENT SCOPE (MANDATORY)
- ALL fixes and validations must apply to both system variants: Cloud and OnPrem.
- You have full host access where both Cloud DEV and OnPrem DEV are running.
- Deploy fixes to both variants and verify behavior in both.
- Audit and address config, feature-flag, schema, cache, infra, and runtime differences between Cloud and OnPrem.
- Acceptance is complete only when both variants pass the same functional and regression criteria (unless a deviation is explicitly documented and approved).

AUDIT REQUIREMENTS
- Reproduce each reported issue and document: expected vs actual behavior.
- Trace full flow end-to-end:
  UI state -> API contracts -> backend orchestration -> DB queries -> version resolution -> cache/CDN/session state -> rendering/consumption.
- Validate domain invariants and define missing invariants.
- Identify systemic defects, including:
  - race conditions
  - stale reads/state sync drift
  - fallback leakage
  - locale/language normalization bugs
  - version-selection errors
  - permission/access boundary issues
  - hidden coupling across modules
- Include security/abuse-case review for relevant endpoints and access paths.
- Include accessibility and UX consistency review.
- Include performance impact analysis (query patterns, cache key design, payload sizes, rendering churn, hot paths).
- Explicitly compare Cloud vs OnPrem behavior parity.

IMPLEMENTATION STANDARDS
- Fix root causes, not symptoms.
- Unify core decision logic (selection, fallback, readiness, metadata resolution, etc.) into a single authoritative path or clearly layered contract used everywhere.
- Make fallback behavior explicit, deterministic, and testable.
- Ensure metadata and primary content remain context-consistent (e.g., same language/version/context across the full user journey).
- Add robust observability: structured logs, metrics, and diagnostics for resolution decisions.
- Add defensive guards for malformed inputs, missing versions, partial data, stale state, and edge transitions.
- Preserve backward compatibility where needed; document and justify contract changes.
- Ensure Cloud/OnPrem parity for logic, config defaults, and deployment outcomes.

TESTING & QUALITY BAR
- Add/upgrade unit, integration, contract, and E2E tests.
- Add regression tests for every fixed issue and every newly discovered related issue.
- Cover edge cases specific to <FEATURE_DOMAIN> (including partial availability, fallback boundaries, rapid context switching, concurrent updates, stale cache, and tenancy/isolation risks).
- Add negative/security tests for unauthorized or invalid access paths.
- Use deterministic fixtures for multi-state/multi-version scenarios.
- Run relevant suites on Cloud DEV and OnPrem DEV and provide parity results.

DEPLOYMENT & VALIDATION
- Deploy fixes to Cloud DEV and OnPrem DEV on this host.
- Run smoke + regression validation on both variants after deployment.
- If deployment steps differ per variant, document exact commands and outcomes.
- Capture and remediate environment-specific failures.

DELIVERABLE FORMAT (REQUIRED)
A) Executive Summary
- What was broken, why it mattered, and what is now guaranteed.

B) Complete Findings Register
- ID, severity, impacted area, reproducibility, root cause, evidence, and fix status.

C) Architecture/Logic Decisions
- Authoritative rules/spec for core domain decisions (selection/fallback/readiness/metadata/etc.).
- Cloud/OnPrem parity notes and any justified deviations.

D) Code Changes
- PR-style breakdown by module/file with rationale.
- Migrations/backfills/data repair scripts (if any).

E) Verification Results
- Test matrix, pass/fail, coverage changes, performance notes, security findings.
- Cloud vs OnPrem comparison table with evidence.
- Residual risks and why acceptable (if any).

F) Acceptance Checklist
- Explicit checklist proving all reported issues are fixed.
- Explicit checklist proving newly discovered related issues are fixed.
- Explicit confirmation that Cloud and OnPrem both meet acceptance criteria.

WORKING PRINCIPLES
- Be thorough and adversarial in validation.
- Prefer clarity over cleverness.
- Keep changes reviewable, but complete.
- If tradeoffs are required, document alternatives considered and reasons for final choice.

Do not start coding until you first produce a concise execution plan with parallel workstreams, then proceed immediately to implementation.
```

---

## Example Invocation

```text
ingest the world class remediation prompt in docs/prompts/WorldClassAuditFix.md and help me remediate all issues related to <FEATURE_DOMAIN>
```

## Example Feature Domain Values

- lesson artifacts language/version/readiness consistency
- assessment generation and grading integrity
- course publishing workflow and access controls
- certificate issuance and verification pipeline
- tenant-level branding and theming propagation
