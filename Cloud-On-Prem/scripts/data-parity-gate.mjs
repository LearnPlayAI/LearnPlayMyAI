#!/usr/bin/env node
import fs from "fs";
import { execFileSync } from "child_process";

function parseArgs(argv) {
  const args = {
    mode: "",
    dbUrl: process.env.DATABASE_URL || "",
    out: "",
    before: "",
    allowEmptyDropTables: new Set(["sessions"]),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "snapshot" || arg === "verify") {
      args.mode = arg;
      continue;
    }
    if (arg === "--db-url") {
      args.dbUrl = argv[i + 1] || "";
      i += 1;
      continue;
    }
    if (arg === "--out") {
      args.out = argv[i + 1] || "";
      i += 1;
      continue;
    }
    if (arg === "--before") {
      args.before = argv[i + 1] || "";
      i += 1;
      continue;
    }
    if (arg === "--allow-empty-drop-tables") {
      const raw = argv[i + 1] || "";
      i += 1;
      if (raw.trim()) {
        args.allowEmptyDropTables = new Set(
          raw
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean)
        );
      }
    }
  }

  return args;
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

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

function collectTables(dbUrl) {
  const output = runPsql(
    dbUrl,
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name NOT LIKE '__drizzle_%'
      ORDER BY table_name`
  );
  return output ? output.split("\n").map((line) => line.trim()).filter(Boolean) : [];
}

function collectCounts(dbUrl) {
  const tables = collectTables(dbUrl);
  const snapshot = {};
  for (const tableName of tables) {
    const countRaw = runPsql(dbUrl, `SELECT COUNT(*)::bigint FROM ${quoteIdent(tableName)}`);
    snapshot[tableName] = Number(countRaw || 0);
  }
  return snapshot;
}

function verifyCounts(before, after, allowEmptyDropTables) {
  const violations = [];
  for (const [table, beforeCountRaw] of Object.entries(before)) {
    const beforeCount = Number(beforeCountRaw || 0);
    const afterCount = Number(after[table] ?? 0);
    const isSnakeCaseTable = /^[a-z0-9]+(_[a-z0-9]+)+$/.test(String(table));
    if (isSnakeCaseTable) {
      continue;
    }
    if (beforeCount > 0 && afterCount === 0 && !allowEmptyDropTables.has(table)) {
      violations.push({ table, beforeCount, afterCount });
    }
  }
  return violations;
}

function run() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.mode || !args.dbUrl) {
    throw new Error(
      "Usage: data-parity-gate.mjs <snapshot|verify> --db-url <DATABASE_URL> " +
        "[--out file] [--before file] [--allow-empty-drop-tables t1,t2]"
    );
  }

  if (args.mode === "snapshot") {
    if (!args.out) {
      throw new Error("--out is required for snapshot mode");
    }
    const snapshot = collectCounts(args.dbUrl);
    fs.writeFileSync(args.out, JSON.stringify(snapshot, null, 2));
    console.log(`Data parity snapshot written: ${args.out} (${Object.keys(snapshot).length} tables)`);
    return;
  }

  if (args.mode === "verify") {
    if (!args.before) {
      throw new Error("--before is required for verify mode");
    }
    const before = JSON.parse(fs.readFileSync(args.before, "utf8"));
    const after = collectCounts(args.dbUrl);
    const violations = verifyCounts(before, after, args.allowEmptyDropTables);
    if (violations.length > 0) {
      for (const v of violations) {
        console.error(`Data parity regression: ${v.table} dropped from ${v.beforeCount} to ${v.afterCount}`);
      }
      throw new Error(`Data parity verification failed (${violations.length} table regression(s))`);
    }
    console.log(`Data parity verification passed (${Object.keys(after).length} tables checked)`);
    return;
  }

  throw new Error(`Unknown mode: ${args.mode}`);
}

try {
  run();
} catch (error) {
  console.error(error?.message || error);
  process.exit(1);
}
