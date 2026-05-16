#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawnSync } from 'child_process';

function parseArgs(argv) {
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

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'pipe',
    encoding: 'utf8',
    ...options,
  });
  return {
    ok: result.status === 0,
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || ''),
    code: result.status ?? 1,
  };
}

function runPsql(dbUrl, sql) {
  const result = runCommand('psql', [dbUrl, '-Atq', '-c', sql]);
  if (!result.ok) {
    throw new Error(`psql failed: ${result.stderr || result.stdout}`.trim());
  }
  return result.stdout;
}

function splitLines(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function quoteIdent(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function quoteLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function readSchemaFromDb(dbUrl) {
  const tables = splitLines(runPsql(
    dbUrl,
    "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name;",
  ));

  const columnsRaw = splitLines(runPsql(
    dbUrl,
    `
SELECT x.table_name || '|' || x.column_name || '|' || x.type_sql || '|' || x.is_nullable || '|' || coalesce(x.column_default,'') || '|' || x.ordinal
FROM (
  SELECT
    c.relname AS table_name,
    a.attname AS column_name,
    pg_catalog.format_type(a.atttypid, a.atttypmod) AS type_sql,
    CASE WHEN a.attnotnull THEN 'NO' ELSE 'YES' END AS is_nullable,
    pg_get_expr(ad.adbin, ad.adrelid) AS column_default,
    a.attnum AS ordinal
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND a.attnum > 0
    AND NOT a.attisdropped
) x
ORDER BY x.table_name, x.ordinal;
`.trim(),
  ));

  const constraintsRaw = splitLines(runPsql(
    dbUrl,
    `
SELECT rel.relname || '|' || con.conname || '|' || con.contype::text || '|' || pg_get_constraintdef(con.oid)
FROM pg_constraint con
JOIN pg_class rel ON rel.oid = con.conrelid
JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
WHERE nsp.nspname = 'public'
  AND con.contype IN ('p','u','f','c')
ORDER BY rel.relname, con.conname;
`.trim(),
  ));

  const indexesRaw = splitLines(runPsql(
    dbUrl,
    "SELECT tablename || '|' || indexname || '|' || indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY tablename, indexname;",
  ));

  const enumsRaw = splitLines(runPsql(
    dbUrl,
    `
SELECT t.typname || '|' || e.enumsortorder::int || '|' || e.enumlabel
FROM pg_type t
JOIN pg_enum e ON e.enumtypid = t.oid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public'
ORDER BY t.typname, e.enumsortorder;
`.trim(),
  ));

  const columns = [];
  for (const row of columnsRaw) {
    const [tableName, columnName, typeSql, isNullable, columnDefault, ordinalText] = row.split('|');
    columns.push({
      tableName,
      columnName,
      typeSql,
      isNullable,
      columnDefault: columnDefault || null,
      ordinal: Number(ordinalText),
    });
  }

  const constraints = constraintsRaw.map((row) => {
    const [tableName, name, type, definition] = row.split('|');
    return { tableName, name, type, definition };
  });

  const indexes = indexesRaw.map((row) => {
    const [tableName, name, definition] = row.split('|');
    return { tableName, name, definition };
  });

  const enums = [];
  for (const row of enumsRaw) {
    const [name, orderText, label] = row.split('|');
    enums.push({ name, order: Number(orderText), label });
  }

  tables.sort();
  columns.sort((a, b) =>
    a.tableName.localeCompare(b.tableName)
    || a.ordinal - b.ordinal
    || a.columnName.localeCompare(b.columnName));
  constraints.sort((a, b) =>
    a.tableName.localeCompare(b.tableName)
    || a.name.localeCompare(b.name));
  indexes.sort((a, b) =>
    a.tableName.localeCompare(b.tableName)
    || a.name.localeCompare(b.name));
  enums.sort((a, b) =>
    a.name.localeCompare(b.name)
    || a.order - b.order);

  return { tables, columns, constraints, indexes, enums };
}

function readSnapshot(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return {
    tables: Array.isArray(parsed.tables) ? parsed.tables : [],
    columns: Array.isArray(parsed.columns) ? parsed.columns : [],
    constraints: Array.isArray(parsed.constraints) ? parsed.constraints : [],
    indexes: Array.isArray(parsed.indexes) ? parsed.indexes : [],
    enums: Array.isArray(parsed.enums) ? parsed.enums : [],
  };
}

function schemaHash(snapshot) {
  return crypto.createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
}

function columnSql(column) {
  let sql = `${quoteIdent(column.columnName)} ${column.typeSql}`;
  if (column.columnDefault) {
    sql += ` DEFAULT ${column.columnDefault}`;
  }
  if (String(column.isNullable).toUpperCase() === 'NO') {
    sql += ' NOT NULL';
  }
  return sql;
}

function toIndexIfNotExists(indexDef) {
  return indexDef
    .replace(/^CREATE UNIQUE INDEX\s+/i, 'CREATE UNIQUE INDEX IF NOT EXISTS ')
    .replace(/^CREATE INDEX\s+/i, 'CREATE INDEX IF NOT EXISTS ');
}

function buildDiffSql(previous, current) {
  const statements = [];
  const previousTableSet = new Set(previous.tables);
  const currentTableSet = new Set(current.tables);
  const newlyCreatedTables = new Set();

  const prevColumnsByKey = new Map(previous.columns.map((c) => [`${c.tableName}|${c.columnName}`, c]));
  const currColumnsByKey = new Map(current.columns.map((c) => [`${c.tableName}|${c.columnName}`, c]));

  const prevEnums = new Map();
  for (const enm of previous.enums) {
    if (!prevEnums.has(enm.name)) prevEnums.set(enm.name, []);
    prevEnums.get(enm.name).push(enm.label);
  }
  const currEnums = new Map();
  for (const enm of current.enums) {
    if (!currEnums.has(enm.name)) currEnums.set(enm.name, []);
    currEnums.get(enm.name).push(enm.label);
  }

  for (const [enumName, labels] of Array.from(currEnums.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    const prevLabels = prevEnums.get(enumName) || [];
    if (!prevEnums.has(enumName)) {
      const labelList = labels.map((v) => quoteLiteral(v)).join(', ');
      statements.push(`DO $$ BEGIN CREATE TYPE ${quoteIdent(enumName)} AS ENUM (${labelList}); EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
      continue;
    }
    for (const label of labels) {
      if (!prevLabels.includes(label)) {
        statements.push(`ALTER TYPE ${quoteIdent(enumName)} ADD VALUE IF NOT EXISTS ${quoteLiteral(label)};`);
      }
    }
  }

  for (const tableName of current.tables) {
    if (!previousTableSet.has(tableName)) {
      newlyCreatedTables.add(tableName);
      const tableColumns = current.columns.filter((c) => c.tableName === tableName);
      const tableConstraints = current.constraints.filter((c) => c.tableName === tableName);
      const createdSequences = new Set();
      for (const c of tableColumns) {
        const m = String(c.columnDefault || '').match(/nextval\('([^']+)'::regclass\)/i);
        if (!m) continue;
        const sequenceName = m[1];
        if (createdSequences.has(sequenceName)) continue;
        createdSequences.add(sequenceName);
        statements.push(`DO $$ BEGIN CREATE SEQUENCE IF NOT EXISTS ${quoteIdent(sequenceName)}; EXCEPTION WHEN duplicate_table THEN NULL; END $$;`);
      }
      const bodyParts = [
        ...tableColumns.map((c) => `  ${columnSql(c)}`),
        ...tableConstraints.map((c) => `  CONSTRAINT ${quoteIdent(c.name)} ${c.definition}`),
      ];
      const body = bodyParts.join(',\n');
      statements.push(`CREATE TABLE IF NOT EXISTS ${quoteIdent(tableName)} (\n${body}\n);`);
    }
  }

  for (const [key, currCol] of Array.from(currColumnsByKey.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    const prevCol = prevColumnsByKey.get(key);
    if (!prevCol) {
      if (previousTableSet.has(currCol.tableName) && currentTableSet.has(currCol.tableName)) {
        statements.push(`ALTER TABLE IF EXISTS ${quoteIdent(currCol.tableName)} ADD COLUMN IF NOT EXISTS ${columnSql(currCol)};`);
      }
      continue;
    }
    if (prevCol.typeSql !== currCol.typeSql) {
      statements.push(`DO $$ BEGIN ALTER TABLE IF EXISTS ${quoteIdent(currCol.tableName)} ALTER COLUMN ${quoteIdent(currCol.columnName)} TYPE ${currCol.typeSql} USING ${quoteIdent(currCol.columnName)}::${currCol.typeSql}; EXCEPTION WHEN OTHERS THEN NULL; END $$;`);
    }
    const prevDefault = prevCol.columnDefault || '';
    const currDefault = currCol.columnDefault || '';
    if (prevDefault !== currDefault) {
      if (currDefault) {
        statements.push(`DO $$ BEGIN ALTER TABLE IF EXISTS ${quoteIdent(currCol.tableName)} ALTER COLUMN ${quoteIdent(currCol.columnName)} SET DEFAULT ${currDefault}; EXCEPTION WHEN OTHERS THEN NULL; END $$;`);
      } else {
        statements.push(`DO $$ BEGIN ALTER TABLE IF EXISTS ${quoteIdent(currCol.tableName)} ALTER COLUMN ${quoteIdent(currCol.columnName)} DROP DEFAULT; EXCEPTION WHEN OTHERS THEN NULL; END $$;`);
      }
    }
    if (String(prevCol.isNullable).toUpperCase() !== String(currCol.isNullable).toUpperCase()) {
      if (String(currCol.isNullable).toUpperCase() === 'NO') {
        statements.push(`DO $$ BEGIN ALTER TABLE IF EXISTS ${quoteIdent(currCol.tableName)} ALTER COLUMN ${quoteIdent(currCol.columnName)} SET NOT NULL; EXCEPTION WHEN OTHERS THEN NULL; END $$;`);
      } else {
        statements.push(`DO $$ BEGIN ALTER TABLE IF EXISTS ${quoteIdent(currCol.tableName)} ALTER COLUMN ${quoteIdent(currCol.columnName)} DROP NOT NULL; EXCEPTION WHEN OTHERS THEN NULL; END $$;`);
      }
    }
  }

  const prevConstraintKeys = new Set(previous.constraints.map((c) => `${c.tableName}|${c.name}|${c.definition}`));
  for (const c of current.constraints) {
    if (newlyCreatedTables.has(c.tableName)) continue;
    const key = `${c.tableName}|${c.name}|${c.definition}`;
    if (!prevConstraintKeys.has(key)) {
      statements.push(`DO $$ BEGIN ALTER TABLE IF EXISTS ${quoteIdent(c.tableName)} ADD CONSTRAINT ${quoteIdent(c.name)} ${c.definition}; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`);
    }
  }

  const prevIndexKeys = new Set(previous.indexes.map((i) => `${i.tableName}|${i.name}|${i.definition}`));
  for (const idx of current.indexes) {
    if (newlyCreatedTables.has(idx.tableName) && /_pkey$/i.test(idx.name)) continue;
    const key = `${idx.tableName}|${idx.name}|${idx.definition}`;
    if (!prevIndexKeys.has(key)) {
      statements.push(`${toIndexIfNotExists(idx.definition)};`);
    }
  }

  return statements;
}

function nextMigrationPrefix(migrationsDir) {
  if (!fs.existsSync(migrationsDir)) return '0000';
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
  let max = -1;
  for (const file of files) {
    const m = file.match(/^(\d{4})_/);
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isInteger(n) && n > max) max = n;
  }
  return String(max + 1).padStart(4, '0');
}

function writeStateFiles(stateDir, scope, snapshot, metadata) {
  fs.mkdirSync(stateDir, { recursive: true });
  const snapshotFile = path.join(stateDir, `dev-runtime-${scope}.snapshot.json`);
  const stateFile = path.join(stateDir, `dev-runtime-${scope}.state.env`);
  fs.writeFileSync(snapshotFile, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  const env = [
    `SCOPE=${scope}`,
    `LAST_SUCCESSFUL_BUILD_AT=${metadata.builtAt}`,
    `LAST_SCHEMA_HASH=${metadata.schemaHash}`,
    `LAST_GENERATED_MIGRATION=${metadata.migrationTag || ''}`,
  ].join('\n');
  fs.writeFileSync(stateFile, `${env}\n`, 'utf8');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const scope = String(args.scope || '').trim().toLowerCase();
  if (scope !== 'cloud' && scope !== 'onprem') {
    console.error('ERROR: --scope must be cloud or onprem');
    process.exit(1);
  }

  const cwd = process.cwd();
  const migrationsDir = path.resolve(cwd, String(args['migrations-dir'] || 'migrations'));
  const stateDir = path.resolve(cwd, String(args['state-dir'] || '/antigravity/packages/.build-state'));
  const snapshotFile = path.join(stateDir, `dev-runtime-${scope}.snapshot.json`);
  const fromSnapshotFile = args['from-snapshot'] ? path.resolve(cwd, String(args['from-snapshot'])) : snapshotFile;
  const toSnapshotFile = args['to-snapshot'] ? path.resolve(cwd, String(args['to-snapshot'])) : '';
  const dbUrl = args['db-url'] ? String(args['db-url']) : '';
  const writeState = String(args['write-state'] || 'true').toLowerCase() !== 'false';

  const previous = readSnapshot(fromSnapshotFile) || { tables: [], columns: [], constraints: [], indexes: [], enums: [] };
  const current = toSnapshotFile ? readSnapshot(toSnapshotFile) : readSchemaFromDb(dbUrl);
  if (!current) {
    console.error('ERROR: Unable to load current schema snapshot');
    process.exit(1);
  }

  const previousHash = schemaHash(previous);
  const currentHash = schemaHash(current);

  if (!readSnapshot(fromSnapshotFile)) {
    if (writeState) {
      writeStateFiles(stateDir, scope, current, {
        builtAt: new Date().toISOString(),
        schemaHash: currentHash,
        migrationTag: '',
      });
    }
    console.log(`DBM-0001 baseline initialized scope=${scope} hash=${currentHash}`);
    process.exit(0);
  }

  if (previousHash === currentHash) {
    if (writeState) {
      writeStateFiles(stateDir, scope, current, {
        builtAt: new Date().toISOString(),
        schemaHash: currentHash,
        migrationTag: '',
      });
    }
    console.log(`DBM-0002 no schema changes since last successful build scope=${scope} hash=${currentHash}`);
    process.exit(0);
  }

  const statements = buildDiffSql(previous, current);
  if (statements.length === 0) {
    if (writeState) {
      writeStateFiles(stateDir, scope, current, {
        builtAt: new Date().toISOString(),
        schemaHash: currentHash,
        migrationTag: '',
      });
    }
    console.log(`DBM-0003 schema hash changed but no additive migration statements were required scope=${scope}`);
    process.exit(0);
  }

  fs.mkdirSync(migrationsDir, { recursive: true });
  const prefix = nextMigrationPrefix(migrationsDir);
  const tag = `${prefix}_dev_runtime_${scope}_${previousHash.slice(0, 8)}_${currentHash.slice(0, 8)}`;
  const filePath = path.join(migrationsDir, `${tag}.sql`);
  const header = [
    '-- Auto-generated from DEV runtime DB diff since last successful build',
    `-- Scope: ${scope}`,
    `-- Previous schema hash: ${previousHash}`,
    `-- Current schema hash: ${currentHash}`,
    `-- Generated at: ${new Date().toISOString()}`,
    '',
  ].join('\n');
  fs.writeFileSync(filePath, `${header}${statements.join('\n')}\n`, 'utf8');

  if (writeState) {
    writeStateFiles(stateDir, scope, current, {
      builtAt: new Date().toISOString(),
      schemaHash: currentHash,
      migrationTag: tag,
    });
  }

  console.log(`DBM-1000 generated migration ${filePath}`);
}

main();
