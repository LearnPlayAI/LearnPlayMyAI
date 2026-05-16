# lppadmin Complete Overhaul Plan

## 1. Purpose and Outcome
This plan defines a full replacement of the current `lppadmin` tooling with `lppadmin` (executed as `lppadmin`) to provide:

- zero hardcoded runtime values
- environment/variant/stage awareness
- SAP-like DEV/ACC/PRD operational landscape controls
- robust, auditable operations with full command output visibility
- end-to-end consistency across installers, updaters, DR, and runtime app behavior

This is a clean-cut implementation for clean OS hosts. No legacy fallback mode will be implemented.

## 2. Landscape and Governance Model

### 2.1 Dimensions
All behavior is governed by:

- `variant`: `cloud` or `onprem`
- `stage`: `development`, `testing`, `production`

Mapping:

- DEV -> `development`
- ACC -> `testing`
- PRD -> `production`

### 2.2 Operational intent

- DEV: integration/testing of updates and functionality
- ACC: pre-production acceptance gate and full system testing
- PRD: productive user operations only

### 2.3 OnPrem customer model
OnPrem customers are operators/administrators, not LearnPlay platform developers:

- no source build/developer workflows in onprem runtime admin menus
- BYO infrastructure and credentials (AI/Gamma/SMTP/etc.)
- strict stage policy enforcement for DEV/ACC/PRD runtime usage
- no `devadmin` features, workflows, or build capabilities on customer-hosted onprem systems
- customer-onprem systems never use YOCO payment integrations
- customer-onprem systems never purchase LPC credits
- customer-onprem systems rely on their own API keys/infrastructure to operate features

Internal LearnPlay onprem landscapes (DEV/ACC/PRD used by LearnPlay engineering) remain allowed to use `devadmin` for build/test/release preparation.

### 2.4 Mandatory variant isolation (hard requirement)
OnPrem systems must never have access to cloud features in `lppadmin` or any related scripts/tools.

Mandatory controls:

- OnPrem runtime loads only onprem modules; cloud modules are not loaded.
- OnPrem menus must not display cloud-only actions.
- OnPrem command dispatcher must reject cloud commands (fail closed).
- OnPrem package/install/update/DR artifacts must include only onprem toolchains.
- Customer-hosted onprem systems must never expose `devadmin` menus/actions/build commands.
- LearnPlay-internal onprem engineering systems may expose `devadmin` according to internal policy.
- ALM actions on onprem are constrained to onprem DEV/ACC/PRD track only.
- Health checks must include a variant-isolation check and fail on leakage.
- Hostname change operations are not permitted in tooling; migration requires DR restore to a new host.

## 3. Licensing Expansion (Critical)

## 3.1 New license stage claim
License model expands from binary to tri-stage:

- `development`
- `testing`
- `production`

Each onprem system must match license stage exactly.

### 3.1.1 Internal OnPrem special license class
LearnPlay internal onprem systems require a special internal license class that is not available to customer-onprem operators.

Required tooling behavior:

- `devadmin` can generate internal-onprem licenses.
- `lppadmin` can import internal-onprem licenses to internal onprem systems on any host.
- customer-onprem systems cannot import or use internal-onprem special licenses.

## 3.2 Stage-match enforcement

- DEV host accepts only `development` licenses
- ACC host accepts only `testing` licenses
- PRD host accepts only `production` licenses

Mismatch results in blocked protected operations and explicit admin error.

Offline licensing policy:

- offline license capability is allowed only for LearnPlay-internal onprem systems.
- customer-onprem systems do not get offline license capability.

## 3.3 ACC license implications
ACC has production-grade entitlement checks (same as PRD), plus mandatory non-productive constraints.

### Required ACC UI behavior
Global, always-visible, non-dismissible banner:

- `TEST SYSTEM - LICENSED` when valid testing license
- `TEST SYSTEM - UNLICENSED` when missing/invalid/expired

Banner must be visible across all pages and roles.

### Required ACC non-productive enforcement
Server-side safeguards (not UI-only):

- block production-only external actions (live settlements/payouts/live webhooks where applicable)
- force test mode for supported integrations
- mark generated artifacts in ACC as test/non-production where relevant
- optional safeguards to discourage productive use (policy controlled)

OnPrem payment/credit constraints:

- customer-onprem ACC/PRD/DEV must never expose YOCO operations
- customer-onprem ACC/PRD/DEV must never expose LPC credit purchase operations

## 4. lppadmin Product Requirements

## 4.1 UX and navigation

- clean, deep, consistent menu hierarchy
- no mixed back keys (`b` only for back everywhere)
- fixed controls globally: `b` back, `h` help, `x` exit, `/` filter
- readable spacing, no cramped/overflowing table rows
- breadcrumb and context shown on every screen

## 4.2 Output and audit requirements
Every action must provide:

- live streaming terminal output (stdout/stderr)
- persisted raw command logs
- human-readable summary at end
- machine-readable action record (JSON)

Summary fields must include:

- action name, variant, stage, host, scope
- command count, success/fail/warn counts
- elapsed time
- log file paths
- next-step hints

## 4.4 Variant-safe execution boundaries

- Every action is tagged `cloud-only`, `onprem-only`, or `shared`.
- Runtime policy must enforce tag compatibility with selected variant before execution.
- Attempting cloud-only action on onprem returns a hard block with auditable reason.
- Shared actions must branch to variant-specific implementations internally.
- `devadmin` build/pipeline actions are blocked on customer-hosted onprem systems.
- `devadmin` build/pipeline actions are allowed on LearnPlay-internal onprem engineering systems.

## 4.3 No hardcoded runtime values
`lppadmin` must discover from runtime state and policy files:

- app root
- service names
- database name/user/host from `DATABASE_URL`
- active ports/domains
- backup root
- staged package paths
- required secret policy by variant/stage/features

Hardcoded defaults allowed only in install-time policy templates, not operational execution paths.

## 4.5 Required API key enforcement

- system readiness gates block runtime start/use when required API keys are missing for enabled capabilities.
- enforcement applies at installation time and at ongoing admin health/preflight checks.
- only cloud systems require YOCO-related secrets.

## 5. Target Menu Structure (v2)

```text
Home
  1) Variant
     1) Cloud
     2) OnPrem

  2) Stage
     1) DEV (development)
     2) ACC (testing)
     3) PRD (production)

  3) Context
     1) Show detected runtime context
     2) Refresh context detection
     3) Profile health check
     4) Export context report

  4) Operations
     1) Services
     2) Security (Secrets/TLS/Access)
     3) Database
     4) Environment (.env)
     5) Application Health
     6) Backup/Restore

  5) Release & Updates
     1) Preflight
     2) Apply update (full/app-db/admin-only)
     3) Rollback
     4) Package verification

  6) DR (Disaster Recovery)
     1) Create DR bundle
     2) Verify DR bundle
     3) Restore (local/remote)
     4) Post-check and report

  7) ALM Landscape
     1) DEV/ACC/PRD drift compare
     2) Promotion gates
     3) Target connectivity and policy checks

  8) Reports & Audit
     1) Action history
     2) Security audit
     3) Operational summary export

  9) Settings
     1) Runtime policy
     2) Logging policy
     3) UI settings

  h) Help
  b) Back
  x) Exit
```

Notes:

- OnPrem menus exclude all cloud-only actions and wording.
- Customer-hosted OnPrem menus exclude all `devadmin` build/update-pipeline actions.
- LearnPlay-internal OnPrem engineering menus may include `devadmin` integration points.
- Cloud menus exclude onprem-only internal operations.
- Shared menu labels remain identical; behavior is variant-resolved by policy.

## 6. Technical Architecture

## 6.1 Modular structure
Proposed tree:

- `scripts/lppadmin/lppadmin.sh` (entrypoint)
- `scripts/lppadmin/core/`
  - `context.sh`
  - `menu.sh`
  - `runner.sh`
  - `env.sh`
  - `policy.sh`
  - `render.sh`
  - `audit.sh`
- `scripts/lppadmin/modules/`
  - `services.sh`
  - `security.sh`
  - `database.sh`
  - `updates.sh`
  - `dr.sh`
  - `alm.sh`
  - `reports.sh`
- `scripts/lppadmin/policies/`
  - `cloud-development.yaml`
  - `cloud-testing.yaml`
  - `cloud-production.yaml`
  - `onprem-development.yaml`
  - `onprem-testing.yaml`
  - `onprem-production.yaml`

## 6.2 Execution runner contract
All commands execute through one runner API:

- step label
- command
- expected impact/risk
- timeout
- capture paths

Runner outputs:

- live terminal stream
- structured step status
- command transcript
- summary aggregation

## 6.3 Policy engine
Policy controls by `(variant, stage)`:

- allowed/disallowed actions
- required preconditions
- required secrets/features
- mandatory confirmations
- mandatory post-check gates

Policy also enforces variant isolation:

- module allowlist per variant
- command allowlist per variant
- script path allowlist per variant
- forbidden cross-variant calls
- explicit `devadmin` denylist for customer-hosted onprem
- explicit `devadmin` allow policy for LearnPlay-internal onprem engineering systems

## 7. Installer and Updater Overhaul

## 7.1 Installer changes
Both cloud and onprem installers must:

- require explicit `variant` and `stage`
- stamp immutable runtime identity marker with stage
- write stage-aware policy selection
- configure paths strictly under:
  - `/opt/learnplay/<variant>`
  - `/opt/lpdb/<variant>`

For onprem, installer validates BYO integrations based on enabled features.
For onprem, installer must not install cloud admin modules/scripts.
For customer-hosted onprem, installer must not install `devadmin` build/pipeline tooling.
For LearnPlay-internal onprem engineering systems, installer/profile may enable `devadmin` tooling.
Installer must enforce immutable hostname policy (no hostname change operations after install).

## 7.2 Updater changes
Updater must:

- validate package signature/hash/provenance
- enforce stage/license compatibility
- block risky operations per stage policy
- always run preflight and post-check
- produce rollback points and machine-readable execution report

Updater must additionally validate variant-safe package composition:

- onprem updater rejects packages containing cloud-only admin modules
- cloud updater rejects packages containing onprem-only module paths where disallowed
- mixed-variant payload execution is blocked

## 7.3 ALM promotion gates
Promotion requirements:

- same package hash promoted DEV -> ACC -> PRD
- mandatory gate evidence from ACC before PRD promotion
- stored gate report with timestamp and operator identity

## 8. DR Integration

DR tools must become stage-aware and variant-aware:

- DR bundle metadata includes variant/stage/license context
- restore requires target stage confirmation
- post-restore verifies stage policy + license stage match
- ACC restored systems must show mandatory TEST banner and non-productive restrictions

Variant isolation in DR:

- onprem DR supports only onprem backup/restore flows
- onprem DR bundle/restore path excludes cloud-only tooling
- restore preflight validates bundle variant equals target variant
- post-restore asserts no cross-variant admin module leakage
- DR bundles/restores must never include `devadmin` tools or source code in target runtime.
- hostname changes are never performed; DR restores configure target host identity without renaming OS hostname.

## 9. Cloud Application-Level Changes

To support onprem ACC/testing behavior:

- extend license schema and validation to include `testing`
- expose stage in cloud license/admin management APIs
- update app runtime behavior to enforce ACC non-productive restrictions server-side
- provide universal stage/license status endpoint for lppadmin health checks

## 10. Data Contracts and Artifacts

## 10.1 Runtime identity marker
Example fields:

- `variant`
- `stage`
- `installedAt`
- `installedBy`
- `runtimeRoot`
- `policyProfile`

## 10.2 Action audit record
For each action:

- metadata (host, scope, operator, timestamp)
- step list
- command outputs
- result summary
- warning/failure details

## 10.3 Policy files
Policy files define:

- required secrets by capability
- stage-prohibited operations
- mandatory confirmations
- stage-specific validation checks

## 11. Delivery Plan (Implementation Phases)

## Phase 1: Foundation

- scaffold lppadmin core engine
- implement context detection and policy loading
- implement unified menu renderer and navigation conventions
- integrate runner with full output capture and summaries
- implement variant isolation guardrails (module/command/script allowlists)

Deliverable: navigable shell + context + runner + audit plumbing.

## Phase 2: Core Operations Modules

- Services, Security, Database, Environment, Health modules
- dynamic secret discovery and policy-driven validation
- remove hardcoded dev defaults from runtime operations
- enforce cloud-only/onprem-only module partitioning
- enforce no-devadmin-on-customer-onprem policy in menu and dispatcher
- enforce devadmin-allowed policy for LearnPlay-internal onprem engineering systems

Deliverable: daily operational parity with v1, policy-safe.

## Phase 3: Updates and ALM

- update preflight/apply/rollback modules
- package selection hardening (scope-specific only)
- DEV/ACC/PRD compare and promotion gate module
- enforce per-variant ALM tracks and block cross-variant orchestration

Deliverable: landscape-safe update workflows.

## Phase 4: DR and Licensing Stage Controls

- DR module policy integration
- license stage model integration in app + admin checks
- ACC banner and non-productive safeguards

Deliverable: compliant stage-governed runtime across landscapes.

## Phase 5: Hardening and Validation

- end-to-end test matrix across cloud/onprem DEV/ACC/PRD
- permission/ownership consistency tests
- documentation and operator runbooks

Deliverable: production-ready cutover.

## 12. Test and Acceptance Matrix

A full matrix will be executed for each variant/stage:

- install
- bootstrap
- secrets lifecycle
- update apply + rollback
- health checks
- ALM compare/gate
- DR create/restore/post-check
- license stage match/mismatch behavior
- internal-onprem special license generation/import flow validation
- customer-onprem rejection of internal-onprem special licenses
- offline-license allowed only for internal-onprem
- ACC banner and non-productive guard verification
- variant isolation verification (onprem has zero cloud-feature access)
- customer-onprem verification that no `devadmin` build capabilities are available
- internal-onprem verification that approved `devadmin` workflows are available
- customer-onprem verification that YOCO and LPC purchase operations are absent
- hostname immutability verification (no hostname-change operation in tooling)

Acceptance criteria:

- zero hardcoded runtime values in operational paths
- consistent menu and navigation semantics
- full command output visibility + summary + logs
- stage policy compliance enforced server-side
- successful end-to-end outcomes for all matrix scenarios
- onprem toolchain cannot invoke, display, or execute cloud-only features anywhere
- customer-onprem toolchain cannot invoke, display, or execute any `devadmin` workflows
- LearnPlay-internal onprem engineering toolchain can use approved `devadmin` workflows
- internal-onprem special licenses are generatable via devadmin and importable via lppadmin
- customer-onprem systems reject internal-onprem special licenses
- offline licensing is available only to internal-onprem systems
- customer-onprem systems expose no YOCO or LPC purchase capability
- runtime/tooling provides no hostname-change operation

## 13. Risks and Mitigations

- Risk: scope creep from parallel v1 behavior parity
  - Mitigation: strict phase gates and contract-driven module replacement
- Risk: accidental productive use of ACC
  - Mitigation: mandatory banner + server-side action blocks + policy gates
- Risk: config drift across landscapes
  - Mitigation: ALM drift compare + promotion evidence requirements

## 14. Execution Notes

- This is a full replacement strategy.
- Existing v1 behavior will not be preserved via fallback mode.
- Implementation will proceed only after plan approval.
