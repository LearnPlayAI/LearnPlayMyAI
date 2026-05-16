// @ts-nocheck
import pg from 'pg';
const { Pool } = pg;
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import { execFileSync } from 'child_process';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL must be set');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const allowJournalRepair =
  process.env.ALLOW_JOURNAL_REPAIR === 'true' ||
  process.env.MIGRATION_RECOVERY_MODE === 'true' ||
  process.env.DR_RESTORE === 'true';
const strictUnknownJournalEntries =
  process.env.LEARNPLAY_MIGRATION_STRICT_UNKNOWN_JOURNAL === 'true';
const deploymentMode = String(
  process.env.DEPLOYMENT_MODE || process.env.LEARNPLAY_DEPLOYMENT_MODE || ''
).toLowerCase();
const onpremMode = String(process.env.ONPREM_MODE || '').toLowerCase();
const isCloudDeployment = deploymentMode === 'cloud' || onpremMode === 'false';
const CLOUD_EXCLUDED_MIGRATION_TAGS = new Set([
  '0052_add_cust_super_role',
]);

type TableDefinition = {
  createStatement: string;
  indexStatements: string[];
};

type SchemaContractColumn = {
  name: string;
  normalizedName: string;
  definition: string;
};

type SchemaContractTable = {
  name: string;
  normalizedName: string;
  createStatement: string;
  columns: SchemaContractColumn[];
};

function getMigrationTag(sqlFile: string): string {
  return sqlFile.replace('.sql', '');
}

function filterMigrationFilesForDeployment(sqlFiles: string[]): string[] {
  if (!isCloudDeployment) return sqlFiles;
  return sqlFiles.filter((sqlFile) => !CLOUD_EXCLUDED_MIGRATION_TAGS.has(getMigrationTag(sqlFile)));
}

function splitMigrationStatements(sqlContent: string): string[] {
  return sqlContent
    .split('--> statement-breakpoint')
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 0);
}

function isRecoverableMigrationError(error: any): boolean {
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  // Always tolerate duplicate-object DDL during reconcile/apply so idempotent
  // migration statements don't fail when runtime objects already exist.
  if (['42P07', '42710', '42701'].includes(code)) return true;
  if (message.includes('already exists')) return true;
  if (!allowJournalRepair) return false;
  if (['42P16', '42703', '42P01', '2BP01', '23505', '23503'].includes(code)) return true;
  if (message.includes('does not exist')) return true;
  if (message.includes('requires it')) return true;
  if (message.includes('foreign key constraint')) return true;
  if (message.includes('duplicate key value violates unique constraint')) return true;
  return false;
}

function stripLeadingComments(sql: string): string {
  return sql.replace(/^--[^\n]*\n?/gm, '').trim();
}

function isTransactionControlStatement(sql: string): boolean {
  const normalized = sql.trim().replace(/;+$/, '').toUpperCase();
  return normalized === 'BEGIN' || normalized === 'COMMIT' || normalized === 'ROLLBACK';
}

function stripOuterTransactionWrapper(sql: string): string {
  let normalized = sql.trim();
  normalized = normalized.replace(/^BEGIN\s*;\s*/i, '');
  normalized = normalized.replace(/\s*(COMMIT|ROLLBACK)\s*;?\s*$/i, '');
  return normalized.trim();
}

function toIfNotExistsCreateTable(statement: string): string {
  if (/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS/i.test(statement)) {
    return statement;
  }
  return statement.replace(/CREATE\s+TABLE\s+/i, 'CREATE TABLE IF NOT EXISTS ');
}

function toIfNotExistsCreateIndex(statement: string): string {
  if (/CREATE\s+(UNIQUE\s+)?INDEX\s+IF\s+NOT\s+EXISTS/i.test(statement)) {
    return statement;
  }
  return statement.replace(/CREATE\s+(UNIQUE\s+)?INDEX\s+/i, (_m, uniquePart) => {
    const unique = uniquePart || '';
    return `CREATE ${unique}INDEX IF NOT EXISTS `;
  });
}

function extractCreatedTablesFromSql(sqlContent: string): Set<string> {
  const created = new Set<string>();
  const regex = /CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+"?([a-zA-Z0-9_]+)"?/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(sqlContent)) !== null) {
    created.add(match[1].toLowerCase());
  }
  return created;
}

function extractRequiredTablesFromSql(sqlContent: string): Set<string> {
  const required = new Set<string>();
  const patterns = [
    /ALTER\s+TABLE(?:\s+ONLY)?\s+"?([a-zA-Z0-9_]+)"?/gi,
    /CREATE\s+(?:UNIQUE\s+)?INDEX(?:\s+IF\s+NOT\s+EXISTS)?\s+"?[a-zA-Z0-9_]+"?\s+ON\s+"?([a-zA-Z0-9_]+)"?/gi,
    /INSERT\s+INTO\s+"?([a-zA-Z0-9_]+)"?/gi,
    /UPDATE\s+"?([a-zA-Z0-9_]+)"?/gi,
    /DELETE\s+FROM\s+"?([a-zA-Z0-9_]+)"?/gi,
    /TRUNCATE\s+(?:TABLE\s+)?"?([a-zA-Z0-9_]+)"?/gi,
  ];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(sqlContent)) !== null) {
      required.add(match[1].toLowerCase());
    }
  }
  return required;
}

function buildTableDefinitionCatalog(sqlFiles: string[], migrationsDir: string): Map<string, TableDefinition> {
  const catalog = new Map<string, TableDefinition>();
  for (const sqlFile of sqlFiles) {
    const sqlContent = readFileSync(path.join(migrationsDir, sqlFile), 'utf-8');
    const statements = splitMigrationStatements(sqlContent).map(stripLeadingComments).filter(Boolean);
    const currentFileDefs = new Map<string, TableDefinition>();

    for (const stmt of statements) {
      const createTableMatch = stmt.match(/CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+"?([a-zA-Z0-9_]+)"?/i);
      if (createTableMatch) {
        const tableName = createTableMatch[1].toLowerCase();
        currentFileDefs.set(tableName, {
          createStatement: toIfNotExistsCreateTable(stmt),
          indexStatements: [],
        });
      }
    }

    for (const stmt of statements) {
      const createIndexMatch = stmt.match(/CREATE\s+(?:UNIQUE\s+)?INDEX(?:\s+IF\s+NOT\s+EXISTS)?\s+"?[a-zA-Z0-9_]+"?\s+ON\s+"?([a-zA-Z0-9_]+)"?/i);
      if (createIndexMatch) {
        const tableName = createIndexMatch[1].toLowerCase();
        const existing = currentFileDefs.get(tableName) || catalog.get(tableName);
        if (existing) {
          existing.indexStatements.push(toIfNotExistsCreateIndex(stmt));
          currentFileDefs.set(tableName, existing);
        }
      }
    }

    for (const [tableName, def] of currentFileDefs.entries()) {
      catalog.set(tableName, def);
    }
  }

  return catalog;
}

async function getCurrentTables(client: pg.PoolClient): Promise<Set<string>> {
  const result = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
  `);
  return new Set(result.rows.map((r: any) => String(r.table_name).toLowerCase()));
}

async function getCurrentColumns(client: pg.PoolClient): Promise<Set<string>> {
  const result = await client.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
  `);
  return new Set(
    result.rows.map(
      (r: any) => `${String(r.table_name).toLowerCase()}|${String(r.column_name).toLowerCase()}`
    )
  );
}

function parseSchemaContractTables(schemaSql: string): SchemaContractTable[] {
  const lines = schemaSql.split(/\r?\n/);
  const tables: SchemaContractTable[] = [];
  let inTable = false;
  let currentTableName = '';
  let currentBlock: string[] = [];
  let currentColumns: SchemaContractColumn[] = [];

  const flushCurrentTable = () => {
    if (!currentTableName || currentBlock.length === 0) return;
    const createStatement = toIfNotExistsCreateTable(currentBlock.join('\n'));
    tables.push({
      name: currentTableName,
      normalizedName: currentTableName.toLowerCase(),
      createStatement,
      columns: currentColumns,
    });
  };

  for (const line of lines) {
    if (!inTable) {
      const start = line.match(
        /^CREATE TABLE (IF NOT EXISTS )?(public\.)?"?([A-Za-z0-9_]+)"? \($/
      );
      if (start) {
        inTable = true;
        currentTableName = String(start[3]);
        currentBlock = [line];
        currentColumns = [];
      }
      continue;
    }

    currentBlock.push(line);
    const trimmed = line.trim();

    if (trimmed === ');') {
      flushCurrentTable();
      inTable = false;
      currentTableName = '';
      currentBlock = [];
      currentColumns = [];
      continue;
    }

    if (!trimmed) continue;

    const noIndent = trimmed.replace(/^[\s\t]+/, '');
    if (/^(CONSTRAINT|PRIMARY KEY|UNIQUE|CHECK|FOREIGN KEY)\b/i.test(noIndent)) {
      continue;
    }

    const rawColumn = noIndent.replace(/,[\s\t]*$/, '');
    let columnName = '';
    let columnDef = '';
    const quotedMatch = rawColumn.match(/^"([^"]+)"\s+(.*)$/);
    const plainMatch = rawColumn.match(/^([A-Za-z0-9_]+)\s+(.*)$/);
    if (quotedMatch) {
      columnName = quotedMatch[1];
      columnDef = quotedMatch[2];
    } else if (plainMatch) {
      columnName = plainMatch[1];
      columnDef = plainMatch[2];
    } else {
      continue;
    }

    currentColumns.push({
      name: columnName,
      normalizedName: columnName.toLowerCase(),
      definition: columnDef.replace(/\t/g, ' '),
    });
  }

  return tables;
}

async function enforceSchemaContractFromSchemaFull(): Promise<void> {
  const projectRoot = path.join(__dirname, '..');
  const schemaCandidates = [
    path.join(projectRoot, 'schema-full.sql'),
    isCloudDeployment
      ? path.join(projectRoot, 'dist-cloud', 'schema-full.sql')
      : path.join(projectRoot, 'dist-onprem', 'schema-full.sql'),
    path.join(projectRoot, 'dist', 'schema-full.sql'),
    path.join(projectRoot, 'dist-cloud', 'schema-full.sql'),
    path.join(projectRoot, 'dist-onprem', 'schema-full.sql'),
  ];
  const schemaPath = schemaCandidates.find((candidate) => existsSync(candidate)) || schemaCandidates[0];
  if (!existsSync(schemaPath)) {
    console.warn(`⚠️  schema-full.sql not found — skipping required schema contract enforcement for this run (checked: ${schemaCandidates.join(', ')})`);
    return;
  }

  const schemaSql = readFileSync(schemaPath, 'utf-8');
  const contractTables = parseSchemaContractTables(schemaSql).filter(
    (table) => !table.normalizedName.startsWith('__drizzle_')
  );

  if (contractTables.length === 0) {
    throw new Error('schema-full.sql does not contain any CREATE TABLE definitions');
  }

  const client = await pool.connect();
  try {
    const currentTables = await getCurrentTables(client);
    const currentColumns = await getCurrentColumns(client);
    let createdTables = 0;
    let addedColumns = 0;

    for (const table of contractTables) {
      if (!currentTables.has(table.normalizedName)) {
        await client.query(table.createStatement);
        currentTables.add(table.normalizedName);
        createdTables += 1;
      }

      for (const col of table.columns) {
        const key = `${table.normalizedName}|${col.normalizedName}`;
        if (!currentColumns.has(key)) {
          try {
            await client.query(
              `ALTER TABLE "${table.name}" ADD COLUMN "${col.name}" ${col.definition}`
            );
            currentColumns.add(key);
            addedColumns += 1;
          } catch (error: any) {
            const code = String(error?.code || '');
            const msg = error?.message || 'unknown error';
            // Duplicate-column errors mean another migration/statement already created it.
            if (code === '42701' || /already exists/i.test(msg)) {
              currentColumns.add(key);
              continue;
            }
            console.warn(`   ⚠️  Skipped column remediation for ${table.name}.${col.name}: ${msg}`);
          }
        }
      }
    }

    const missingTables: string[] = [];
    const missingColumns: string[] = [];
    const verifyTables = await getCurrentTables(client);
    const verifyColumns = await getCurrentColumns(client);
    for (const table of contractTables) {
      if (!verifyTables.has(table.normalizedName)) {
        missingTables.push(table.name);
        continue;
      }
      for (const col of table.columns) {
        const key = `${table.normalizedName}|${col.normalizedName}`;
        if (!verifyColumns.has(key)) {
          missingColumns.push(`${table.name}.${col.name}`);
        }
      }
    }

    if (missingTables.length > 0) {
      throw new Error(
        `Required schema contract unsatisfied after remediation (missing tables: ${missingTables.join(', ')})`
      );
    }
    if (missingColumns.length > 0) {
      console.warn(
        `⚠️  Required schema column contract has unresolved entries (${missingColumns.length}); sample: ${missingColumns.slice(0, 25).join(', ')}`
      );
    }

    console.log(
      `✅ Required schema contract satisfied (tables created: ${createdTables}, columns added: ${addedColumns})`
    );
  } finally {
    client.release();
  }
}

async function ensureMissingPrerequisiteTables(
  pendingFiles: string[],
  sqlFiles: string[],
  migrationsDir: string
): Promise<void> {
  if (pendingFiles.length === 0) return;

  const tableCatalog = buildTableDefinitionCatalog(sqlFiles, migrationsDir);
  const client = await pool.connect();
  try {
    const currentTables = await getCurrentTables(client);
    const createdByPending = new Set<string>();

    const missingCandidates = new Set<string>();
    for (const sqlFile of pendingFiles) {
      const sqlContent = readFileSync(path.join(migrationsDir, sqlFile), 'utf-8');
      const createdInThisFile = extractCreatedTablesFromSql(sqlContent);
      const requiredInThisFile = extractRequiredTablesFromSql(sqlContent);

      for (const tableName of requiredInThisFile) {
        if (!currentTables.has(tableName) && !createdByPending.has(tableName) && !createdInThisFile.has(tableName)) {
          missingCandidates.add(tableName);
        }
      }
      for (const createdTable of createdInThisFile) {
        createdByPending.add(createdTable);
      }
    }

    if (missingCandidates.size === 0) return;

    const healed: string[] = [];
    for (const tableName of missingCandidates) {
      const definition = tableCatalog.get(tableName);
      if (!definition) {
        continue;
      }
      await client.query(definition.createStatement);
      for (const idxStmt of definition.indexStatements) {
        await client.query(idxStmt);
      }
      healed.push(tableName);
    }

    if (healed.length > 0) {
      console.log(`   ✅ Repaired missing prerequisite table(s): ${healed.sort().join(', ')}`);
    }
  } finally {
    client.release();
  }
}

async function preflightPendingMigrations(pendingFiles: string[], migrationsDir: string): Promise<void> {
  if (pendingFiles.length === 0) return;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const sqlFile of pendingFiles) {
      const sqlContent = readFileSync(path.join(migrationsDir, sqlFile), 'utf-8');
      const statements = splitMigrationStatements(sqlContent);

      for (const stmt of statements) {
        const stripped = stripOuterTransactionWrapper(stripLeadingComments(stmt));
        if (!stripped) continue;
        if (isTransactionControlStatement(stripped)) continue;
        await client.query('SAVEPOINT lp_stmt_preflight');
        try {
          await client.query(stripped);
          await client.query('RELEASE SAVEPOINT lp_stmt_preflight');
        } catch (error: any) {
          await client.query('ROLLBACK TO SAVEPOINT lp_stmt_preflight');
          await client.query('RELEASE SAVEPOINT lp_stmt_preflight');
          if (isRecoverableMigrationError(error)) {
            continue;
          }
          throw error;
        }
      }
    }
    await client.query('ROLLBACK');
    console.log(`   ✅ Preflight check passed for ${pendingFiles.length} pending migration(s)`);
  } catch (error: any) {
    await client.query('ROLLBACK');
    const msg = error?.message || 'unknown migration preflight error';
    throw new Error(`Migration preflight failed before apply: ${msg}`);
  } finally {
    client.release();
  }
}

async function ensureEnterpriseSystemSyncAuthColumns(): Promise<void> {
  const client = await pool.connect();
  try {
    const tableCheck = await client.query(
      `SELECT to_regclass('public."enterpriseSystems"') AS regclass`
    );
    if (!tableCheck.rows[0]?.regclass) {
      console.warn('⚠️  enterpriseSystems table not found — skipping sync auth column remediation');
      return;
    }

    await client.query(`
      ALTER TABLE IF EXISTS "enterpriseSystems"
        ADD COLUMN IF NOT EXISTS "syncAuthMode" varchar DEFAULT 'shared' NOT NULL,
        ADD COLUMN IF NOT EXISTS "syncAuthVersion" integer DEFAULT 0 NOT NULL,
        ADD COLUMN IF NOT EXISTS "syncAuthSecretHash" varchar,
        ADD COLUMN IF NOT EXISTS "syncAuthRevokedAt" timestamp
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS "IDX_enterpriseSystems_sync_auth_mode"
      ON "enterpriseSystems" ("enterpriseCustomerId", "syncAuthMode")
    `);

    const required = [
      'syncAuthMode',
      'syncAuthVersion',
      'syncAuthSecretHash',
      'syncAuthRevokedAt',
    ];
    const foundRows = await client.query(
      `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'enterpriseSystems'
        AND column_name = ANY($1::text[])
      `,
      [required]
    );
    const found = new Set(foundRows.rows.map((row: any) => String(row.column_name)));
    const missing = required.filter((name) => !found.has(name));
    if (missing.length > 0) {
      throw new Error(`sync auth column remediation incomplete: ${missing.join(', ')}`);
    }

    console.log('✅ enterpriseSystems sync auth columns verified');
  } finally {
    client.release();
  }
}

async function isFreshInstall(): Promise<boolean> {
  if (process.env.DR_RESTORE === 'true') {
    console.log("🔄 DR_RESTORE=true — preserving restored database, running incremental migrations only");
    return false;
  }
  if (process.env.FRESH_INSTALL === 'true') {
    throw new Error(
      'FRESH_INSTALL override is disabled for data safety. ' +
      'Fresh installs are auto-detected only when the database is empty.'
    );
  }
  try {
    const migrationsExist = await pool.query(
      "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'drizzleMigrations') AS exists"
    );
    if (migrationsExist.rows[0].exists) {
      return false;
    }

    const publicTableCountResult = await pool.query(
      "SELECT COUNT(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public'"
    );
    const publicTableCount = publicTableCountResult.rows[0]?.count ?? 0;
    const hasExistingSchema = publicTableCount > 0;
    if (hasExistingSchema) {
      if (allowJournalRepair) {
        console.log('⚠️  Existing schema detected without migration journal — recovery mode enabled');
        return false;
      }
      throw new Error(
        'Existing schema detected without drizzleMigrations journal. Refusing automatic repair. ' +
        'Set MIGRATION_RECOVERY_MODE=true only for explicit recovery workflows.'
      );
    }

    return true;
  } catch (error: any) {
    if (error instanceof Error && error.message.includes('Existing schema detected without drizzleMigrations journal')) {
      throw error;
    }
    const message = error?.message || 'unknown error';
    throw new Error(
      `Failed to determine fresh-install state safely: ${message}. ` +
      'Aborting migration to protect existing data.'
    );
  }
}

async function dropAllObjects(): Promise<void> {
  console.log('🗑️  Dropping all existing database objects...');
  await pool.query('DROP SCHEMA public CASCADE');
  await pool.query('CREATE SCHEMA public');
  await pool.query('GRANT ALL ON SCHEMA public TO PUBLIC');
  console.log('✅ Database wiped clean');
}

async function seedMigrationJournal(reason: 'fresh-install' | 'recovery'): Promise<void> {
  console.log(`📋 Seeding migration journal (${reason})...`);
  
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "drizzleMigrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      "createdAt" bigint
    )
  `);
  
  const journalPath = path.join(__dirname, '..', 'migrations', 'meta', '_journal.json');
  if (!existsSync(journalPath)) {
    console.log('   ⚠️  No migration journal found, skipping seed');
    return;
  }
  
  const journal = JSON.parse(readFileSync(journalPath, 'utf-8'));
  
  const migrationsDir = path.join(__dirname, '..', 'migrations');
  
  const fs = await import('fs');
  const allSqlFiles = fs.readdirSync(migrationsDir)
    .filter((f: string) => f.endsWith('.sql'))
    .sort();
  const sqlFiles = filterMigrationFilesForDeployment(allSqlFiles);

  if (isCloudDeployment) {
    const skipped = allSqlFiles.filter((f: string) => CLOUD_EXCLUDED_MIGRATION_TAGS.has(getMigrationTag(f)));
    if (skipped.length > 0) {
      console.log(`   ℹ️  Cloud deployment: skipping on-prem-only migrations in journal seed: ${skipped.join(', ')}`);
    }
  }
  
  for (const sqlFile of sqlFiles) {
    const tag = sqlFile.replace('.sql', '');
    const sqlContent = readFileSync(path.join(migrationsDir, sqlFile), 'utf-8');
    
    const crypto = await import('crypto');
    const hash = crypto.createHash('sha256').update(sqlContent).digest('hex');
    
    const existing = await pool.query(
      "SELECT 1 FROM \"drizzleMigrations\" WHERE hash = $1",
      [hash]
    );
    
    if (existing.rows.length === 0) {
      const journalEntry = journal.entries?.find((e: any) => e.tag === tag);
      const createdAt = journalEntry?.when || Date.now();
      
      await pool.query(
        "INSERT INTO \"drizzleMigrations\" (hash, \"createdAt\") VALUES ($1, $2)",
        [hash, createdAt]
      );
      console.log(`   ✅ Recorded: ${tag}`);
    }
  }
  
  console.log(`✅ Migration journal seeded (${reason})`);
}

async function runFreshInstall(): Promise<void> {
  console.log('🆕 Fresh install detected — applying complete schema...');
  
  await dropAllObjects();
  
  const schemaPath = path.join(__dirname, '..', 'schema-full.sql');
  if (!existsSync(schemaPath)) {
    throw new Error('schema-full.sql not found — cannot proceed with fresh install');
  }
  
  console.log('🔄 Applying complete schema from schema-full.sql...');
  const schemaSql = readFileSync(schemaPath, 'utf-8');
  await pool.query(schemaSql);
  console.log('✅ Complete schema applied');
  await ensureEnterpriseSystemSyncAuthColumns();
  // Fresh installs already apply schema-full.sql as the canonical contract.
  // Skip redundant catalog-driven remediation/verification here to avoid
  // brittle information_schema/catalog edge cases during first bootstrap.
  console.log('ℹ️  Skipping post-apply schema remediation on fresh install (schema-full is authoritative).');
  
  await seedMigrationJournal('fresh-install');
}

async function reconcileAndApplyMigrations(): Promise<void> {
  const migrationsDir = path.join(__dirname, '..', 'migrations');
  const fs = await import('fs');
  const crypto = await import('crypto');
  
  const allSqlFiles = fs.readdirSync(migrationsDir)
    .filter((f: string) => f.endsWith('.sql'))
    .sort();
  const sqlFiles = filterMigrationFilesForDeployment(allSqlFiles);

  if (isCloudDeployment) {
    const skipped = allSqlFiles.filter((f: string) => CLOUD_EXCLUDED_MIGRATION_TAGS.has(getMigrationTag(f)));
    if (skipped.length > 0) {
      console.log(`   ℹ️  Cloud deployment: skipping on-prem-only migrations: ${skipped.join(', ')}`);
      const skippedHashes: string[] = skipped.map((sqlFile: string) => {
        const sqlContent = readFileSync(path.join(migrationsDir, sqlFile), 'utf-8');
        return crypto.createHash('sha256').update(sqlContent).digest('hex');
      });
      if (skippedHashes.length > 0) {
        const deleted = await pool.query(
          `DELETE FROM "drizzleMigrations" WHERE hash = ANY($1::text[])`,
          [skippedHashes]
        );
        if ((deleted.rowCount || 0) > 0) {
          console.log(`   ✅ Removed ${deleted.rowCount} on-prem-only migration journal entr${deleted.rowCount === 1 ? 'y' : 'ies'} for cloud`);
        }
      }
    }
  }
  
  if (sqlFiles.length === 0) {
    console.log('   No migration files found');
    return;
  }
  
  const sqlHashesByFile = new Map<string, string>();
  for (const sqlFile of sqlFiles) {
    const sqlContent = readFileSync(path.join(migrationsDir, sqlFile), 'utf-8');
    sqlHashesByFile.set(sqlFile, crypto.createHash('sha256').update(sqlContent).digest('hex'));
  }
  const releaseHashes = new Set(sqlFiles.map((sqlFile) => sqlHashesByFile.get(sqlFile) as string));

  const journalRows = await pool.query(
    "SELECT id, hash, \"createdAt\" FROM \"drizzleMigrations\" ORDER BY id ASC"
  );
  console.log(`   📊 Migration files: ${sqlFiles.length}, Journal entries: ${journalRows.rows.length}`);

  const unknownEntries = journalRows.rows.filter((row: any) => !releaseHashes.has(row.hash));
  if (unknownEntries.length > 0) {
    const unknownIds = unknownEntries.map((row: any) => row.id as number);
    if (allowJournalRepair || !strictUnknownJournalEntries) {
      if (!allowJournalRepair) {
        console.warn(
          `   ⚠️  Auto-reconciling ${unknownIds.length} unknown migration journal entr${unknownIds.length === 1 ? 'y' : 'ies'} ` +
          '(enable LEARNPLAY_MIGRATION_STRICT_UNKNOWN_JOURNAL=true to hard-fail instead)'
        );
      }
      await pool.query(
        `DELETE FROM "drizzleMigrations" WHERE id = ANY($1::int[])`,
        [unknownIds]
      );
      console.log(`   ✅ Removed ${unknownIds.length} unknown journal entr${unknownIds.length === 1 ? 'y' : 'ies'}`);
    } else {
      throw new Error(
        `Migration journal contains ${unknownEntries.length} unknown entr${unknownEntries.length === 1 ? 'y' : 'ies'} not present in release migrations. ` +
        'Refusing automatic reconciliation.'
      );
    }
  }

  const publicTableCountResult = await pool.query(
    "SELECT COUNT(*)::int AS count FROM information_schema.tables WHERE table_schema = 'public'"
  );
  const publicTableCount = Number(publicTableCountResult.rows[0]?.count || 0);

  const getPendingFiles = async (): Promise<string[]> => {
    const appliedRows = await pool.query(
      "SELECT hash FROM \"drizzleMigrations\""
    );
    const appliedHashes = new Set(appliedRows.rows.map((row: any) => row.hash as string));
    return sqlFiles.filter((sqlFile) => !appliedHashes.has(sqlHashesByFile.get(sqlFile) as string));
  };

  let pendingFiles = await getPendingFiles();

  const shouldAutoRepairSparseJournal =
    !allowJournalRepair &&
    journalRows.rows.length > 0 &&
    journalRows.rows.length <= 5 &&
    pendingFiles.length >= Math.max(20, Math.floor(sqlFiles.length * 0.6)) &&
    publicTableCount >= 100;

  if (shouldAutoRepairSparseJournal) {
    console.warn(
      '⚠️  Detected sparse migration journal on populated schema. ' +
      `Auto-reconciling ${pendingFiles.length} pending migration hash entr${pendingFiles.length === 1 ? 'y' : 'ies'} to prevent unsafe historical replay.`
    );

    const journalPath = path.join(migrationsDir, 'meta', '_journal.json');
    let journal: any = { entries: [] };
    if (existsSync(journalPath)) {
      journal = JSON.parse(readFileSync(journalPath, 'utf-8'));
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const sqlFile of pendingFiles) {
        const hash = sqlHashesByFile.get(sqlFile) as string;
        const tag = sqlFile.replace('.sql', '');
        const journalEntry = journal.entries?.find((e: any) => e.tag === tag);
        const createdAt = journalEntry?.when || Date.now();
        await client.query(
          "INSERT INTO \"drizzleMigrations\" (hash, \"createdAt\") VALUES ($1, $2)",
          [hash, createdAt]
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    pendingFiles = await getPendingFiles();
    console.log(`   ✅ Sparse journal reconciliation complete. Remaining pending migrations: ${pendingFiles.length}`);
  }

  if (pendingFiles.length > 0) {
    await ensureMissingPrerequisiteTables(pendingFiles, sqlFiles, migrationsDir);
    await preflightPendingMigrations(pendingFiles, migrationsDir);

    const journalPath = path.join(migrationsDir, 'meta', '_journal.json');
    let journal: any = { entries: [] };
    if (existsSync(journalPath)) {
      journal = JSON.parse(readFileSync(journalPath, 'utf-8'));
    }
    
    console.log(`🔄 Applying ${pendingFiles.length} pending migration(s)...`);
    for (const sqlFile of pendingFiles) {
      const sqlContent = readFileSync(path.join(migrationsDir, sqlFile), 'utf-8');
      const hash = sqlHashesByFile.get(sqlFile) as string;
      const tag = sqlFile.replace('.sql', '');
      
      console.log(`   ▶ Applying: ${tag}`);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        const statements = splitMigrationStatements(sqlContent);
        
        for (const stmt of statements) {
          const stripped = stripOuterTransactionWrapper(stripLeadingComments(stmt));
          if (stripped) {
            if (isTransactionControlStatement(stripped)) {
              continue;
            }
            await client.query('SAVEPOINT lp_stmt_apply');
            try {
              await client.query(stripped);
              await client.query('RELEASE SAVEPOINT lp_stmt_apply');
            } catch (error: any) {
              await client.query('ROLLBACK TO SAVEPOINT lp_stmt_apply');
              await client.query('RELEASE SAVEPOINT lp_stmt_apply');
              if (isRecoverableMigrationError(error)) {
                console.warn(`   ⚠️  Recovery mode skipped statement for ${tag}: ${error.message}`);
                continue;
              }
              throw error;
            }
          }
        }
        
        const journalEntry = journal.entries?.find((e: any) => e.tag === tag);
        const createdAt = journalEntry?.when || Date.now();
        
        await client.query(
          "INSERT INTO \"drizzleMigrations\" (hash, \"createdAt\") VALUES ($1, $2)",
          [hash, createdAt]
        );
        
        await client.query('COMMIT');
        console.log(`   ✅ Applied: ${tag}`);
      } catch (error: any) {
        await client.query('ROLLBACK');
        console.error(`   ❌ Failed to apply ${tag}: ${error.message}`);
        if (error.code) console.error(`      PostgreSQL error code: ${error.code}`);
        if (error.detail) console.error(`      Detail: ${error.detail}`);
        throw error;
      } finally {
        client.release();
      }
    }
    console.log('✅ All pending migrations applied successfully');
  } else {
    console.log('✅ No pending migrations — database schema is up to date');
  }
}

async function runUpdate(): Promise<void> {
  console.log('🔄 Existing install detected — running incremental migrations...');
  
  const enumSqlPath = path.join(__dirname, '..', 'create-enums.sql');
  if (existsSync(enumSqlPath)) {
    console.log('🔄 Ensuring enum types exist (duplicate-safe)...');
    try {
      if (process.env.DATABASE_URL) {
        execFileSync(
          'psql',
          [process.env.DATABASE_URL, '-v', 'ON_ERROR_STOP=0', '-f', enumSqlPath],
          { stdio: 'pipe' }
        );
      } else {
        const enumSql = readFileSync(enumSqlPath, 'utf-8');
        await pool.query(enumSql);
      }
      console.log('✅ Enum types verified');
    } catch (error: any) {
      console.warn(`⚠️  Enum bootstrap reported issues (${error?.message || 'unknown'}) — continuing`);
    }
  }
  
  const journalExists = await pool.query(
    "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'drizzleMigrations') AS exists"
  );
  if (!journalExists.rows[0].exists) {
    if (!allowJournalRepair) {
      throw new Error(
        'Migration journal table is missing on an existing database. ' +
        'Refusing automatic journal seeding. Set MIGRATION_RECOVERY_MODE=true for explicit recovery.'
      );
    }
    console.log('📋 Migration journal missing — recovery mode seeding enabled');
    await seedMigrationJournal('recovery');
  }
  
  console.log('🔍 Reconciling and applying migrations...');
  await reconcileAndApplyMigrations();

  console.log('🔍 Enforcing required schema contract (tables + columns)...');
  await enforceSchemaContractFromSchemaFull();
  await ensureEnterpriseSystemSyncAuthColumns();
  console.log('✅ Migrations completed');
}

async function runMigrations(): Promise<void> {
  try {
    const fresh = await isFreshInstall();
    
    if (fresh) {
      await runFreshInstall();
    } else {
      await runUpdate();
    }
    
    console.log('✅ Database setup completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Database setup failed:', error);
    process.exit(1);
  }
}

runMigrations();
