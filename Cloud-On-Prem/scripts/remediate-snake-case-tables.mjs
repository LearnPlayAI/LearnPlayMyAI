#!/usr/bin/env node
import { execFileSync } from "child_process";

const LEGACY_TABLE_MAPPINGS = [
  { snake: "podcast_provider_cost_ledger", camel: "podcastProviderCostLedger" },
  { snake: "podcast_settlement_ledger", camel: "podcastSettlementLedger" },
  { snake: "branding_themes", camel: "brandingThemes" },
  { snake: "organization_domains", camel: "organizationDomains" },
  { snake: "enterprise_customers", camel: "enterpriseCustomers" },
  { snake: "enterprise_documents", camel: "enterpriseDocuments" },
  { snake: "build_versions", camel: "buildVersions" },
  { snake: "enterprise_license_requests", camel: "enterpriseLicenseRequests" },
  { snake: "enterprise_license_keys", camel: "enterpriseLicenseKeys" },
  { snake: "onprem_license_state", camel: "onpremLicenseState" },
  { snake: "enterprise_revenue_sync", camel: "enterpriseRevenueSync" },
  { snake: "enterprise_agreement_templates", camel: "enterpriseAgreementTemplates" },
  { snake: "enterprise_keyring", camel: "enterpriseKeyring" },
  { snake: "enterprise_systems", camel: "enterpriseSystems" },
  { snake: "enterprise_system_daily_telemetry", camel: "enterpriseSystemDailyTelemetry" },
  { snake: "__drizzle_migrations", camel: "drizzleMigrations" },
];

function parseArgs(argv) {
  const args = {
    dryRun: false,
    strict: true,
    dbUrl: process.env.DATABASE_URL || "",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    if (arg === "--db-url") {
      args.dbUrl = argv[i + 1] || "";
      i += 1;
      continue;
    }
    if (arg === "--strict") {
      args.strict = true;
      continue;
    }
    if (arg === "--no-strict") {
      args.strict = false;
      continue;
    }
  }
  return args;
}

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function quoteLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function snakeToCamel(value) {
  return String(value).replace(/_([a-z])/g, (_m, c) => c.toUpperCase());
}

function isSnakeCaseTable(name) {
  return /^[a-z0-9]+(_[a-z0-9]+)+$/.test(name);
}

function runPsql(dbUrl, sql) {
  return execFileSync(
    "psql",
    [
      "-X",
      "-v",
      "ON_ERROR_STOP=1",
      "-d",
      dbUrl,
      "-At",
      "-F",
      "\t",
      "-c",
      sql,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
  ).trim();
}

function runSql(dbUrl, sql, dryRun) {
  if (dryRun) {
    console.log(`[dry-run] ${sql}`);
    return "";
  }
  return runPsql(dbUrl, sql);
}

function dropDeferredSnakeTables(dbUrl, tables, dryRun) {
  const pending = Array.from(new Set(tables));
  if (pending.length === 0) {
    return;
  }
  if (dryRun) {
    for (const table of pending) {
      runSql(dbUrl, `DROP TABLE ${quoteIdent(table)}`, true);
    }
    return;
  }

  let unresolved = pending.map((table) => ({ table, error: "" }));
  while (unresolved.length > 0) {
    let progress = false;
    const next = [];
    for (const item of unresolved) {
      try {
        runSql(dbUrl, `DROP TABLE ${quoteIdent(item.table)}`, false);
        console.log(`  dropped snake table ${item.table} after successful transfer`);
        progress = true;
      } catch (error) {
        next.push({
          table: item.table,
          error: error?.message || String(error),
        });
      }
    }
    if (!progress) {
      const details = next.map((item) => `${item.table}: ${item.error}`).join("; ");
      throw new Error(`Unable to drop migrated snake tables due to dependencies: ${details}`);
    }
    unresolved = next;
  }
}

function listPublicTables(dbUrl) {
  const output = runPsql(
    dbUrl,
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name`
  );
  return output ? output.split("\n").map((line) => line.trim()).filter(Boolean) : [];
}

function tableExists(dbUrl, tableName) {
  const output = runPsql(
    dbUrl,
    `SELECT EXISTS (
       SELECT 1
         FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = ${quoteLiteral(tableName)}
     )`
  );
  return output === "t";
}

function getColumns(dbUrl, tableName) {
  const output = runPsql(
    dbUrl,
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ${quoteLiteral(tableName)}
      ORDER BY ordinal_position`
  );
  return output ? output.split("\n").map((line) => line.trim()).filter(Boolean) : [];
}

function rowCount(dbUrl, tableName) {
  const output = runPsql(dbUrl, `SELECT COUNT(*)::bigint FROM ${quoteIdent(tableName)}`);
  return Number(output || 0);
}

function renameSnakeColumnsOnCamelTable(dbUrl, tableName, dryRun) {
  const columns = getColumns(dbUrl, tableName);
  const colSet = new Set(columns);

  for (const oldCol of columns) {
    if (!oldCol.includes("_")) continue;
    const newCol = snakeToCamel(oldCol);
    if (!newCol || newCol === oldCol || colSet.has(newCol)) continue;

    const sql = `ALTER TABLE ${quoteIdent(tableName)} RENAME COLUMN ${quoteIdent(oldCol)} TO ${quoteIdent(newCol)}`;
    runSql(dbUrl, sql, dryRun);
    if (!dryRun) {
      console.log(`  renamed column ${tableName}.${oldCol} -> ${newCol}`);
    }
  }
}

function migrateDataIfDualTables(dbUrl, snakeTable, camelTable, dryRun) {
  const snakeCols = getColumns(dbUrl, snakeTable);
  const camelCols = getColumns(dbUrl, camelTable);
  const camelSet = new Set(camelCols);

  const sourceCols = [];
  const targetCols = [];
  const sourceColsNoId = [];
  const targetColsNoId = [];
  for (const snakeCol of snakeCols) {
    const camelGuess = snakeToCamel(snakeCol);
    if (camelSet.has(camelGuess)) {
      sourceCols.push(quoteIdent(snakeCol));
      targetCols.push(quoteIdent(camelGuess));
      if (snakeCol !== "id" && camelGuess !== "id") {
        sourceColsNoId.push(quoteIdent(snakeCol));
        targetColsNoId.push(quoteIdent(camelGuess));
      }
      continue;
    }
    if (camelSet.has(snakeCol)) {
      sourceCols.push(quoteIdent(snakeCol));
      targetCols.push(quoteIdent(snakeCol));
      if (snakeCol !== "id") {
        sourceColsNoId.push(quoteIdent(snakeCol));
        targetColsNoId.push(quoteIdent(snakeCol));
      }
    }
  }

  if (sourceCols.length === 0) {
    throw new Error(`No shared columns for ${snakeTable} -> ${camelTable}; cannot migrate safely`);
  }

  const insertSql = [
    `INSERT INTO ${quoteIdent(camelTable)} (${targetCols.join(", ")})`,
    `SELECT ${sourceCols.join(", ")} FROM ${quoteIdent(snakeTable)}`,
    "ON CONFLICT DO NOTHING",
  ].join(" ");
  runSql(dbUrl, insertSql, dryRun);

  const snakeRows = rowCount(dbUrl, snakeTable);
  if (snakeRows === 0) {
    return { dropSafe: true };
  }

  const snakeHasId = snakeCols.includes("id");
  const camelHasId = camelCols.includes("id");
  if (snakeHasId && camelHasId) {
    const missingRaw = runPsql(
      dbUrl,
      `SELECT COUNT(*)::bigint
         FROM ${quoteIdent(snakeTable)} s
    LEFT JOIN ${quoteIdent(camelTable)} c
           ON c.id = s.id
        WHERE c.id IS NULL`
    );
    const missing = Number(missingRaw || 0);
    if (missing > 0) {
      if (sourceColsNoId.length === 0 || targetColsNoId.length === 0) {
        throw new Error(`Refusing to drop ${snakeTable}: ${missing} id row(s) missing in ${camelTable}`);
      }
      const valueMissingRaw = runPsql(
        dbUrl,
        `SELECT COUNT(*)::bigint
           FROM (
             SELECT ${sourceColsNoId.join(", ")} FROM ${quoteIdent(snakeTable)}
             EXCEPT
             SELECT ${targetColsNoId.join(", ")} FROM ${quoteIdent(camelTable)}
           ) d`
      );
      const valueMissing = Number(valueMissingRaw || 0);
      if (valueMissing > 0) {
        throw new Error(
          `Refusing to drop ${snakeTable}: ${missing} id row(s) and ${valueMissing} value row(s) missing in ${camelTable}`
        );
      }
      console.warn(
        `  ${snakeTable} id parity differs but value parity matched on shared columns; proceeding with drop`
      );
    }
  } else {
    if (sourceColsNoId.length === 0 || targetColsNoId.length === 0) {
      throw new Error(`Cannot prove parity for ${snakeTable} -> ${camelTable}: missing id key and no comparable columns`);
    }
    const valueMissingRaw = runPsql(
      dbUrl,
      `SELECT COUNT(*)::bigint
         FROM (
           SELECT ${sourceColsNoId.join(", ")} FROM ${quoteIdent(snakeTable)}
           EXCEPT
           SELECT ${targetColsNoId.join(", ")} FROM ${quoteIdent(camelTable)}
         ) d`
    );
    const valueMissing = Number(valueMissingRaw || 0);
    if (valueMissing > 0) {
      throw new Error(
        `Cannot prove parity for ${snakeTable} -> ${camelTable}: missing id key and ${valueMissing} value row(s) absent`
      );
    }
    console.warn(
      `  ${snakeTable} parity proved via shared non-id columns; proceeding with drop`
    );
  }

  return { dropSafe: true };
}

function buildMappings(dbUrl) {
  const tables = listPublicTables(dbUrl);
  const tableSet = new Set(tables);
  const merged = new Map();

  for (const mapping of LEGACY_TABLE_MAPPINGS) {
    merged.set(mapping.snake, mapping.camel);
  }

  for (const table of tables) {
    if (!isSnakeCaseTable(table)) continue;
    if (!merged.has(table)) {
      merged.set(table, snakeToCamel(table));
    }
  }

  const mappings = [];
  for (const [snake, camel] of merged.entries()) {
    const snakeExists = tableSet.has(snake);
    const camelExists = tableSet.has(camel);
    if (!snakeExists && !camelExists) continue;
    mappings.push({ snake, camel, snakeExists, camelExists });
  }

  return mappings.sort((a, b) => a.snake.localeCompare(b.snake));
}

function unresolvedSnakeTables(dbUrl) {
  return listPublicTables(dbUrl).filter((table) => isSnakeCaseTable(table));
}

function run() {
  const { dryRun, dbUrl, strict } = parseArgs(process.argv.slice(2));
  if (!dbUrl) {
    throw new Error("DATABASE_URL is required (or provide --db-url)");
  }

  console.log(`Snake->camel remediation started${dryRun ? " (dry-run)" : ""}${strict ? " [strict]" : ""}`);

  const mappings = buildMappings(dbUrl);
  const deferredDrops = [];
  for (const mapping of mappings) {
    const snakeExists = tableExists(dbUrl, mapping.snake);
    const camelExists = tableExists(dbUrl, mapping.camel);
    if (!snakeExists && !camelExists) continue;

    console.log(`• ${mapping.snake} -> ${mapping.camel}`);
    if (snakeExists && !camelExists) {
      const renameSql = `ALTER TABLE ${quoteIdent(mapping.snake)} RENAME TO ${quoteIdent(mapping.camel)}`;
      runSql(dbUrl, renameSql, dryRun);
      if (!dryRun) {
        console.log(`  renamed table ${mapping.snake} -> ${mapping.camel}`);
      }
      renameSnakeColumnsOnCamelTable(dbUrl, mapping.camel, dryRun);
      continue;
    }

    if (snakeExists && camelExists) {
      const result = migrateDataIfDualTables(dbUrl, mapping.snake, mapping.camel, dryRun);
      if (result?.dropSafe) {
        deferredDrops.push(mapping.snake);
      }
      renameSnakeColumnsOnCamelTable(dbUrl, mapping.camel, dryRun);
      continue;
    }

    renameSnakeColumnsOnCamelTable(dbUrl, mapping.camel, dryRun);
  }

  dropDeferredSnakeTables(dbUrl, deferredDrops, dryRun);

  const unresolved = unresolvedSnakeTables(dbUrl).filter((table) => table !== "__drizzle_migrations");
  if (unresolved.length > 0) {
    const message = `Unresolved snake_case tables remain: ${unresolved.join(", ")}`;
    if (strict) {
      throw new Error(message);
    }
    console.warn(message);
  }

  if (dryRun) {
    console.log("Dry-run complete; no changes committed");
  } else {
    console.log("Snake->camel remediation committed");
  }
}

try {
  run();
} catch (error) {
  console.error("Snake->camel remediation failed:", error?.message || error);
  process.exit(1);
}
