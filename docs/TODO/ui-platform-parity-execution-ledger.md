# UI Platform Parity Execution Ledger

## Mission
- Deliver production-ready UI/UX parity across cloud + onprem pages.
- Ensure Brand/Theme Editor propagation aligns with UI primitives and rendered pages.
- Close accessibility/theme regression classes and impersonation cross-domain leakage.

## Parallel Tracks Completed
- Project Manager: execution ledger + evidence structure.
- Technical Architect: token/theme pipeline root-cause audit.
- UI/UX Expert: platform page drift audit and hotspot ranking.
- UI Systems Engineer: semantic-token primitive guardrail hardening + tests.
- Accessibility Specialist: contrast pipeline authored-token preservation + tests.
- UI Tester: smoke/tooling matrix and command inventory.
- Functional Tester: impersonation cross-domain regression suite expansion.
- Release Engineer: rollout and rollback command matrix.
- Root-cause Investigator: impersonation stale-org leakage and parity-risk analysis.

## Subsystem Diff Summary
- Theme primitive guardrails:
  - Strips legacy semantic wrappers from primitive class overrides (`hsl(var(--...))`, `rgba(var(--...))`, etc).
  - Added static parity test preventing reintroduction in `client/src/components/ui/**`.
- Theme palette accessibility/persistence:
  - `enforcePaletteCoreTokens` now preserves already-accessible authored companion tokens instead of blindly resetting to defaults.
  - Contrast candidate list now clones per call, preventing cross-call candidate leakage.
  - Added tests for `skipKeys` durability and preserved accessible companion tokens.
- Theme token contract parity:
  - Added missing editor control for `--action-accent`.
  - Added missing generated tokens required by coverage contracts: `--btn-focus-ring`, `--nav-pill-active-bg`, `--filter-pill-disabled-bg`, `--email-header-bg`.
  - Added those tokens to required token contract for full parity (`REQUIRED_TOKEN_KEYS`).
- Impersonation root-cause fix (cloud/onprem shared path):
  - Legacy org projector now resolves effective org from impersonated -> primary -> first org, and clears stale legacy org fields when no effective org exists.
  - SuperAdmin end-impersonation explicitly rehydrates/clears legacy org fields.
  - Effective-org resolver no longer trusts stale `session.organizationId` fallback inside context-enabled branch unless it matches context organizations.
  - Added regression tests for stale-org fallback prevention.
- Impersonation regression coverage:
  - New cloud impersonation session contract suite and cache-invalidation suite.
  - Expanded theme API org-scope tests and credit-service impersonation auth coverage.

## Test Evidence
- Passed:
  - `npx jest --runInBand tests/themeEditorTokenCoverage.test.ts client/src/tests/themePaletteBuilder.test.ts client/src/tests/contrastUtils.test.ts`
  - `npx jest --runInBand client/src/tests/primitiveClassGuard.test.ts client/src/tests/uiPrimitiveSemanticTokenParity.test.ts`
  - `NODE_OPTIONS=--max-old-space-size=4096 npx jest --runInBand server/tests/impersonationCloudSessionContracts.test.ts server/tests/organizationCreditService.authorization.test.ts client/src/tests/impersonationQueryInvalidation.test.ts client/src/tests/themeEditorApi.test.ts`
  - `NODE_OPTIONS=--max-old-space-size=4096 npx jest --runInBand client/src/tests/PreviewParity.test.tsx`
  - `NODE_OPTIONS=--max-old-space-size=4096 npm run -s test:critical` (17 suites, 94 tests)
- Smoke matrix (public read/auth endpoints) executed and matched expected status codes on:
  - Cloud DEV: `https://stcloud.learnplay.co.za`
  - Cloud ACC: `https://acccl.learnplay.co.za`
  - Cloud PRD: `https://learnplay.co.za`
  - Onprem DEV: `https://stonprem.learnplay.co.za`
  - Onprem ACC: `https://accop.learnplay.co.za`
  - Onprem PRD: `https://prdop.learnplay.co.za`
- Not fully green:
  - `npm run -s check` fails in pre-existing db naming alignment checks outside this mission scope (legacy snake_case identifiers in updater/remediation scripts).

## Rollout Plan (Exact Commands)
```bash
set -euo pipefail

sudo devadmin env-show all
sudo devadmin validate-scope-isolation

sudo devadmin build-cloud
sudo devadmin build-onprem

CLOUD_PKG="$(basename "$(ls -1t /antigravity/packages/cloud/LP-CL-V*.tar.gz | head -1)")"
ONPREM_PKG="$(basename "$(ls -1t /antigravity/packages/onprem/LP-OP-V*.tar.gz | head -1)")"

sha256sum -c "/antigravity/packages/cloud/${CLOUD_PKG}.sha256"
sha256sum -c "/antigravity/packages/onprem/${ONPREM_PKG}.sha256"

sudo devadmin update-dev cloud --skip-build --package "$CLOUD_PKG"
sudo devadmin update-dev onprem --skip-build --package "$ONPREM_PKG"

sudo devadmin update-acc cloud --skip-build --package "$CLOUD_PKG"
sudo devadmin update-acc onprem --skip-build --package "$ONPREM_PKG"

sudo devadmin update-prd cloud --skip-build --package "$CLOUD_PKG"
sudo devadmin update-prd onprem --skip-build --package "$ONPREM_PKG"
```

## Rollback Plan
```bash
set -euo pipefail

CLOUD_ROLLBACK_PKG="<known-good LP-CL tar.gz>"
ONPREM_ROLLBACK_PKG="<known-good LP-OP tar.gz>"

sudo devadmin update-prd cloud --skip-build --package "$CLOUD_ROLLBACK_PKG"
sudo devadmin update-prd onprem --skip-build --package "$ONPREM_ROLLBACK_PKG"

sudo devadmin update-acc cloud --skip-build --package "$CLOUD_ROLLBACK_PKG"
sudo devadmin update-acc onprem --skip-build --package "$ONPREM_ROLLBACK_PKG"

sudo devadmin update-dev cloud --skip-build --package "$CLOUD_ROLLBACK_PKG"
sudo devadmin update-dev onprem --skip-build --package "$ONPREM_ROLLBACK_PKG"
```

## Post-Rollout Verification Checklist
- [ ] `lppadmin {cloud|onprem} parity-report` is product-correct on DEV/ACC/PRD.
- [ ] `lppadmin {cloud|onprem} health` is `OVERALL: HEALTHY` on DEV/ACC/PRD.
- [ ] Theme Editor org-scoped edits persist and propagate to rendered pages.
- [ ] SuperAdmin impersonation start/stop does not leak stale org context across domains.
- [ ] Public smoke endpoint matrix returns expected statuses for all six environments.

## Residual Risks (Near-Zero Target)
- `npm run check` still reports pre-existing naming-alignment debt outside this implementation cycle; does not affect the changed runtime behavior but remains governance debt.
- End-to-end browser-level impersonation/theme journeys remain partly manual (no full Playwright assertion suite yet).

## Human Summary
- We fixed real theme/accessibility and impersonation root causes, not cosmetic symptoms.
- We tightened token/primitive contracts and added tests so these classes of regressions are caught automatically.
- Cloud and onprem share these source paths, so the fixes are parity-applied to both variants.
