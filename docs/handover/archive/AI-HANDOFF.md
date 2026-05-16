# AI Handoff

Last updated: 2026-03-27 10:56 SAST
Handoff owner: AI seat rotation workflow

## 1. Active Program Goals
1. Keep cloud DEV and onprem DEV stable and testable on this host.
2. Finish podcast/source-content UX hardening without regressing source-of-truth behavior.
3. Keep ACC/PRD promotion operator-driven after DEV validation passes.

## 2. What Was Completed
Completed in source and committed:
- `299e0b6` Improve source content version review and actionable feedback.
- `4843148` Stabilize podcast PPTX sourcing and draft continuity.

Delivered outcomes:
- Lesson source-content modal now supports stronger version hydration and compare diff workflow.
- Actionable feedback output added (not score-only summary).
- Podcast source handling tightened so PPTX flow is more robust and metadata drift is self-healed before extraction.
- Podcast draft continuity improved across autosave/save/step transitions with stable active draft selection.
- PPTX source availability detection expanded to reduce false-unavailable states.

## 3. Current Runtime State (cloud DEV + onprem DEV)
Validated on 2026-03-27:
- cloud DEV
  - Version: `LP-CL-V1.00.063`
  - BuildDate: `2026-03-27T08:49:21Z`
  - GitCommit: `4843148`
  - Health: `HEALTHY`
- onprem DEV
  - Version: `LP-OP-V1.00.073`
  - BuildDate: `2026-03-27T08:49:38Z`
  - GitCommit: `unknown` (runtime metadata missing commit field)
  - Health: `HEALTHY`

## 4. Pending Work
1. Complete remaining podcast wizard UX requests in one cohesive pass:
- single-draft-as-unit behavior,
- consistent step navigation forward/back across selected draft,
- better stepper visual UX,
- script editor ergonomics and alternating host/guest safeguards.
2. Improve source-content version compare UX (including user-selected two-version compare and clearer diff surfaces).
3. Validate/repair ElevenLabs balance endpoint behavior where `/api/admin/integrations/elevenlabs/balance` returns `502`.
4. Finalize PPTX source behavior so selecting PPTX never silently falls back to Source DB content.
5. Re-run functional smoke matrix for cloud DEV + onprem DEV after fixes.

## 5. Risks and Blockers
- ElevenLabs provider/API key permission issues can still break balance fetch and cost reconciliation surfaces.
- Some historical runtime metadata on onprem DEV does not provide git commit; version/build date is authoritative there.
- PPTX transcript extraction can fail on corrupt/unreadable files even when PPTX exists; must surface explicit user-facing failure and recovery path.
- Multi-draft and multi-step state handling is high-risk for regressions if not covered with targeted API/UI validation.

## 6. Exact Next 3 Actions
1. Implement unified draft model behavior (one draft object with per-step state), then verify step persistence and navigation.
2. Implement PPTX-first source enforcement + extraction failure messaging and remove any hidden Source DB fallback in podcast generation path.
3. Investigate/fix ElevenLabs balance 502 path, then run full podcast flow validation (source -> voices -> script -> estimate -> generate).

## 7. Validation Commands
```bash
# Runtime facts
sudo lppadmin cloud runtime-version
sudo lppadmin onprem runtime-version
sudo lppadmin cloud health
sudo lppadmin onprem health

# Host package baseline
dpkg-query -W -f='${Package} ${Version}\n' nodejs npm nginx postgresql-16 openssl libreoffice poppler-utils

# Source state
git -C /antigravity log --oneline -n 10
git -C /antigravity status --short

# Build/lint guard (workspace)
cd /antigravity/Cloud-On-Prem && npm run -s check
```

