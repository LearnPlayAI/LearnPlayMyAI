import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawnSync } from 'child_process';

export const CLOUD_EXCLUDED_MIGRATION_TAGS = new Set(['0052_add_cust_super_role']);

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'pipe',
    encoding: 'utf8',
    ...options,
  });

  return {
    ok: result.status === 0,
    code: result.status ?? 1,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  };
}

export function normalizeDeploymentMode(mode) {
  const normalized = String(mode || '').trim().toLowerCase();
  if (normalized === 'cloud') return 'cloud';
  return 'onprem';
}

export function getProjectRootFromScriptDir(scriptDir) {
  return path.resolve(scriptDir, '..');
}

export function getDefaultPaths(projectRoot) {
  return {
    migrationsDir: path.join(projectRoot, 'migrations'),
    journalFile: path.join(projectRoot, 'migrations', 'meta', '_journal.json'),
  };
}

export function listMigrationFiles(migrationsDir, deploymentMode = 'onprem') {
  const mode = normalizeDeploymentMode(deploymentMode);
  const files = fs
    .readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort();

  if (mode === 'cloud') {
    return files.filter((name) => !CLOUD_EXCLUDED_MIGRATION_TAGS.has(name.replace(/\.sql$/, '')));
  }
  return files;
}

export function readJournal(journalFile) {
  if (!fs.existsSync(journalFile)) {
    return { version: '7', dialect: 'postgresql', entries: [] };
  }
  const raw = fs.readFileSync(journalFile, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed || !Array.isArray(parsed.entries)) {
    throw new Error(`Invalid journal format: ${journalFile}`);
  }
  return parsed;
}

export function validateMigrationFileNames(files) {
  const invalid = [];
  const duplicatePrefixes = new Map();
  const seenPrefixes = new Map();
  const duplicateNames = new Set();
  const seenNames = new Set();

  for (const file of files) {
    const tag = file.replace(/\.sql$/, '');
    const prefix = tag.split('_')[0] || '';
    if (!/^\d{4}$/.test(prefix)) {
      invalid.push(file);
    }
    if (seenNames.has(tag)) {
      duplicateNames.add(tag);
    }
    seenNames.add(tag);

    if (seenPrefixes.has(prefix)) {
      const arr = duplicatePrefixes.get(prefix) || [seenPrefixes.get(prefix)];
      arr.push(tag);
      duplicatePrefixes.set(prefix, Array.from(new Set(arr)));
    } else {
      seenPrefixes.set(prefix, tag);
    }
  }

  return {
    invalid,
    duplicateNames: Array.from(duplicateNames),
    duplicatePrefixes: Array.from(duplicatePrefixes.entries()).map(([prefix, tags]) => ({ prefix, tags })),
  };
}

export function validateJournalAgainstFiles({ files, journal }) {
  const fileTags = files.map((file) => file.replace(/\.sql$/, ''));
  const fileTagSet = new Set(fileTags);

  const entries = Array.isArray(journal.entries) ? [...journal.entries] : [];
  const entryTags = entries.map((entry) => String(entry.tag || ''));
  const entryTagSet = new Set(entryTags);

  const missingInJournal = fileTags.filter((tag) => !entryTagSet.has(tag));
  const extraInJournal = entryTags.filter((tag) => tag && !fileTagSet.has(tag));

  const duplicateJournalTags = [];
  const seenJournalTags = new Set();
  for (const tag of entryTags) {
    if (!tag) continue;
    if (seenJournalTags.has(tag)) duplicateJournalTags.push(tag);
    seenJournalTags.add(tag);
  }

  const indexIssues = [];
  let previousIdx = -1;
  for (const [i, entry] of entries.entries()) {
    const idx = Number(entry.idx);
    if (!Number.isInteger(idx)) {
      indexIssues.push(`entry[${i}] has non-integer idx`);
      continue;
    }
    if (idx <= previousIdx) {
      indexIssues.push(`entry[${i}] idx ${idx} is not strictly increasing`);
    }
    previousIdx = idx;
  }

  const tagOrderIssues = [];
  let previousTag = '';
  for (const [i, entry] of entries.entries()) {
    const tag = String(entry.tag || '');
    if (!tag) {
      tagOrderIssues.push(`entry[${i}] missing tag`);
      continue;
    }
    if (previousTag && tag < previousTag) {
      tagOrderIssues.push(`entry[${i}] tag ${tag} is out of lexicographic order`);
    }
    previousTag = tag;
  }

  return {
    missingInJournal,
    extraInJournal,
    duplicateJournalTags: Array.from(new Set(duplicateJournalTags)),
    indexIssues,
    tagOrderIssues,
  };
}

export function appendMissingJournalEntries(journalFile, missingTags, nowMs = Date.now()) {
  if (!missingTags.length) {
    return { added: 0, journal: readJournal(journalFile) };
  }

  const journal = readJournal(journalFile);
  const existingTags = new Set((journal.entries || []).map((entry) => String(entry.tag || '')));
  let nextIdx = (journal.entries || []).reduce((max, entry) => {
    const idx = Number(entry.idx);
    if (Number.isInteger(idx) && idx > max) return idx;
    return max;
  }, -1) + 1;

  let added = 0;
  for (const tag of missingTags.sort()) {
    if (existingTags.has(tag)) continue;
    journal.entries.push({
      idx: nextIdx,
      version: String(journal.version || '7'),
      when: nowMs + added,
      tag,
      breakpoints: true,
    });
    nextIdx += 1;
    added += 1;
  }

  journal.entries.sort((a, b) => Number(a.idx) - Number(b.idx));
  fs.writeFileSync(journalFile, `${JSON.stringify(journal, null, 2)}\n`, 'utf8');
  return { added, journal };
}

export function hashMigrationFile(filePath) {
  const sqlContent = fs.readFileSync(filePath, 'utf8');
  return crypto.createHash('sha256').update(sqlContent).digest('hex');
}

export function getMigrationHashes(migrationsDir, deploymentMode = 'onprem') {
  const files = listMigrationFiles(migrationsDir, deploymentMode);
  const byTag = new Map();
  const byHash = new Map();

  for (const file of files) {
    const tag = file.replace(/\.sql$/, '');
    const fullPath = path.join(migrationsDir, file);
    const hash = hashMigrationFile(fullPath);
    const migration = { tag, file, fullPath, hash };
    byTag.set(tag, migration);
    byHash.set(hash, migration);
  }

  return {
    files,
    byTag,
    byHash,
    allHashes: Array.from(byHash.keys()),
  };
}

export function readDbAppliedHashes(dbUrl) {
  const tableCheck = runCommand('psql', [dbUrl, '-Atq', '-c', "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='drizzleMigrations');"]);
  if (!tableCheck.ok) {
    throw new Error(`Unable to query drizzleMigrations existence: ${tableCheck.stderr || tableCheck.stdout}`);
  }

  const tableExists = tableCheck.stdout.trim() === 't';
  if (!tableExists) {
    return { tableExists: false, hashes: [] };
  }

  const hashesQuery = runCommand('psql', [dbUrl, '-Atq', '-c', 'SELECT hash FROM "drizzleMigrations";']);
  if (!hashesQuery.ok) {
    throw new Error(`Unable to query applied migration hashes: ${hashesQuery.stderr || hashesQuery.stdout}`);
  }

  const hashes = hashesQuery.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return { tableExists: true, hashes };
}

export function evaluateDbCoverage({ dbHashes, migrationHashes }) {
  const expected = new Set(migrationHashes.allHashes);
  const applied = new Set(dbHashes);

  const missing = [];
  for (const hash of expected) {
    if (!applied.has(hash)) {
      const migration = migrationHashes.byHash.get(hash);
      missing.push(migration?.tag || hash);
    }
  }

  const unknown = [];
  for (const hash of applied) {
    if (!expected.has(hash)) {
      unknown.push(hash);
    }
  }

  return {
    missing,
    unknown,
    isComplete: missing.length === 0,
  };
}

function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '\n')
    .replace(/--.*$/gm, '');
}

function extractColumnsFromCreateTableBody(body) {
  return body
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^(CONSTRAINT|PRIMARY KEY|UNIQUE|CHECK|FOREIGN KEY)\b/i.test(line))
    .map((line) => line.replace(/,[\s\t]*$/, ''))
    .map((line) => {
      const quoted = line.match(/^"([^"]+)"\s+/);
      if (quoted) return quoted[1].toLowerCase();
      const plain = line.match(/^([A-Za-z0-9_]+)\s+/);
      if (plain) return plain[1].toLowerCase();
      return null;
    })
    .filter(Boolean);
}

export function loadFunctionalSchemaExclusions(exclusionsFile) {
  if (!exclusionsFile || !fs.existsSync(exclusionsFile)) {
    return { tables: [], columns: [], enums: [], constraints: [], indexes: [] };
  }

  const raw = fs.readFileSync(exclusionsFile, 'utf8');
  const parsed = JSON.parse(raw);
  const toNormalizedArray = (value, normalizer = (v) => v) =>
    Array.isArray(value)
      ? value.map((v) => normalizer(String(v || '').trim())).filter(Boolean)
      : [];

  return {
    tables: toNormalizedArray(parsed.tables, (v) => v.toLowerCase()),
    columns: toNormalizedArray(parsed.columns, (v) => v.toLowerCase()),
    enums: toNormalizedArray(parsed.enums, (v) => v.toLowerCase()),
    constraints: toNormalizedArray(parsed.constraints, (v) => v.toLowerCase()),
    indexes: toNormalizedArray(parsed.indexes, (v) => v.toLowerCase()),
  };
}

function normalizeIdentifier(value) {
  return String(value || '')
    .replace(/^"+|"+$/g, '')
    .trim()
    .toLowerCase();
}

export function collectSchemaContractFromSchemaFull(schemaFile, options = {}) {
  if (!schemaFile || !fs.existsSync(schemaFile)) {
    throw new Error(`Schema contract file not found: ${schemaFile}`);
  }

  const exclusions = options.exclusions || { tables: [], columns: [], enums: [], constraints: [], indexes: [] };
  const excludedTables = new Set((exclusions.tables || []).map((v) => String(v).toLowerCase()));
  const excludedColumns = new Set((exclusions.columns || []).map((v) => String(v).toLowerCase()));
  const excludedEnums = new Set((exclusions.enums || []).map((v) => String(v).toLowerCase()));
  const excludedConstraints = new Set((exclusions.constraints || []).map((v) => String(v).toLowerCase()));
  const excludedIndexes = new Set((exclusions.indexes || []).map((v) => String(v).toLowerCase()));

  const rawSql = fs.readFileSync(schemaFile, 'utf8');
  const sql = stripSqlComments(rawSql);
  const statements = sql
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);

  const requiredTables = new Set();
  const requiredColumns = new Set();
  const requiredEnums = new Set();
  const requiredConstraints = new Set();
  const requiredIndexes = new Set();

  for (const stmt of statements) {
    const createTable = stmt.match(
      /^CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:"?public"?\.)?"?([A-Za-z0-9_]+)"?\s*\(([\s\S]*)\)$/i,
    );
    if (createTable) {
      const table = normalizeIdentifier(createTable[1]);
      if (!table.startsWith('__drizzle_')) {
        requiredTables.add(table);
      }

      const body = String(createTable[2] || '');
      const lines = body
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

      for (const rawLine of lines) {
        const line = rawLine.replace(/,[\s\t]*$/, '');
        const inlineConstraint = line.match(/^CONSTRAINT\s+"?([A-Za-z0-9_]+)"?\s+/i);
        if (inlineConstraint && !table.startsWith('__drizzle_')) {
          const constraintKey = `${table}|${normalizeIdentifier(inlineConstraint[1])}`;
          requiredConstraints.add(constraintKey);
          continue;
        }
        if (/^(PRIMARY KEY|UNIQUE|CHECK|FOREIGN KEY)\b/i.test(line)) {
          continue;
        }

        const quotedCol = line.match(/^"([^"]+)"\s+/);
        const plainCol = line.match(/^([A-Za-z0-9_]+)\s+/);
        const col = normalizeIdentifier(quotedCol ? quotedCol[1] : plainCol ? plainCol[1] : '');
        if (col && !table.startsWith('__drizzle_')) {
          requiredColumns.add(`${table}|${col}`);
        }
      }
      continue;
    }

    const createType = stmt.match(
      /^CREATE\s+TYPE(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:"?public"?\.)?"?([A-Za-z0-9_]+)"?\s+AS\s+ENUM/i,
    );
    if (createType) {
      requiredEnums.add(normalizeIdentifier(createType[1]));
      continue;
    }

    const alterAddColumn = stmt.match(
      /^ALTER\s+TABLE(?:\s+ONLY)?\s+(?:"?public"?\.)?"?([A-Za-z0-9_]+)"?[\s\S]*ADD\s+COLUMN(?:\s+IF\s+NOT\s+EXISTS)?\s+"?([A-Za-z0-9_]+)"?/i,
    );
    if (alterAddColumn) {
      const table = normalizeIdentifier(alterAddColumn[1]);
      const col = normalizeIdentifier(alterAddColumn[2]);
      if (!table.startsWith('__drizzle_')) {
        requiredTables.add(table);
        if (col) {
          requiredColumns.add(`${table}|${col}`);
        }
      }
      continue;
    }

    const alterAddConstraint = stmt.match(
      /^ALTER\s+TABLE(?:\s+ONLY)?\s+(?:"?public"?\.)?"?([A-Za-z0-9_]+)"?[\s\S]*ADD\s+CONSTRAINT\s+"?([A-Za-z0-9_]+)"?/i,
    );
    if (alterAddConstraint) {
      const table = normalizeIdentifier(alterAddConstraint[1]);
      const constraint = normalizeIdentifier(alterAddConstraint[2]);
      if (!table.startsWith('__drizzle_') && constraint) {
        requiredConstraints.add(`${table}|${constraint}`);
      }
      continue;
    }

    const createIndex = stmt.match(
      /^CREATE\s+(?:UNIQUE\s+)?INDEX(?:\s+IF\s+NOT\s+EXISTS)?\s+"?([A-Za-z0-9_]+)"?\s+ON\s+(?:"?public"?\.)?"?([A-Za-z0-9_]+)"?/i,
    );
    if (createIndex) {
      const indexName = normalizeIdentifier(createIndex[1]);
      const table = normalizeIdentifier(createIndex[2]);
      if (!table.startsWith('__drizzle_') && indexName) {
        requiredIndexes.add(`${table}|${indexName}`);
      }
    }
  }

  // Capture contract entries that can appear inside DO blocks or dynamic SQL.
  for (const match of sql.matchAll(/CREATE\s+TYPE(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:"?public"?\.)?"?([A-Za-z0-9_]+)"?\s+AS\s+ENUM/gi)) {
    requiredEnums.add(normalizeIdentifier(match[1]));
  }
  for (const match of sql.matchAll(/ALTER\s+TABLE(?:\s+ONLY)?\s+(?:"?public"?\.)?"?([A-Za-z0-9_]+)"?[\s\S]*?ADD\s+CONSTRAINT\s+"?([A-Za-z0-9_]+)"?/gi)) {
    const table = normalizeIdentifier(match[1]);
    const constraint = normalizeIdentifier(match[2]);
    if (!table.startsWith('__drizzle_') && constraint) {
      requiredConstraints.add(`${table}|${constraint}`);
    }
  }
  for (const match of sql.matchAll(/CREATE\s+(?:UNIQUE\s+)?INDEX(?:\s+IF\s+NOT\s+EXISTS)?\s+"?([A-Za-z0-9_]+)"?\s+ON\s+(?:"?public"?\.)?"?([A-Za-z0-9_]+)"?/gi)) {
    const indexName = normalizeIdentifier(match[1]);
    const table = normalizeIdentifier(match[2]);
    if (!table.startsWith('__drizzle_') && indexName) {
      requiredIndexes.add(`${table}|${indexName}`);
    }
  }

  const filterSet = (set, excluded) => Array.from(set).filter((v) => !excluded.has(v)).sort();
  return {
    requiredTables: filterSet(requiredTables, excludedTables),
    requiredColumns: filterSet(requiredColumns, excludedColumns),
    requiredEnums: filterSet(requiredEnums, excludedEnums),
    requiredConstraints: filterSet(requiredConstraints, excludedConstraints),
    requiredIndexes: filterSet(requiredIndexes, excludedIndexes),
  };
}

export function collectFunctionalSchemaContract(migrationHashes, options = {}) {
  const exclusions = options.exclusions || { tables: [], columns: [], enums: [] };
  const excludedTables = new Set((exclusions.tables || []).map((v) => String(v).toLowerCase()));
  const excludedColumns = new Set((exclusions.columns || []).map((v) => String(v).toLowerCase()));
  const excludedEnums = new Set((exclusions.enums || []).map((v) => String(v).toLowerCase()));
  const requiredTables = new Set();
  const requiredColumns = new Set();
  const requiredEnums = new Set();

  for (const sqlFile of migrationHashes.files) {
    const tag = sqlFile.replace(/\.sql$/, '');
    const migration = migrationHashes.byTag.get(tag);
    if (!migration || !fs.existsSync(migration.fullPath)) continue;

    const rawSql = fs.readFileSync(migration.fullPath, 'utf8');
    const sql = stripSqlComments(rawSql);

    const createTableRegex = /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+(?:"?public"?\.)?"?([A-Za-z0-9_]+)"?\s*\(([\s\S]*?)\);/gi;
    let createMatch;
    while ((createMatch = createTableRegex.exec(sql)) !== null) {
      const table = String(createMatch[1]).toLowerCase();
      requiredTables.add(table);
      const cols = extractColumnsFromCreateTableBody(String(createMatch[2] || ''));
      for (const col of cols) {
        requiredColumns.add(`${table}|${col}`);
      }
    }

    const alterAddRegex = /ALTER\s+TABLE(?:\s+ONLY)?\s+(?:"?public"?\.)?"?([A-Za-z0-9_]+)"?[\s\S]*?ADD\s+COLUMN(?:\s+IF\s+NOT\s+EXISTS)?\s+"?([A-Za-z0-9_]+)"?/gi;
    let alterMatch;
    while ((alterMatch = alterAddRegex.exec(sql)) !== null) {
      const table = String(alterMatch[1]).toLowerCase();
      const column = String(alterMatch[2]).toLowerCase();
      requiredTables.add(table);
      requiredColumns.add(`${table}|${column}`);
    }

    const enumRegex = /CREATE\s+TYPE\s+(?:"?public"?\.)?"?([A-Za-z0-9_]+)"?\s+AS\s+ENUM/gi;
    let enumMatch;
    while ((enumMatch = enumRegex.exec(sql)) !== null) {
      requiredEnums.add(String(enumMatch[1]).toLowerCase());
    }
  }

  return {
    requiredTables: Array.from(requiredTables).filter((v) => !excludedTables.has(v)).sort(),
    requiredColumns: Array.from(requiredColumns).filter((v) => !excludedColumns.has(v)).sort(),
    requiredEnums: Array.from(requiredEnums).filter((v) => !excludedEnums.has(v)).sort(),
  };
}

export function readDbFunctionalSchema(dbUrl) {
  const tablesQuery = runCommand('psql', [
    dbUrl,
    '-Atq',
    '-c',
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;",
  ]);
  if (!tablesQuery.ok) {
    throw new Error(`Unable to query public tables: ${tablesQuery.stderr || tablesQuery.stdout}`);
  }

  const columnsQuery = runCommand('psql', [
    dbUrl,
    '-Atq',
    '-c',
    "SELECT table_name || '|' || column_name FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name, ordinal_position;",
  ]);
  if (!columnsQuery.ok) {
    throw new Error(`Unable to query public columns: ${columnsQuery.stderr || columnsQuery.stdout}`);
  }

  const enumsQuery = runCommand('psql', [
    dbUrl,
    '-Atq',
    '-c',
    "SELECT t.typname FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typtype='e' ORDER BY t.typname;",
  ]);
  if (!enumsQuery.ok) {
    throw new Error(`Unable to query public enums: ${enumsQuery.stderr || enumsQuery.stdout}`);
  }

  const splitLines = (text) =>
    String(text || '')
      .split('\n')
      .map((line) => line.trim().toLowerCase())
      .filter(Boolean);

  return {
    tables: splitLines(tablesQuery.stdout),
    columns: splitLines(columnsQuery.stdout),
    enums: splitLines(enumsQuery.stdout),
  };
}

export function readDbStructuralSchema(dbUrl) {
  const base = readDbFunctionalSchema(dbUrl);

  const constraintsQuery = runCommand('psql', [
    dbUrl,
    '-Atq',
    '-c',
    "SELECT cls.relname || '|' || con.conname FROM pg_constraint con JOIN pg_class cls ON cls.oid=con.conrelid JOIN pg_namespace n ON n.oid=cls.relnamespace WHERE n.nspname='public' ORDER BY cls.relname, con.conname;",
  ]);
  if (!constraintsQuery.ok) {
    throw new Error(`Unable to query public constraints: ${constraintsQuery.stderr || constraintsQuery.stdout}`);
  }

  const indexesQuery = runCommand('psql', [
    dbUrl,
    '-Atq',
    '-c',
    "SELECT tablename || '|' || indexname FROM pg_indexes WHERE schemaname='public' ORDER BY tablename, indexname;",
  ]);
  if (!indexesQuery.ok) {
    throw new Error(`Unable to query public indexes: ${indexesQuery.stderr || indexesQuery.stdout}`);
  }

  const splitLines = (text) =>
    String(text || '')
      .split('\n')
      .map((line) => line.trim().toLowerCase())
      .filter(Boolean)
      .filter((line) => !line.startsWith('__drizzle_'));

  return {
    tables: base.tables.filter((name) => !name.startsWith('__drizzle_')),
    columns: base.columns.filter((name) => !name.startsWith('__drizzle_')),
    enums: base.enums,
    constraints: splitLines(constraintsQuery.stdout),
    indexes: splitLines(indexesQuery.stdout),
  };
}

export function collectSchemaContractFromDb(dbUrl, options = {}) {
  const exclusions = options.exclusions || { tables: [], columns: [], enums: [], constraints: [], indexes: [] };
  const excludedTables = new Set((exclusions.tables || []).map((v) => String(v).toLowerCase()));
  const excludedColumns = new Set((exclusions.columns || []).map((v) => String(v).toLowerCase()));
  const excludedEnums = new Set((exclusions.enums || []).map((v) => String(v).toLowerCase()));
  const excludedConstraints = new Set((exclusions.constraints || []).map((v) => String(v).toLowerCase()));
  const excludedIndexes = new Set((exclusions.indexes || []).map((v) => String(v).toLowerCase()));

  const dbSchema = readDbStructuralSchema(dbUrl);
  const filterArray = (arr, excludedSet) => arr.filter((v) => !excludedSet.has(v)).sort();

  return {
    requiredTables: filterArray(dbSchema.tables, excludedTables),
    requiredColumns: filterArray(dbSchema.columns, excludedColumns),
    requiredEnums: filterArray(dbSchema.enums, excludedEnums),
    requiredConstraints: filterArray(dbSchema.constraints, excludedConstraints),
    requiredIndexes: filterArray(dbSchema.indexes, excludedIndexes),
  };
}

export function evaluateDbSchemaContractCoverage({ dbUrl, contract }) {
  const dbSchema = readDbStructuralSchema(dbUrl);

  const tableSet = new Set(dbSchema.tables);
  const columnSet = new Set(dbSchema.columns);
  const enumSet = new Set(dbSchema.enums);
  const constraintSet = new Set(dbSchema.constraints);
  const indexSet = new Set(dbSchema.indexes);

  const requiredTables = contract.requiredTables || [];
  const requiredColumns = contract.requiredColumns || [];
  const requiredEnums = contract.requiredEnums || [];
  const requiredConstraints = contract.requiredConstraints || [];
  const requiredIndexes = contract.requiredIndexes || [];

  const missingTables = requiredTables.filter((table) => !tableSet.has(table));
  const missingColumns = requiredColumns.filter((col) => !columnSet.has(col));
  const missingEnums = requiredEnums.filter((enm) => !enumSet.has(enm));
  const missingConstraints = requiredConstraints.filter((entry) => !constraintSet.has(entry));
  const missingIndexes = requiredIndexes.filter((entry) => !indexSet.has(entry));

  return {
    missingTables,
    missingColumns,
    missingEnums,
    missingConstraints,
    missingIndexes,
    requiredCounts: {
      tables: requiredTables.length,
      columns: requiredColumns.length,
      enums: requiredEnums.length,
      constraints: requiredConstraints.length,
      indexes: requiredIndexes.length,
    },
    isComplete:
      missingTables.length === 0 &&
      missingColumns.length === 0 &&
      missingEnums.length === 0 &&
      missingConstraints.length === 0 &&
      missingIndexes.length === 0,
  };
}

export function evaluateDbFunctionalCoverage({ dbUrl, migrationHashes, exclusions }) {
  const contract = collectFunctionalSchemaContract(migrationHashes, { exclusions });
  const dbSchema = readDbFunctionalSchema(dbUrl);

  const tableSet = new Set(dbSchema.tables);
  const columnSet = new Set(dbSchema.columns);
  const enumSet = new Set(dbSchema.enums);

  const missingTables = contract.requiredTables.filter((table) => !tableSet.has(table));
  const missingColumns = contract.requiredColumns.filter((col) => !columnSet.has(col));
  const missingEnums = contract.requiredEnums.filter((enm) => !enumSet.has(enm));

  return {
    missingTables,
    missingColumns,
    missingEnums,
    requiredCounts: {
      tables: contract.requiredTables.length,
      columns: contract.requiredColumns.length,
      enums: contract.requiredEnums.length,
    },
    isComplete: missingTables.length === 0 && missingColumns.length === 0 && missingEnums.length === 0,
  };
}

export function runDrizzleCheck({ projectRoot, dbUrl }) {
  const result = runCommand('npx', ['drizzle-kit', 'check', '--config', 'drizzle.config.ts'], {
    cwd: projectRoot,
    env: { ...process.env, DATABASE_URL: dbUrl },
  });

  return {
    driftDetected: !result.ok,
    result,
  };
}

export function runDrizzleGenerate({ projectRoot, dbUrl, migrationName }) {
  const safeName = migrationName || `auto_${new Date().toISOString().replace(/[:.TZ-]/g, '').slice(0, 14)}`;
  const result = runCommand('npx', ['drizzle-kit', 'generate', '--config', 'drizzle.config.ts', '--name', safeName], {
    cwd: projectRoot,
    env: { ...process.env, DATABASE_URL: dbUrl },
  });

  return {
    ok: result.ok,
    migrationName: safeName,
    result,
  };
}

export function runMigrationRunner({ projectRoot, dbUrl, deploymentMode = 'onprem', allowJournalRepair = true }) {
  const env = {
    ...process.env,
    DATABASE_URL: dbUrl,
    DEPLOYMENT_MODE: normalizeDeploymentMode(deploymentMode),
  };

  if (allowJournalRepair) {
    env.ALLOW_JOURNAL_REPAIR = 'true';
    env.MIGRATION_RECOVERY_MODE = env.MIGRATION_RECOVERY_MODE || 'true';
  }

  const result = runCommand('node', ['scripts/migrate.js'], {
    cwd: projectRoot,
    env,
  });

  return result;
}

export function summarizeValidationProblems({ filenameIssues, journalIssues }) {
  const problems = [];

  if (filenameIssues.invalid.length) {
    problems.push(`Invalid migration names: ${filenameIssues.invalid.join(', ')}`);
  }
  if (filenameIssues.duplicateNames.length) {
    problems.push(`Duplicate migration names: ${filenameIssues.duplicateNames.join(', ')}`);
  }
  if (filenameIssues.duplicatePrefixes.length) {
    const detail = filenameIssues.duplicatePrefixes
      .map((entry) => `${entry.prefix} => ${entry.tags.join(', ')}`)
      .join('; ');
    problems.push(`Duplicate numeric prefixes: ${detail}`);
  }
  if (journalIssues.missingInJournal.length) {
    problems.push(`Missing journal entries: ${journalIssues.missingInJournal.join(', ')}`);
  }
  if (journalIssues.extraInJournal.length) {
    problems.push(`Journal entries without SQL files: ${journalIssues.extraInJournal.join(', ')}`);
  }
  if (journalIssues.duplicateJournalTags.length) {
    problems.push(`Duplicate journal tags: ${journalIssues.duplicateJournalTags.join(', ')}`);
  }
  if (journalIssues.indexIssues.length) {
    problems.push(`Journal idx issues: ${journalIssues.indexIssues.join('; ')}`);
  }

  return problems;
}

export function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const key = token.slice(2);
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        args[key] = true;
      } else {
        args[key] = next;
        i += 1;
      }
    } else {
      args._.push(token);
    }
  }
  return args;
}
