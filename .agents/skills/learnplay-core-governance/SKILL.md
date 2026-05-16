---
name: learnplay-core-governance
description: Mandatory LearnPlay execution governance for all tasks. Use first for every task to apply priority rules, scope policy, root-cause policy, and preflight checks before any code or deployment action.
---

# LearnPlay Core Governance

## When To Use
- Use this skill first for every LearnPlay task.

## Required Preflight
1. Restate goal in plain language.
2. Treat `/antigravity/Cloud-On-Prem` as the single development workspace for all source changes. Never edit cloud, onprem, DEV, ACC, or PRD runtime trees directly; changes roll outward only through the approved package build and deployment steps.
3. Determine scope: cloud + onprem by default unless explicitly limited.
   - References to cloud PRD, cloud ACC, cloud DEV, onprem PRD, onprem ACC, or onprem DEV describe target runtime behavior, not the place to make source edits.
   - Cloud PRD can be the operational source of truth for authority-side business data such as onprem license management, while `/antigravity/Cloud-On-Prem` remains the source-code authority.
4. Run direct + indirect impact stocktake before proposing implementation.
5. Identify root cause from code paths; do not implement workaround-only fixes.
6. Define validation matrix and expert review plan before editing.
7. Before any testing of changes, deploy latest source changes to both DEV runtimes using devadmin tools/scripts:
   - Cloud DEV: `https://stcloud.learnplay.co.za`
   - Onprem DEV: `https://stonprem.learnplay.co.za`
   - Required deployment path: host `devadmin` scripts/tools (for example `update-dev.sh` / `sudo devadmin update-dev ...`).

## Variant-Aware Role-Journey Audit (Required)
1. Build a role-journey matrix for both `cloud` and `onprem` before implementation.
2. Minimum roles: `superadmin`, `custsuper`, `orgadmin`, `teacher`, `student`, plus task-specific support/ops roles.
3. For each role, map end-to-end stages: `entry`, `auth`, `core task`, `error path`, `recovery`, `exit`.
4. Mark each matrix cell as `same`, `variant-specific`, or `not-applicable`, with code-path evidence.
5. Any variant-specific behavior must include explicit rationale and parity risk assessment.
6. No fix is complete until impacted journeys pass in both variants or a documented scope exception exists.

## Bootstrap Identity Baseline (Required)
1. Enforce cross-track bootstrap access identity for operational sweeps:
   - Email: `support@learnplay.co.za`
   - Cloud role: `superadmin`
   - Onprem role: `custsuper`
2. Bootstrap identity must be guaranteed in provisioning paths (`app-install`, `update`, and DEV setup flows where applicable).
3. Verify bootstrap login readiness on each active track (`dev`, `acc`, `prd`) per variant after deployment.
4. Record credential-policy evidence in wave output and do not close wave without role/track confirmation.

## Autonomous Execution Model (Default)
1. Use full autonomous execution for implementation waves unless the user explicitly requests a pause.
2. Do not stop at plans or partial fixes; continue through implementation, validation, deployment, re-audit, and closure.
3. Do not ask for approval between loop steps when the requested epic goal is clear and in scope.
4. Stop only when completion criteria are met: zero FAIL findings, zero blockers, and explicit cross-variant evidence.
5. For UI/theme waves, treat this loop as mandatory:
   - apply fix set
   - deploy to both DEV variants via devadmin tools/scripts
   - run browser UI validation on cloud and onprem
   - collect findings, screenshots, and pass/fail matrix
   - fix root causes and repeat
6. Keep both platform default and org theme coverage in each cycle; org validation must use impersonation context where applicable.
7. In theme-editor flows, execute full apply path: `AI Apply Theme/Palette -> Save -> Activate` before validating downstream pages.
8. UI validation must include broad interaction coverage (click all actionable controls in audited scope) and route coverage for unauthenticated + authenticated experiences.

## Hard Rules
- All source changes happen in `/antigravity/Cloud-On-Prem` first, regardless of which runtime exposed the issue. Runtime-specific fixes must still be implemented as source-controlled variant-aware code in this workspace.
- Treat user findings as signals; deterministically expand to related patterns.
- Recommendations must be fact-based and code-backed.
- Fixes are source-only in DEV flow; no runtime hotpatching.
- Run remediation loops until zero findings.
- Operate as an expert panel: split work into specialist tracks (audit, UX, API/data, security, performance, release), run in parallel, and integrate into one wave report.
- Remediation must run in cycles: `detect -> classify -> fix -> validate -> re-audit`.
- Each cycle must log: variant, role, journey stage, root cause, fix reference, validation evidence, and residual risk.
- A finding closes only when re-audit shows no regression on the same role-journey path across cloud and onprem (unless scope exception is documented).
- If required journeys are blocked by missing data/accounts, generate deterministic DEV test data and record provenance/scripts used.
- Ask for backups before any destructive action.
- After each implementation cycle, provide manual user test steps plus a reusable screenshot-analysis prompt template for follow-up evidence.
- DEV environment topology must be detected before deployment/testing:
  - Managed runtime DEV hosts use `/opt/learnplay/cloud` and `/opt/learnplay/onprem`, services `learnplay-cloud`/`learnplay-onprem`, ports `8000`/`9000`, and `devadmin update-dev ...`.
  - Codex/WSL workstation DEV uses source-local apps from `/antigravity/Cloud-On-Prem`, env files `.env.cloud.local`/`.env.onprem.local`, supervisor `scripts/dev-workspace/local-apps.sh`, and ports `8010`/`8020`; `/opt/learnplay/...` may not exist there.
  - This development host runs the workspace, Node.js, npm, Jest, TypeScript, package builds, and local app processes inside WSL/Linux. Do not use Windows-native Node or bundled Codex Windows runtime paths for LearnPlay tests; they can resolve the repo as `\\wsl.localhost\...` and break Jest/ts-jest resolution.
  - If `node`/`npm`/`npx` are missing in the shell, activate or install the WSL Node runtime via `bash scripts/dev-workspace/bootstrap-wsl-dev.sh node`; do not substitute Windows Node. Known WSL Node path on this host: `/home/lppadmin/.nvm/versions/node/v20.20.2/bin/node`.
  - Do not assume the managed `/opt/learnplay` runtime path exists on workstation DEV. Check `scripts/dev-workspace/local-apps.sh status all` and env files before attempting `devadmin update-dev`.
- No browser/manual validation is valid until the current change set is active in both relevant DEV variants. On managed runtime DEV this means deploying to `stcloud` and `stonprem`; on Codex/WSL workstation DEV this means restarting/ensuring both local apps on `8010` and `8020`.
- Browser/admin validation identity: `support@learnplay.co.za` is the shared LearnPlay support/admin user for both cloud and onprem validation flows, including impersonation where the role permits it. The password is a user-provided secret and must not be written into source-controlled files, logs, docs, tests, or committed knowledge.
- Runtime theme-resolution contract is mandatory across both variants:
  - Unauthenticated users must receive the active platform default theme.
  - Authenticated users must receive the active theme for their resolved authenticated organization context.

## References
- See `references/priority-and-scope.md` for P0/P1/P2 policy and scope defaults.
- See `references/preflight-checklist.md` for execution checklist.
- Use role-journey matrix format: `role x stage x variant x evidence x status`.
