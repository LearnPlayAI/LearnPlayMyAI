# Upgrade Test Matrix (Mandatory)

## Scope
- Variants: cloud, onprem
- Modes: onprem unlicensed development, onprem unlicensed production, onprem licensed development, onprem licensed production
- Paths: oldest-supported -> latest, previous -> latest, current -> latest

## Required scenarios
1. Cloud oldest-supported -> latest (app-db)
2. Cloud previous -> latest (all)
3. Cloud current -> latest (lppadmin only)
4. Onprem oldest-supported -> latest unlicensed development
5. Onprem oldest-supported -> latest unlicensed production
6. Onprem previous -> latest licensed development
7. Onprem previous -> latest licensed production
8. Onprem current -> latest (lppadmin only)

## Gates (all scenarios)
- Manifest product validation enforced
- Checksum verification enforced
- Backup succeeds before mutation
- Runtime marker remains variant-correct after update
- Health endpoint passes after update
- Rollback metadata written on each transaction
- No source code in package

## Expected outputs
- `.release-provenance.json` updated with transaction id
- `.runtime-identity.json` variant unchanged
- updater log under backup root
- backup retention policy applied (7 daily + 4 weekly)
