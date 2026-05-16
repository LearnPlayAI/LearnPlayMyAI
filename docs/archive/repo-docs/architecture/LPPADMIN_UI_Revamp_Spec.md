# lppadmin UI Revamp Specification

Last Updated: 2026-03-10  
Owner: Platform Engineering  
Scope: Cloud + OnPrem (single lppadmin codebase)

## Status Snapshot
- Overall: `Completed`
- Phase 0 - Baseline and UX guardrails: `Completed`
- Phase 1 - Shared UI primitives and style tokens: `Completed`
- Phase 2 - Main menus and navigation upgrade: `Completed`
- Phase 3 - Action execution UX (progress, confirmations, errors): `Completed`
- Phase 4 - Accessibility, consistency checks, regression validation: `Completed`
- Rollout: `Completed (dev runtime)`

## Completion Notes (2026-03-10)
1. Added shared terminal UI primitives (dividers, status badges, context/status lines, menu key-hints, recent actions summary).
2. Upgraded plain-terminal menu rendering for readability and quick filtering (`/` search).
3. Added structured action impact confirmations with typed `YES` for high-risk operations.
4. Standardized action execution feedback and result summaries with explicit next-step guidance and log pointers.
5. Updated home menu context with live service status badges.
6. Performed regression smoke checks:
   - `cloud self-check` (OK)
   - `cloud parity-report` (OK)
   - `onprem backup-root-status` (OK)

## Objective
Upgrade terminal UX for `lppadmin` so it is easier to scan, safer to operate, and faster to use, without changing operational behavior.

## Non-Goals
- No rewrite to ncurses/full-screen TUI framework in this phase.
- No action/business-logic changes.
- No changes to cloud/onprem capability rules.

## Design Principles
1. Keep ops safe first: confirmation clarity and impact visibility.
2. Keep cognitive load low: consistent layout and wording.
3. Keep parity: same UI model for cloud and onprem.
4. Keep compatibility: graceful fallback on minimal terminals.
5. Keep scripts automation-safe: no break to non-interactive usage.

## Current-State Issues
1. Dense text block makes scanning slow.
2. Prompt and option formatting are inconsistent between screens.
3. Destructive actions do not always present impact in a structured way.
4. Error text is not consistently actionable.
5. Long-running actions have limited progress context.

## Target UX Information Architecture
Top frame on every interactive screen:
1. Product line: `LearnPlay Administration (lppadmin <version>)`
2. Context line: `Breadcrumb | Scope | Profile | Host`
3. Optional status line: service/health badges for top-level menus

Content frame:
1. Short menu purpose line
2. Action list with aligned number, title, and concise hint
3. Footer shortcut hints: `B Back`, `X Exit`, `/ Search` (where available)

## Visual System (Terminal-Safe)
Color tokens (ANSI):
1. Primary: cyan (headings, active context)
2. Success: green
3. Warning: yellow
4. Error: red
5. Muted/help text: dim white

Formatting tokens:
1. Section divider line
2. Bordered block for critical confirmations
3. Status badges in text form: `[OK]`, `[WARN]`, `[FAIL]`, `[INFO]`
4. Fixed prompt format: `Select action [1-6, B, X]:`

Fallback behavior:
1. If no color support, render plain text equivalents.
2. If no dialog/whiptail, maintain line-based menu and prompts.

## UX Components to Standardize
1. `ui_header(title, breadcrumb, scope, profile, host, version)`
2. `ui_section(title, description)`
3. `ui_menu_list(items...)` with aligned columns
4. `ui_prompt_allowed(prompt, allowed_values...)`
5. `ui_confirm_impact(title, scope, impact, downtime, rollback_note)`
6. `ui_step_progress(step, total, label)`
7. `ui_result(status, summary, next_steps, log_path)`
8. `ui_error(cause, impact, next_step, log_hint)`

## Screen-by-Screen Spec

### 1) Home Menu
Add:
1. Header with runtime context.
2. One-line explanation: "Choose an administrative area."
3. "Recent actions" (last 3 from journal) block.
4. Optional "System status" mini panel:
   - app service
   - db reachable
   - disk usage

### 2) Quick Actions
Add:
1. "Most used actions" section with clear, outcome-based names.
2. Each item hint starts with verb and expected result.
3. Optional shortcuts for frequent actions.

### 3) Guided Tasks
Add:
1. Workflow cards style (still text): "Goal", "Steps", "Typical duration".
2. Safety note when workflow includes restart/update.

### 4) Operations / Updates / Misc
Add:
1. Consistent list style and prompt text.
2. Inline labels for risk level where relevant.

### 5) Confirmation Screens
Replace plain yes/no with structured confirmation:
1. Action name
2. Scope and target paths/services
3. Potential downtime
4. Log path
5. Confirmation mode:
   - low risk: `[y/N]`
   - high risk: type `YES`

### 6) Action Execution
During multi-step tasks:
1. Step progress indicator: `Step 2/6`
2. Current command summary
3. Per-step result `[OK]/[FAIL]`
4. End summary block with:
   - overall result
   - failed step list
   - log and next step

### 7) Error Presentation
Standard error format:
1. Cause
2. Impact
3. Recommended operator action
4. Exact log file path

## Interaction Improvements
1. Global keys in menus: `B`, `X`, optionally `?` for quick help.
2. Optional "type-to-filter" menu command mode in plain terminal.
3. Input validation loop with helpful correction text.

## Safety and Consistency Rules
1. No action behavior changes in UI phase.
2. No shell command changes without explicit phase task.
3. All new UI helpers must be idempotent and side-effect free.
4. Keep existing exit codes and log writing unchanged.

## Phased Implementation Plan

### Phase 1: Shared UI primitives and theme
Deliverables:
1. New helper functions in `cloud/lppadmin.sh` for header/sections/prompts/results.
2. Terminal capability detection (`color`, `width`) and fallback logic.
3. Unified prompt + divider rendering.

Acceptance:
1. All menus render with common header and aligned prompts.
2. Works with/without color and with/without dialog/whiptail.

### Phase 2: Menu UX migration
Deliverables:
1. Migrate Home, Quick Actions, Guided Tasks, Operations, Updates, Misc screens.
2. Add context/help lines and consistent hint formatting.
3. Add recent-actions panel on Home.

Acceptance:
1. No menu regressions in command routing.
2. Faster scan path (subjective ops check).

### Phase 3: Confirmation + execution UX
Deliverables:
1. Standardized impact confirmation component.
2. Standardized step progress + per-step output wrapper.
3. Standardized result and error summary components.

Acceptance:
1. High-risk actions require explicit operator acknowledgment.
2. Every action end shows summary + log path.

### Phase 4: QA and hardening
Deliverables:
1. Regression matrix for cloud/onprem and interactive/non-interactive execution.
2. Width test (80/100/120 columns), no broken layout.
3. Operator dry run checklist.

Acceptance:
1. No functional behavior regressions.
2. No update/install workflow breakage.

## Testing Matrix
1. Cloud scope interactive (whiptail available).
2. Onprem scope interactive (whiptail available).
3. Plain terminal fallback (no whiptail/dialog).
4. Narrow terminal (80 cols) sanity.
5. Non-interactive command invocation parity.

## Risks and Mitigations
1. Risk: UI refactor accidentally alters control flow.
   - Mitigation: isolate UI helpers, no action command edits in Phases 1-2.
2. Risk: color/formatting unreadable on some terminals.
   - Mitigation: capability checks and no-color fallback.
3. Risk: excessive verbosity slows operators.
   - Mitigation: keep concise default, show detail only in confirm/result screens.

## File Touch Plan
Primary:
1. `/antigravity/Cloud-On-Prem/cloud/lppadmin.sh`

Optional split (recommended if file grows):
1. `/antigravity/Cloud-On-Prem/cloud/lib/ui.sh` (rendering primitives)
2. `/antigravity/Cloud-On-Prem/cloud/lib/menu.sh` (menu wrappers)

## Rollout Plan
1. Implement Phase 1 + Phase 2.
2. Run operator dry test on this host.
3. Implement Phase 3 + Phase 4.
4. Re-run cutover smoke tests (`parity-report`, `status`, `health check`, `update-preflight`).
5. Ship in next installer/update package cycle.
