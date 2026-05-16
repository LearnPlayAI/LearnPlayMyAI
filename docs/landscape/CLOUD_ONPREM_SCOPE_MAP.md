# Cloud And Onprem Scope Map

Last updated: 2026-04-28
Scope: both

## Default Scope
All LearnPlay changes are treated as `cloud + onprem` unless the user explicitly limits scope.

## Cloud
- Centrally hosted LearnPlay runtime.
- Cloud ACC validates cloud packages before cloud PRD.
- Cloud PRD is the production hosted runtime.
- Cloud PRD is authoritative for onprem license/check-in control-plane governance.

## Onprem
- Customer self-hosted runtime model.
- Onprem ACC validates onprem packages before onprem PRD.
- Onprem PRD is the production self-host runtime.
- Onprem licensing, check-in, and feature differences must remain explicit and documented.

## Variant Boundary Rules
- Cloud packages must identify as cloud and deploy only to cloud runtimes.
- Onprem packages must identify as onprem and deploy only to onprem runtimes.
- Runtime variant identity is validated by package manifest and installed runtime markers, not environment variables alone.
- Scope-sensitive payloads must carry authoritative scope metadata where relevant.

## Current Difference References
- Active parity matrix: `/antigravity/docs/testing/current/CLOUD_ONPREM_FEATURE_DIFFERENCE_MATRIX.md`
- Functional contracts: `/antigravity/docs/func/<Domain>/<Domain>_Functionality.md`

