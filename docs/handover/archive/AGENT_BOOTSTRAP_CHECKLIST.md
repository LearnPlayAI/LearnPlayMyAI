# Agent Bootstrap Checklist (New Seat)

Use this checklist at the start of every seat rotation.

## 1. Required read order
Follow `docs/handoverdocs/START_HERE.md` exactly.

## 2. Confirm understanding
Document before action:
- active goal,
- current phase,
- exact next action,
- explicit target: cloud ACC | cloud PRD | onprem ACC | onprem PRD.
- scope assumption: both variants by default unless user explicitly restricted to a single variant.
- confirm `docs/aimem/aimem.md` has been read before implementation work.
- confirm `docs/func/README.md` and `docs/handoverdocs/FUNCTIONAL_DOCS_PROTOCOL.md` are understood.

## 3. Run safety checks
```bash
sudo devadmin validate-scope-isolation
sudo devadmin env-show all
```

## 4. Pre-mutation checks
- snapshot readiness confirmed for target,
- scope alias/host matches target,
- package scope matches target scope,
- acceptance criteria known for current stage,
- for feature changes, corresponding `docs/func/<Domain>/<Domain>_Functionality.md` exists or is prepared for update.
- current validation steps are prepared in-session (or in an explicitly requested document) before user testing is requested.
- for UI work, Theme Editor-governed branding/token behavior is identified and preserved before implementation.

## 5. Failure contract
If any step fails:
1. stop,
2. request snapshot restore,
3. continue only after restore confirmation.

## 6. End-of-session updates
Before seat rotation, update:
- `docs/handoverdocs/AI-HANDOFF.md`
- `docs/handoverdocs/AI-STATE.json`
- `docs/handoverdocs/KNOWN_GOOD_VERSION_MATRIX.md` (if version state changed)
- any changed operational docs from the pack.
