#!/usr/bin/env npx tsx
/**
 * Session Auth Migration Codemod
 * 
 * Automated tool to identify and transform legacy database-based auth patterns
 * to session-based middleware in the LearnPlay codebase.
 * 
 * Usage:
 *   npx tsx scripts/session-auth-codemod.ts --scan          # Scan only
 *   npx tsx scripts/session-auth-codemod.ts --migrate       # Apply migrations
 *   npx tsx scripts/session-auth-codemod.ts --report        # Generate report
 * 
 * Patterns detected:
 *   1. getUserRoles() calls → session.organizations[].roles
 *   2. db.select().from(userOrganizationRoles) → session context
 *   3. db.select().from(userSubscriptions) → session.subscriptionPackage
 *   4. LicenseService.checkUserLicense() → session.subscriptionPackage
 */

import * as fs from 'fs';
import * as path from 'path';

interface MigrationCandidate {
  file: string;
  line: number;
  pattern: string;
  context: string;
  suggestion: string;
  priority: 'high' | 'medium' | 'low';
}

interface MigrationReport {
  scannedFiles: number;
  candidates: MigrationCandidate[];
  estimatedQueriesPerRequest: number;
  estimatedSavings: number;
}

const LEGACY_PATTERNS = [
  {
    regex: /getUserRoles\s*\(\s*[^)]+\)/g,
    name: 'getUserRoles() call',
    suggestion: 'Use req.sessionContext.organizations[].roles or withOrgContext middleware',
    priority: 'high' as const,
    queriesPerCall: 2,
  },
  {
    regex: /db\s*\.\s*select\s*\(\s*\)\s*\.\s*from\s*\(\s*userOrganizationRoles\s*\)/g,
    name: 'Direct userOrganizationRoles query',
    suggestion: 'Use requireRole() middleware or req.sessionContext.organizations',
    priority: 'high' as const,
    queriesPerCall: 1,
  },
  {
    regex: /storage\.getUserOrganizations\s*\(/g,
    name: 'storage.getUserOrganizations() call',
    suggestion: 'Use req.sessionContext.organizations from session',
    priority: 'high' as const,
    queriesPerCall: 3,
  },
  {
    regex: /LicenseService\.checkUserLicense\s*\(/g,
    name: 'LicenseService.checkUserLicense() call',
    suggestion: 'Use requireSubscription() middleware or req.sessionContext.subscriptionPackage',
    priority: 'medium' as const,
    queriesPerCall: 2,
  },
  {
    regex: /db\s*\.\s*select\s*\(\s*\)\s*\.\s*from\s*\(\s*userSubscriptions\s*\)/g,
    name: 'Direct userSubscriptions query',
    suggestion: 'Use req.sessionContext.subscriptionPackage from session',
    priority: 'medium' as const,
    queriesPerCall: 1,
  },
  {
    regex: /db\s*\.\s*select\s*\(\s*\)\s*\.\s*from\s*\(\s*userLicenses\s*\)/g,
    name: 'Direct userLicenses query',
    suggestion: 'Use requireSubscription() middleware for license checks',
    priority: 'medium' as const,
    queriesPerCall: 1,
  },
  {
    regex: /storage\.getUser\s*\([^)]*\)\s*\.then\s*\([^)]*roles/gi,
    name: 'User fetch with roles',
    suggestion: 'Use req.user from passport session with req.sessionContext',
    priority: 'low' as const,
    queriesPerCall: 2,
  },
];

const SCAN_DIRECTORIES = [
  'server/routes',
  'server/services',
  'server/middleware',
];

const EXCLUDE_PATTERNS = [
  'sessionContextService.ts',
  'sessionInvalidationService.ts',
  'sessionAuthMiddleware.ts',
  '.test.ts',
  '.spec.ts',
  'node_modules',
];

function shouldExcludeFile(filePath: string): boolean {
  return EXCLUDE_PATTERNS.some(pattern => filePath.includes(pattern));
}

function scanFile(filePath: string): MigrationCandidate[] {
  const candidates: MigrationCandidate[] = [];
  
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    
    for (const pattern of LEGACY_PATTERNS) {
      let match;
      while ((match = pattern.regex.exec(content)) !== null) {
        const lineNumber = content.substring(0, match.index).split('\n').length;
        const contextStart = Math.max(0, lineNumber - 2);
        const contextEnd = Math.min(lines.length, lineNumber + 2);
        const context = lines.slice(contextStart, contextEnd).join('\n');
        
        candidates.push({
          file: filePath,
          line: lineNumber,
          pattern: pattern.name,
          context: context.trim(),
          suggestion: pattern.suggestion,
          priority: pattern.priority,
        });
      }
      pattern.regex.lastIndex = 0;
    }
  } catch (error) {
    console.error(`Error scanning ${filePath}:`, error);
  }
  
  return candidates;
}

function scanDirectory(dir: string): MigrationCandidate[] {
  const candidates: MigrationCandidate[] = [];
  
  if (!fs.existsSync(dir)) {
    console.warn(`Directory not found: ${dir}`);
    return candidates;
  }
  
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (entry.isDirectory()) {
      candidates.push(...scanDirectory(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      if (!shouldExcludeFile(fullPath)) {
        candidates.push(...scanFile(fullPath));
      }
    }
  }
  
  return candidates;
}

function generateReport(candidates: MigrationCandidate[]): MigrationReport {
  const estimatedQueriesPerRequest = candidates.reduce((sum, c) => {
    const pattern = LEGACY_PATTERNS.find(p => p.name === c.pattern);
    return sum + (pattern?.queriesPerCall || 1);
  }, 0);
  
  const uniqueFiles = new Set(candidates.map(c => c.file));
  
  return {
    scannedFiles: uniqueFiles.size,
    candidates,
    estimatedQueriesPerRequest,
    estimatedSavings: Math.round(estimatedQueriesPerRequest * 0.8),
  };
}

function printReport(report: MigrationReport): void {
  console.log('\n========================================');
  console.log('  Session Auth Migration Report');
  console.log('========================================\n');
  
  console.log(`Files scanned: ${report.scannedFiles}`);
  console.log(`Migration candidates found: ${report.candidates.length}`);
  console.log(`Estimated queries per request (current): ${report.estimatedQueriesPerRequest}`);
  console.log(`Estimated queries saved after migration: ${report.estimatedSavings}`);
  
  const byPriority = {
    high: report.candidates.filter(c => c.priority === 'high'),
    medium: report.candidates.filter(c => c.priority === 'medium'),
    low: report.candidates.filter(c => c.priority === 'low'),
  };
  
  console.log('\n--- High Priority (migrate first) ---');
  for (const candidate of byPriority.high.slice(0, 10)) {
    console.log(`\n  ${candidate.file}:${candidate.line}`);
    console.log(`  Pattern: ${candidate.pattern}`);
    console.log(`  Suggestion: ${candidate.suggestion}`);
  }
  if (byPriority.high.length > 10) {
    console.log(`\n  ... and ${byPriority.high.length - 10} more high priority items`);
  }
  
  console.log('\n--- Medium Priority ---');
  for (const candidate of byPriority.medium.slice(0, 5)) {
    console.log(`\n  ${candidate.file}:${candidate.line}`);
    console.log(`  Pattern: ${candidate.pattern}`);
  }
  if (byPriority.medium.length > 5) {
    console.log(`\n  ... and ${byPriority.medium.length - 5} more medium priority items`);
  }
  
  console.log('\n--- Low Priority ---');
  console.log(`  ${byPriority.low.length} items (defer to later phases)`);
  
  console.log('\n========================================');
  console.log('  Migration Instructions');
  console.log('========================================');
  console.log(`
1. For each high-priority file:
   - Import { withSessionAuthMiddleware } from "../middleware/sessionAuthMiddleware"
   - Add middleware to route: router.get('/path', withSessionAuthMiddleware, handler)
   - Replace legacy patterns with req.sessionContext access
   - Test with SESSION_AUTH_ENABLED=true

2. Example transformation:
   Before: const roles = await storage.getUserRoles(userId, orgId);
   After:  const roles = req.sessionContext.organizations
             .find(o => o.orgId === orgId)?.roles || [];

3. Run load tests to verify query reduction:
   npx tsx scripts/session-auth-load-test.ts
`);
}

function writeJsonReport(report: MigrationReport): void {
  const outputPath = 'reports/session-auth-migration.json';
  const outputDir = path.dirname(outputPath);
  
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  console.log(`\nJSON report written to: ${outputPath}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const mode = args[0] || '--scan';
  
  console.log('Session Auth Migration Codemod');
  console.log('==============================\n');
  
  const allCandidates: MigrationCandidate[] = [];
  
  for (const dir of SCAN_DIRECTORIES) {
    console.log(`Scanning ${dir}...`);
    const candidates = scanDirectory(dir);
    allCandidates.push(...candidates);
  }
  
  const report = generateReport(allCandidates);
  
  switch (mode) {
    case '--scan':
      printReport(report);
      break;
    case '--report':
      printReport(report);
      writeJsonReport(report);
      break;
    case '--migrate':
      console.log('\nMigration mode not yet implemented.');
      console.log('Use --scan to identify candidates, then manually apply transformations.');
      console.log('See docs/session-auth-migration-guide.md for patterns.');
      break;
    default:
      console.log('Usage:');
      console.log('  npx tsx scripts/session-auth-codemod.ts --scan');
      console.log('  npx tsx scripts/session-auth-codemod.ts --report');
      console.log('  npx tsx scripts/session-auth-codemod.ts --migrate');
  }
}

main().catch(console.error);
