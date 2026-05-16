#!/usr/bin/env tsx

/**
 * Baseline Validation Script
 * 
 * Tests critical endpoints to ensure refactoring doesn't break functionality.
 * Run this after each refactoring step to validate behavior.
 */

const BASE_URL = 'http://localhost:5000';

interface TestCase {
  name: string;
  method: 'GET' | 'POST';
  path: string;
  expectedStatus: number;
  skipAuth?: boolean;
}

const SMOKE_TESTS: TestCase[] = [
  // Public endpoints (no auth required)
  { name: 'Public catalog', method: 'GET', path: '/api/collections', expectedStatus: 200, skipAuth: true },
  { name: 'Public pricing', method: 'GET', path: '/api/public/platform-pricing', expectedStatus: 200, skipAuth: true },
  { name: 'Public subscription plans', method: 'GET', path: '/api/public/subscription-plans', expectedStatus: 200, skipAuth: true },
  { name: 'User status (guest)', method: 'GET', path: '/api/user-status', expectedStatus: 200, skipAuth: true },
  
  // Auth endpoints (expect 401 for unauthenticated)
  { name: 'Auth check (unauthenticated)', method: 'GET', path: '/api/auth/user', expectedStatus: 401, skipAuth: true },
  
  // Health check
  { name: 'Health check', method: 'GET', path: '/api/health', expectedStatus: 200, skipAuth: true },
];

async function runSmokeTests(): Promise<void> {
  console.log('🧪 Running Baseline Validation Suite\n');
  
  let passed = 0;
  let failed = 0;
  const failures: string[] = [];
  
  for (const test of SMOKE_TESTS) {
    try {
      const response = await fetch(`${BASE_URL}${test.path}`, {
        method: test.method,
      });
      
      if (response.status === test.expectedStatus) {
        console.log(`✅ ${test.name}: ${test.method} ${test.path} → ${response.status}`);
        passed++;
      } else {
        console.log(`❌ ${test.name}: Expected ${test.expectedStatus}, got ${response.status}`);
        failures.push(`${test.name}: Expected ${test.expectedStatus}, got ${response.status}`);
        failed++;
      }
    } catch (error) {
      console.log(`❌ ${test.name}: Request failed - ${error instanceof Error ? error.message : String(error)}`);
      failures.push(`${test.name}: Request failed`);
      failed++;
    }
  }
  
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  
  if (failed > 0) {
    console.log('\n❌ Failures:');
    failures.forEach(f => console.log(`  - ${f}`));
    process.exit(1);
  } else {
    console.log('\n✅ All smoke tests passed!');
    process.exit(0);
  }
}

// Wait for server to be ready
setTimeout(() => {
  runSmokeTests().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}, 1000);
