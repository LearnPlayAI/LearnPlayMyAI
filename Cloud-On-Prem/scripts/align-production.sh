#!/bin/bash
set -e

echo "🔄 Aligning Production Database with Development Schema"
echo "========================================================"
echo ""

# Check if PRD_DB_URL is set
if [ -z "$PRD_DB_URL" ]; then
  echo "❌ Error: PRD_DB_URL environment variable not set"
  exit 1
fi

echo "📋 This will push the development schema to production database"
echo "⚠️  WARNING: This will modify the production database structure"
echo ""
echo "Production DB: ${PRD_DB_URL%%:*}://****:****@${PRD_DB_URL##*@}"
echo ""
echo "Press ENTER to continue or Ctrl+C to cancel..."
read

echo ""
echo "🚀 Pushing schema to production..."
echo ""

# Use DATABASE_URL override to push to production
DATABASE_URL="$PRD_DB_URL" npm run db:push --force

echo ""
echo "✅ Production database aligned successfully!"
echo ""
echo "🔍 Verifying schema parity..."
tsx scripts/db-verify-parity.ts
