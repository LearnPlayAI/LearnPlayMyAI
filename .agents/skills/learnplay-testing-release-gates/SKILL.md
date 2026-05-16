---
name: learnplay-testing-release-gates
description: LearnPlay validation and release gating standards. Use for defining and executing test matrices, smoke checks, and completion criteria before merge/deploy.
---

# LearnPlay Testing And Release Gates

## When To Use
- Use for every substantial change and every release-impacting update.

## Required Workflow
1. Define deterministic validation matrix before implementation, including required role x journey x variant coverage.
2. Ensure data readiness before testing; if missing, generate deterministic DEV seed data/users/orgs and record scripts used.
3. Execute typecheck, targeted tests, and domain-specific audits.
4. Run smoke matrix for user-visible runtime behavior across all in-scope variants (`cloud` and `onprem` by default).
5. Execute user-journey matrix tests per role per variant; record step-level status as `pass/fail/blocked` with evidence links.
6. For UI/runtime flows under active user testing, provide explicit user-executed E2E test steps and use screenshot evidence as a required release-gate input.
7. After each implementation/retest wave, publish cloud/onprem feature-diff notes covering parity, intentional deltas, known gaps, and owners.
8. Record matrix evidence and per-wave feature-diff notes in TODO and changelog before closure.
9. Validate theme-resolution routing in every in-scope variant:
   - unauthenticated pages resolve to active platform default theme
   - authenticated pages resolve to active org theme for authenticated org context

## User Screenshot UAT Loop
- Build manual test steps with: preconditions, exact actions, expected outcomes, and failure-capture instructions.
- On each user screenshot finding, classify step result as `pass/fail/blocked`, map to probable code path, and prioritize fixes.
- After patching, issue retest steps that target the failed path plus adjacent regression paths.
- Include a reusable screenshot-analysis prompt template in completion output for rapid follow-up cycles.
- Do not mark closure until user confirms pass on the final retest cycle.

## Role-Variant Matrix Gate (Mandatory)
- Do not mark validation complete unless every required role has at least one critical user journey executed in every in-scope variant.
- Minimum matrix dimensions: `role`, `journey`, `variant`, `environment/build`, `result`, `evidence`, `defect-id`.
- Any `fail/blocked` matrix row must enter the defect loop and remain open until retest evidence shows `pass`.
- If a row is intentionally out of scope, record waiver reason and approver.
- Include explicit matrix rows for `unauth platform-theme resolution` and `auth org-theme resolution` per variant.

## Autonomous Browser Agent Testing (CDP Environment)
When acting autonomously as a browser agent testing the UI in this DEV environment, you MUST use the workspace-local CDP routing to bypass host TLS constraints. Follow this strictly:

1. **Mandatory Deployment Gate:** Before running any automated AI browser agent tests to verify your changes, you MUST deploy those changes to the DEV runtime environments (both `cloud` and `onprem`). Use the established `devadmin` tools/scripts on this host to execute the deployment. Testing before deployment will yield false results as the environment won't reflect the new code.
2. **Start Workspace CDP:** Do not rely on isolated subagent sandboxes. Start Chrome natively in the workspace:
   `CDP_PORT=9222 /antigravity/scripts/start-workspace-cdp.sh` (run in background or separate shell)
3. **Verify and Extract Endpoint:** Ensure CDP is live and extract the `webSocketDebuggerUrl`:
   `/antigravity/scripts/check-workspace-cdp.sh 9222`
   `curl -fsS http://127.0.0.1:9222/json/version`
4. **Attach Browser Subagent:** Dispatch your `browser_subagent` task with explicit instructions to **ATTACH** to the running `ws://127.0.0.1:9222/devtools/...` endpoint using its internal tools.
   - **Do NOT** use `run-ui-agent` wrapper commands.
   - **Do NOT** auto-generate or use pre-created Playwright test files. Let the subagent control the attached session dynamically.

## References
- `references/validation-matrix-template.md`
- `references/release-readiness.md`
