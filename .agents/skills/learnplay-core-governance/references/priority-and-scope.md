# Priority And Scope

- P0 overrides P1 and P2.
- Default scope is cloud + onprem.
- User request is goal-level intent; implementation scope is AI-determined from code analysis.
- Any ambiguity requires explicit clarification before major implementation.
- Scope includes role-journey parity across `cloud` and `onprem`, not only touched files.
- Variant exclusions are exception-only and must name excluded roles/journeys, accepted risk, and approver.
- P0/P1 findings in one variant require targeted audit of the same role-journey path in the other variant before closure.
- Test data gaps are treated as execution blockers to resolve via deterministic DEV seeding, not as waived coverage.
