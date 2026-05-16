#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const SCHEMA_PATH = path.join(ROOT, 'shared', 'schema.ts');

const LEGACY_SNAKE_IDENTIFIERS = [
  'podcast_provider_cost_ledger',
  'podcast_settlement_ledger',
  'branding_themes',
  'organization_domains',
  'enterprise_customers',
  'enterprise_documents',
  'build_versions',
  'enterprise_license_requests',
  'enterprise_license_keys',
  'onprem_license_state',
  'enterprise_revenue_sync',
  'enterprise_agreement_templates',
  'enterprise_keyring',
  'enterprise_systems',
  'enterprise_system_daily_telemetry',
  'organization_id',
  'org_name',
  'theme_mode_intent',
  'preset_id',
  'tokens_light',
  'tokens_dark',
  'logo_url',
  'favicon_url',
  'font_heading',
  'font_body',
  'support_url',
  'support_email',
  'terms_url',
  'privacy_url',
  'allow_email_branding',
  'enable_contrast_corrections',
  'gradient_enabled',
  'gradient_from',
  'gradient_to',
  'gradient_angle',
  'custom_copy',
  'verification_token',
  'verified_at',
  'is_active',
];

const TEXT_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.sh', '.sql', '.json', '.yml', '.yaml', '.env', '.txt']);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'dist-cloud', 'dist-onprem', '.git', 'migrations', 'docs', 'attached_assets']);
const SKIP_FILES = new Set([
  path.normalize('scripts/check-db-naming-alignment.mjs'),
  path.normalize('scripts/remediate-snake-case-tables.mjs'),
  path.normalize('replit.md'),
  path.normalize('HANDOVER.md'),
]);

let hadFailure = false;

function fail(msg) {
  console.error(`❌ ${msg}`);
  hadFailure = true;
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) {
        continue;
      }
      if (entry.name.startsWith('learnplay-export-')) {
        continue;
      }
      walk(p, out);
      continue;
    }
    out.push(p);
  }
  return out;
}

function isCamelTable(name) {
  return /^[a-z][A-Za-z0-9]*$/.test(name);
}

function isCamelColumn(name) {
  return /^[a-z][A-Za-z0-9]*$/.test(name);
}

function checkSchemaIdentifiers() {
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');

  // Enforce pgTable physical table names.
  const tableMatches = [...schema.matchAll(/pgTable\("([^"]+)"/g)];
  for (const m of tableMatches) {
    const table = m[1];
    if (!isCamelTable(table)) {
      fail(`Schema table identifier is not camelCase: ${table}`);
    }
  }

  // Enforce physical column names passed as first arg in column builders.
  const columnRegex = /\b[A-Za-z0-9_]+\s*:\s*(?:varchar|text|integer|decimal|timestamp|boolean|jsonb|date|real|serial|bigint|doublePrecision|uuid|time|numeric)\("([^"]+)"\)/g;
  const columnMatches = [...schema.matchAll(columnRegex)];
  for (const m of columnMatches) {
    const column = m[1];
    if (!isCamelColumn(column)) {
      fail(`Schema column identifier is not camelCase: ${column}`);
    }
  }
}

function checkNoLegacyIdentifiersOutsideMigrations() {
  const files = walk(ROOT);
  for (const file of files) {
    const rel = path.normalize(path.relative(ROOT, file));
    if (SKIP_FILES.has(rel)) {
      continue;
    }

    const ext = path.extname(file).toLowerCase();
    if (!TEXT_EXTENSIONS.has(ext)) {
      continue;
    }

    // shared/schema.ts is validated structurally above.
    if (rel === path.normalize('shared/schema.ts')) {
      continue;
    }

    const content = fs.readFileSync(file, 'utf8');
    for (const token of LEGACY_SNAKE_IDENTIFIERS) {
      if (content.includes(token)) {
        fail(`Legacy snake_case identifier '${token}' found in ${rel}`);
      }
    }
  }
}

function checkNewMigrationFiles() {
  const migrationsDir = path.join(ROOT, 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    return;
  }

  const files = fs.readdirSync(migrationsDir).filter((f) => /^\d+_.*\.sql$/.test(f));
  for (const file of files) {
    const m = file.match(/^(\d+)_/);
    if (!m) continue;
    const index = Number(m[1]);

    // Historical migrations are immutable and can contain legacy names by definition.
    if (index < 78) continue;
    // 0078-0079 are explicit journal/table rename migrations and must reference old names.
    if (index === 78) continue;
    if (index === 79) continue;

    const full = path.join(migrationsDir, file);
    const content = fs.readFileSync(full, 'utf8');

    const tablePatterns = [
      /CREATE\s+TABLE\s+"([^"]+)"/gi,
      /ALTER\s+TABLE\s+"([^"]+)"/gi,
      /DROP\s+TABLE\s+"([^"]+)"/gi,
    ];
    for (const pattern of tablePatterns) {
      let m;
      while ((m = pattern.exec(content)) !== null) {
        const table = m[1];
        if (!isCamelTable(table)) {
          fail(`Non-camelCase table identifier '${table}' found in new migration ${file}`);
        }
      }
    }

    const addColumnRegex = /ADD\s+COLUMN(?:\s+IF\s+NOT\s+EXISTS)?\s+"([^"]+)"/gi;
    let addColumnMatch;
    while ((addColumnMatch = addColumnRegex.exec(content)) !== null) {
      const column = addColumnMatch[1];
      if (!isCamelColumn(column)) {
        fail(`Non-camelCase column identifier '${column}' found in new migration ${file}`);
      }
    }

    const renameColumnRegex = /RENAME\s+COLUMN\s+"([^"]+)"\s+TO\s+"([^"]+)"/gi;
    let renameMatch;
    while ((renameMatch = renameColumnRegex.exec(content)) !== null) {
      const nextName = renameMatch[2];
      if (!isCamelColumn(nextName)) {
        fail(`Non-camelCase renamed column identifier '${nextName}' found in new migration ${file}`);
      }
    }
  }
}

function checkSqlAliasConventions() {
  const roots = [path.join(ROOT, 'server'), path.join(ROOT, 'scripts')];
  const files = [];
  for (const dir of roots) {
    if (fs.existsSync(dir)) {
      walk(dir, files);
    }
  }

  const legacyAliasTokens = new Set([
    ...LEGACY_SNAKE_IDENTIFIERS,
    'user_name',
    'user_email',
    'course_title',
    'organization_name',
    'progress_status',
    'percent_complete',
    'completed_lessons',
    'total_lessons',
    'enrollment_date',
    'total_count',
  ]);
  const canonicalCamelAliases = new Set([
    'organizationId',
    'organizationName',
    'userName',
    'userEmail',
    'courseTitle',
    'enrollmentDate',
    'progressStatus',
    'percentComplete',
    'completedLessons',
    'totalLessons',
    'totalCount',
  ]);

  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    if (!['.ts', '.tsx', '.js', '.mjs'].includes(ext)) {
      continue;
    }
    const rel = path.relative(ROOT, file);
    const content = fs.readFileSync(file, 'utf8');

    let match;
    const aliasRegex = /\bAS\s+("?)([A-Za-z0-9_]+)\1\b/g;
    while ((match = aliasRegex.exec(content)) !== null) {
      const rawAlias = match[2];
      const wasQuoted = match[1] === '"';
      if (legacyAliasTokens.has(rawAlias)) {
        fail(`Legacy SQL alias '${rawAlias}' found in ${rel}. Use quoted camelCase alias.`);
      }
      if (canonicalCamelAliases.has(rawAlias) && !wasQuoted) {
        fail(`Unquoted camelCase SQL alias '${rawAlias}' found in ${rel}. Use AS "${rawAlias}".`);
      }
    }
  }
}

checkSchemaIdentifiers();
checkNoLegacyIdentifiersOutsideMigrations();
checkNewMigrationFiles();
checkSqlAliasConventions();

if (hadFailure) {
  process.exit(1);
}

console.log('✅ DB naming alignment checks passed (schema + non-migration references).');
