#!/bin/bash
#
# Post-Rollback Health Check Script
#
# Purpose: Verify core platform functionality after license system rollback
# Usage: ./scripts/health-check-post-rollback.sh
#
# Requirements:
# - curl, jq
# - ADMIN_SESSION environment variable (optional, for admin checks)
#
# Exit Codes:
#   0 - All checks passed
#   1 - One or more checks failed

set -e

# Configuration
BASE_URL="${BASE_URL:-https://learnplay.co.za}"
ADMIN_SESSION="${ADMIN_SESSION:-}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check counters
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0

# Helper function to run a check
run_check() {
  local name="$1"
  local command="$2"
  local expected="$3"
  
  TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
  
  echo -n "  [$TOTAL_CHECKS] $name... "
  
  result=$(eval "$command" 2>&1 || echo "ERROR")
  
  if echo "$result" | grep -q "$expected"; then
    echo -e "${GREEN}✅ PASS${NC}"
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
  else
    echo -e "${RED}❌ FAIL${NC}"
    echo "      Expected: $expected"
    echo "      Got: $result"
    FAILED_CHECKS=$((FAILED_CHECKS + 1))
  fi
}

# Print banner
echo "=========================================="
echo "  POST-ROLLBACK HEALTH CHECKS"
echo "=========================================="
echo ""
echo "Base URL: $BASE_URL"
echo "Timestamp: $(date -u +"%Y-%m-%d %H:%M:%S UTC")"
echo ""

# ===========================================
# CHECK 1: API Responsiveness
# ===========================================
echo -e "${BLUE}🌐 Check 1: API Responsiveness${NC}"

run_check "Public API endpoint" \
  "curl -s -o /dev/null -w '%{http_code}' '$BASE_URL/api/public/platform-pricing'" \
  "200"

run_check "Courses endpoint" \
  "curl -s -o /dev/null -w '%{http_code}' '$BASE_URL/api/courses'" \
  "[24]0[0-9]"  # 200, 401, 404 are all acceptable (depends on auth)

run_check "Collections endpoint" \
  "curl -s -o /dev/null -w '%{http_code}' '$BASE_URL/api/collections'" \
  "[24]0[0-9]"

echo ""

# ===========================================
# CHECK 2: Feature Flag State
# ===========================================
echo -e "${BLUE}🚩 Check 2: Feature Flag State${NC}"

if [ -z "$ADMIN_SESSION" ]; then
  echo -e "${YELLOW}  ⚠️  Skipped (no ADMIN_SESSION provided)${NC}"
else
  run_check "License system disabled" \
    "curl -s '$BASE_URL/api/admin/feature-flags/status' -H 'Cookie: connect.sid=$ADMIN_SESSION' | jq -r '.flags.licenseSystemEnabled'" \
    "false"
  
  run_check "License payments disabled" \
    "curl -s '$BASE_URL/api/admin/feature-flags/status' -H 'Cookie: connect.sid=$ADMIN_SESSION' | jq -r '.flags.licensePaymentsEnabled'" \
    "false"
fi

echo ""

# ===========================================
# CHECK 3: Database Connectivity
# ===========================================
echo -e "${BLUE}🗄️  Check 3: Database Connectivity${NC}"

run_check "Collections queryable" \
  "curl -s '$BASE_URL/api/collections' | jq -r 'type'" \
  "array"

run_check "Public platform pricing queryable" \
  "curl -s '$BASE_URL/api/public/platform-pricing' | jq -r '.learnerMonthlyCost'" \
  "[0-9]"

echo ""

# ===========================================
# CHECK 4: Core Features
# ===========================================
echo -e "${BLUE}🎯 Check 4: Core Features${NC}"

run_check "Guest user creation" \
  "curl -s '$BASE_URL/api/user-status' | jq -r '.id' | grep -q 'guest_' && echo 'true' || echo 'false'" \
  "true"

run_check "Subscription plans accessible" \
  "curl -s '$BASE_URL/api/public/subscription-plans' | jq -r 'type'" \
  "object"

echo ""

# ===========================================
# CHECK 5: Application Logs
# ===========================================
echo -e "${BLUE}📋 Check 5: Application Logs${NC}"

if [ -d "/tmp/logs" ]; then
  run_check "BillingScheduler running" \
    "grep -q 'BillingScheduler.*Scheduler started' /tmp/logs/Start_application_*.log 2>/dev/null && echo 'true' || echo 'false'" \
    "true"
  
  run_check "No recent errors" \
    "tail -100 /tmp/logs/Start_application_*.log 2>/dev/null | grep -c -i 'error' | awk '{if (\$1 < 5) print \"low\"; else print \"high\"}'" \
    "low"
  
  run_check "Feature flags logged" \
    "grep -q 'FeatureFlags.*License System Configuration' /tmp/logs/Start_application_*.log 2>/dev/null && echo 'true' || echo 'false'" \
    "true"
else
  echo -e "${YELLOW}  ⚠️  Skipped (log directory not found)${NC}"
fi

echo ""

# ===========================================
# SUMMARY
# ===========================================
echo "=========================================="
echo "  SUMMARY"
echo "=========================================="
echo ""
echo "Total Checks: $TOTAL_CHECKS"
echo -e "${GREEN}Passed: $PASSED_CHECKS${NC}"

if [ $FAILED_CHECKS -gt 0 ]; then
  echo -e "${RED}Failed: $FAILED_CHECKS${NC}"
else
  echo "Failed: $FAILED_CHECKS"
fi

echo ""

if [ $FAILED_CHECKS -eq 0 ]; then
  echo -e "${GREEN}✅ ALL CHECKS PASSED${NC}"
  echo "Platform is healthy after rollback."
  exit 0
else
  echo -e "${RED}❌ SOME CHECKS FAILED${NC}"
  echo "Review failures above and investigate."
  exit 1
fi
