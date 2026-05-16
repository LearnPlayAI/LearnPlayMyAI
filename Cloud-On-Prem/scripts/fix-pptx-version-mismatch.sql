-- Data Repair Script: Fix PPTX Version/StorageKey Mismatches
-- Issue: Duplicate version records created by buggy PHASE 2 code in JobQueueService
-- Root Cause: Version records were created twice - once by storePPTX, once by JobQueueService
-- Result: version=2 records pointing to v1.pptx files (version/path mismatch)
-- Solution: Delete the mismatched duplicate records

-- Step 1: Preview affected records (run this first to verify)
SELECT 
  id, 
  "lessonId", 
  version,
  "isGenerated",
  SUBSTRING("storageKey" FROM 'v(\d+)\.pptx$') as file_version,
  "storageKey",
  "createdAt"
FROM "lessonPresentationVersions"
WHERE "storageKey" NOT LIKE '%/v' || version || '.pptx'
  AND "storageKey" ~ 'v\d+\.pptx$'
ORDER BY "createdAt" DESC;

-- Step 2: Delete the mismatched records (run after confirming Step 1 results)
-- These are duplicate records that point to files with different version numbers
-- The correct version records (where version matches file) will remain

DELETE FROM "lessonPresentationVersions"
WHERE "storageKey" NOT LIKE '%/v' || version || '.pptx'
  AND "storageKey" ~ 'v\d+\.pptx$'
RETURNING id, "lessonId", version, "isGenerated", "storageKey";

-- Step 3: Verify no mismatches remain
SELECT COUNT(*) as remaining_mismatches
FROM "lessonPresentationVersions"
WHERE "storageKey" NOT LIKE '%/v' || version || '.pptx'
  AND "storageKey" ~ 'v\d+\.pptx$';
