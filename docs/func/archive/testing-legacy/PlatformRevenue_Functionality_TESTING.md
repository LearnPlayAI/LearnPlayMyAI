# Platform Revenue and Costs Testing

## Preconditions
- Use a SuperAdmin-capable environment.
- Ensure DB connection is available for SQL verification.

## API/Behavior Tests
1. Revenue source idempotency
- Insert/trigger the same source event twice with same `(sourceType, sourceId)`.
- Expected: only one `platformRevenueSources` row exists for that key.

2. Revenue report uniqueness (null org type)
- Trigger report generation twice for same `reportDate` with no `organizationType`.
- Expected: one row for that date where org type is null.

3. Revenue report uniqueness (org type)
- Trigger report generation twice for same `(reportDate, organizationType)`.
- Expected: one row for that composite key.

3a. Revenue cache concurrency safety
- Trigger parallel cache writes for the same `(reportDate, organizationType)` key.
- Expected: one persisted row for the key and no duplicate-key failure returned to caller.

4. Snapshot uniqueness (null org)
- Trigger snapshot generation twice for same `(periodStart, periodEnd, periodType)` with null org.
- Expected: one row for that period/global key.

5. Snapshot uniqueness (org present)
- Trigger snapshot generation twice for same `(periodStart, periodEnd, periodType, organizationId)`.
- Expected: one row for that key.

5a. Snapshot concurrency safety
- Trigger parallel snapshot generation for the same key from two workers.
- Expected: one persisted row for the key and no duplicate-key failure returned to caller.

6. Automated cost idempotency
- Submit the same automated cost payload twice for same day.
- Expected: one row in `platformCostEntries` for `(categoryId, organizationId, sourceReference, effectiveDate)`.

7. Cost category type duplicate create
- Create `Operations` then create ` operations ` (different case/spacing).
- Expected: second call returns existing id; no duplicate row.

8. Cost category duplicate create
- Create `("Infrastructure", "Operations")` then `( " infrastructure ", " operations " )`.
- Expected: second call returns existing id; no duplicate row.

9. Manual cost entry double-submit guard
- Submit the same manual entry twice quickly by same user.
- Expected: second call returns first record id; no second row.

10. Demo batch finance seeding idempotency
- Re-run the same demo batch (same `demoBatchId`) or simulate retry in generation flow.
- Expected: seeded `platformRevenueReports` and `platformFinancialSnapshots` rows for that batch/org are updated in place, not duplicated.

## SQL Verification Commands
Use:
- `Cloud-On-Prem/scripts/db/platform_financial_duplicate_report.sql`

Expected for all rows:
- `groups = 0`
- `extra_rows = 0`

## Operational Remediation Test
1. Seed synthetic duplicates in a non-production sandbox.
2. Run:
- `Cloud-On-Prem/scripts/db/platform_financial_dedupe.sql`
3. Re-run duplicate report script.
4. Expected:
- Duplicates removed.
- No FK-orphan errors.
- Uniqueness/index statements apply successfully.

## Environment Coverage
Run the duplicate report after rollout in:
- Cloud DEV, ACC, PRD
- OnPrem DEV, ACC, PRD

## Change Summary
- Added validation coverage for new idempotency, canonical uniqueness, and null-aware snapshot/report uniqueness behaviors.
- Added mandatory post-remediation duplicate scan checks across all runtime environments.
