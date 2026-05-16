# Validation Matrix Template

## Baseline Checks
- Compile: `npx tsc --noEmit`
- Unit/integration: targeted suites for changed domain
- Domain audits: UI/contract/security/perf checks as applicable

## Data Readiness
- Verify required accounts/roles/orgs/content exist for both variants.
- If data is missing, generate deterministic DEV seed data and capture script/command and timestamps.

## Mandatory Role x Journey x Variant Matrix
- Functional smoke: key user flows across cloud/onprem.
- User E2E (when applicable): user-executed manual test steps with step IDs, expected outcomes, and screenshot evidence for failed/blocked steps.
- Required columns: `wave`, `role`, `journey-id`, `journey-name`, `variant` (`cloud|onprem`), `env/build`, `step-id`, `result` (`pass|fail|blocked`), `evidence-link`, `defect-id`, `notes`.
- Coverage gate: every required `role + journey-id` must have a result in every in-scope variant.
- Defect loop tracking: each failed step tracked as `open -> fixed-awaiting-retest -> closed`.

## Mandatory Per-Wave Cloud/Onprem Feature-Diff Notes
- After each wave, record `feature-id`, `cloud-behavior`, `onprem-behavior`, `parity-status` (`same|intentional-diff|regression`), `impact`, `owner`, `follow-up`.
- Any `intentional-diff` or `regression` entry must include rationale and linked issue/ticket.
