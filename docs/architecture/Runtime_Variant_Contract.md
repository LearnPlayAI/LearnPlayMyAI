# Runtime Variant Contract

## Purpose
This document defines the immutable runtime contract for LearnPlay cloud and onprem variants from the single `Cloud-On-Prem` source tree.

## Canonical Runtime Paths
- Cloud app root: `/opt/learnplay/cloud`
- OnPrem app root: `/opt/learnplay/onprem`
- Cloud DB data dir: `/opt/lpdb/cloud/pg16/main`
- OnPrem DB data dir: `/opt/lpdb/onprem/pg16/main`
- DEV shared DB data dir (stack host exception): `/opt/lpdb/shared/pg16/main`
- Cloud uploads: `/opt/learnplay/cloud/uploads`
- OnPrem uploads: `/opt/learnplay/onprem/uploads`

## Backup Root Policy
- Primary backup root: `/lppbackups/<scope>`
- Required fallback when `/lppbackups` is unavailable/unwritable: `/opt/lpdb/lppbackups/<scope>`
- Scope values: `cloud`, `onprem`

## Variant Identity
- Runtime variant is immutable for installed systems and must be validated from:
  1. Release manifest `product` field
  2. Runtime marker in installed app root
- Environment values alone are not authoritative for variant identity.

## Installed Runtime Profile Behavior
- Installed runtimes expose production operations only.
- Development/build/package commands are not allowed in installed profile.

## Package Safety Contract
- Cloud updater accepts only `product=cloud`.
- OnPrem updater accepts only `product=onprem`.
- Package update must fail closed on manifest mismatch or integrity check failure.

## Data Safety Contract
- App/DB update requires successful DB backup first.
- If backup fails, app/DB update must abort before mutating runtime state.
- PostgreSQL data/WAL/rollback files must live on `/opt/lpdb` mount via `data_directory`.
- PostgreSQL textual logs must be written under `/var/log/postgresql`.

## Compatibility Note
- Legacy installed roots (`/opt/learnplay`, `/opt/learnplay-onprem`) may be detected for backward compatibility during transition.
- New installs must target canonical runtime paths defined above.
