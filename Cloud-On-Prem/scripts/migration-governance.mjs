#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  appendMissingJournalEntries,
  collectSchemaContractFromDb,
  collectSchemaContractFromSchemaFull,
  CLOUD_EXCLUDED_MIGRATION_TAGS,
  evaluateDbSchemaContractCoverage,
  evaluateDbCoverage,
  getDefaultPaths,
  getMigrationHashes,
  getProjectRootFromScriptDir,
  loadFunctionalSchemaExclusions,
  normalizeDeploymentMode,
  parseArgs,
  readDbAppliedHashes,
  readJournal,
  runDrizzleCheck,
  runDrizzleGenerate,
  runMigrationRunner,
  summarizeValidationProblems,
  validateJournalAgainstFiles,
  validateMigrationFileNames,
} from './lib/migration-governance-lib.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = getProjectRootFromScriptDir(__dirname);

const args = parseArgs(process.argv.slice(2));
const command = args._[0] || 'help';

function logInfo(code, message, meta = null) {
  const payload = meta ? ` ${JSON.stringify(meta)}` : '';
  console.log(`[MIG-GOV][${code}] ${message}${payload}`);
}

function logError(code, message, meta = null) {
  const payload = meta ? ` ${JSON.stringify(meta)}` : '';
  console.error(`[MIG-GOV][${code}] ${message}${payload}`);
}

function boolFlag(value) {
  if (value === true) return true;
  if (value === false || value == null) return false;
  const normalized = String(value).toLowerCase();
  return ['1', 'true', 'yes', 'y'].includes(normalized);
}

function requiredArg(name, fallback = null) {
  const value = args[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required argument --${name}`);
  }
  return String(value);
}

function buildValidationContext() {
  const paths = getDefaultPaths(projectRoot);
  const migrationsDir = args['migrations-dir'] ? path.resolve(projectRoot, String(args['migrations-dir'])) : paths.migrationsDir;
  const journalFile = args['journal-file'] ? path.resolve(projectRoot, String(args['journal-file'])) : paths.journalFile;
  const deploymentMode = normalizeDeploymentMode(args['deployment-mode'] || process.env.DEPLOYMENT_MODE || process.env.LEARNPLAY_DEPLOYMENT_MODE || 'onprem');

  const migrationHashes = getMigrationHashes(migrationsDir, deploymentMode);
  const journal = readJournal(journalFile);
  const filenameIssues = validateMigrationFileNames(migrationHashes.files);
  const journalIssues = validateJournalAgainstFiles({ files: migrationHashes.files, journal });
  if (deploymentMode === 'cloud' && journalIssues.extraInJournal.length > 0) {
    journalIssues.extraInJournal = journalIssues.extraInJournal.filter(
      (tag) => !CLOUD_EXCLUDED_MIGRATION_TAGS.has(tag),
    );
  }
  const problems = summarizeValidationProblems({ filenameIssues, journalIssues });

  return {
    migrationsDir,
    journalFile,
    deploymentMode,
    migrationHashes,
    journal,
    filenameIssues,
    journalIssues,
    problems,
  };
}

function validateFilesCommand() {
  let context = buildValidationContext();
  const autoRemediateJournal = boolFlag(args['auto-remediate-journal']);

  if (
    autoRemediateJournal &&
    context.problems.length > 0 &&
    context.journalIssues.missingInJournal.length > 0 &&
    context.filenameIssues.invalid.length === 0 &&
    context.filenameIssues.duplicateNames.length === 0 &&
    context.filenameIssues.duplicatePrefixes.length === 0 &&
    context.journalIssues.extraInJournal.length === 0 &&
    context.journalIssues.duplicateJournalTags.length === 0 &&
    context.journalIssues.indexIssues.length === 0
  ) {
    const added = appendMissingJournalEntries(context.journalFile, context.journalIssues.missingInJournal);
    logInfo('MGV-1002', 'Auto-remediated missing journal entries during validate', { added: added.added });
    context = buildValidationContext();
  }

  const summary = {
    deploymentMode: context.deploymentMode,
    migrationFileCount: context.migrationHashes.files.length,
    missingInJournal: context.journalIssues.missingInJournal,
    problems: context.problems,
  };

  if (context.problems.length > 0) {
    logError('MGV-1001', 'Migration file/journal validation failed', summary);
    process.exit(1);
  }

  logInfo('MGV-0000', 'Migration file/journal validation passed', summary);
}

function verifyDbCoverage(dbUrl, context, errorCodePrefix = 'MGV-2', options = {}) {
  const allowUnknownHistory = options.allowUnknownHistory === true;
  const allowLegacyHashDrift = options.allowLegacyHashDrift === true;
  const dbState = readDbAppliedHashes(dbUrl);
  if (!dbState.tableExists) {
    return {
      ok: false,
      errorCode: `${errorCodePrefix}001`,
      message: 'drizzleMigrations table is missing',
      dbState,
    };
  }

  const coverage = evaluateDbCoverage({
    dbHashes: dbState.hashes,
    migrationHashes: context.migrationHashes,
  });

  if (coverage.unknown.length > 0 && !allowUnknownHistory) {
    return {
      ok: false,
      errorCode: `${errorCodePrefix}002`,
      message: 'Database journal has unknown migration hashes not present in package',
      dbState,
      coverage,
    };
  }

  if (!coverage.isComplete) {
    if (allowLegacyHashDrift && coverage.unknown.length > 0 && coverage.missing.length > 0) {
      const latestHash = context.migrationHashes.byTag.get(
        context.migrationHashes.files.at(-1)?.replace(/\.sql$/, '') || '',
      )?.hash;
      if (latestHash && dbState.hashes.includes(latestHash)) {
        return {
          ok: true,
          dbState,
          coverage,
          legacyHashDrift: true,
        };
      }
    }
    return {
      ok: false,
      errorCode: `${errorCodePrefix}003`,
      message: 'Database is missing one or more required migration hashes',
      dbState,
      coverage,
    };
  }

  return {
    ok: true,
    dbState,
    coverage,
  };
}

function maybeAutoGenerate(context, dbUrl) {
  const autoGenerate = boolFlag(args['auto-generate']);
  if (!autoGenerate) return false;

  const check = runDrizzleCheck({ projectRoot, dbUrl });
  if (!check.driftDetected) {
    logInfo('MGV-2101', 'No schema drift detected by drizzle-kit check');
    return false;
  }

  logInfo('MGV-2102', 'Schema drift detected. Generating migration automatically');
  const generated = runDrizzleGenerate({
    projectRoot,
    dbUrl,
    migrationName: args['migration-name'] ? String(args['migration-name']) : undefined,
  });

  if (!generated.ok) {
    logError('MGV-9101', 'Automatic migration generation failed', {
      stderr: generated.result.stderr,
      stdout: generated.result.stdout,
    });
    process.exit(1);
  }

  logInfo('MGV-2103', 'Automatic migration generation completed', {
    migrationName: generated.migrationName,
  });
  return true;
}

function verifyDevCommand() {
  const dbUrl = requiredArg('db-url', process.env.DATABASE_URL);
  const autoRemediate = boolFlag(args['auto-remediate']);
  let context = buildValidationContext();

  if (context.problems.length > 0) {
    if (autoRemediate && context.journalIssues.missingInJournal.length > 0 && context.problems.length === 1) {
      const added = appendMissingJournalEntries(context.journalFile, context.journalIssues.missingInJournal);
      logInfo('MGV-2001', 'Auto-remediated missing journal entries', { added: added.added });
      context = buildValidationContext();
    }
  }

  if (context.problems.length > 0) {
    logError('MGV-9001', 'DEV gate failed: file/journal mismatch', {
      problems: context.problems,
    });
    process.exit(1);
  }

  let dbResult = verifyDbCoverage(dbUrl, context, 'MGV-3');
  if (!dbResult.ok && dbResult.errorCode === 'MGV-3002') {
    dbResult = verifyDbCoverage(dbUrl, context, 'MGV-3', { allowUnknownHistory: true });
  }
  if (!dbResult.ok && autoRemediate) {
    logInfo('MGV-2002', 'DEV gate mismatch detected, running migration auto-remediation', {
      reason: dbResult.message,
      code: dbResult.errorCode,
    });

    maybeAutoGenerate(context, dbUrl);

    const migrateResult = runMigrationRunner({
      projectRoot,
      dbUrl,
      deploymentMode: context.deploymentMode,
      allowJournalRepair: true,
    });

    if (!migrateResult.ok) {
      logError('MGV-9002', 'Migration runner failed during DEV auto-remediation', {
        stderr: migrateResult.stderr,
        stdout: migrateResult.stdout,
      });
      process.exit(1);
    }

    context = buildValidationContext();
    dbResult = verifyDbCoverage(dbUrl, context, 'MGV-3');
    if (!dbResult.ok && dbResult.errorCode === 'MGV-3002') {
      dbResult = verifyDbCoverage(dbUrl, context, 'MGV-3', { allowUnknownHistory: true });
    }
  }

  if (!dbResult.ok) {
    logError(dbResult.errorCode || 'MGV-9003', `DEV gate failed: ${dbResult.message}`, {
      coverage: dbResult.coverage,
    });
    process.exit(1);
  }

  if (dbResult.coverage?.unknown?.length) {
    logInfo('MGV-2104', 'DEV DB contains historical unknown journal hashes; continuing for backward compatibility', {
      unknownCount: dbResult.coverage.unknown.length,
    });
  }

  logInfo('MGV-0001', 'DEV gate passed: migration files, journal, and DEV DB are aligned', {
    deploymentMode: context.deploymentMode,
    migrationCount: context.migrationHashes.files.length,
  });
}

function detectDriftCommand() {
  const dbUrl = requiredArg('db-url', process.env.DATABASE_URL);
  const check = runDrizzleCheck({ projectRoot, dbUrl });
  if (check.driftDetected) {
    logError('MGV-4001', 'Schema drift detected', {
      stderr: check.result.stderr,
      stdout: check.result.stdout,
    });
    process.exit(1);
  }

  logInfo('MGV-0002', 'No schema drift detected');
}

function verifyPromotionCommand() {
  const sourceDbUrl = requiredArg('source-db-url');
  const targetDbUrl = requiredArg('target-db-url');
  const dryRun = boolFlag(args['dry-run']);
  const autoApplyTarget = boolFlag(args['apply']);
  const strictCoverage = boolFlag(args['strict-coverage']);

  const exclusionsFile = args['functional-exclusions-file']
    ? path.resolve(projectRoot, String(args['functional-exclusions-file']))
    : path.join(projectRoot, 'scripts', 'schema', 'functional-schema-exclusions.json');
  const functionalExclusions = loadFunctionalSchemaExclusions(exclusionsFile);

  const deploymentMode = normalizeDeploymentMode(
    args['deployment-mode'] || process.env.DEPLOYMENT_MODE || process.env.LEARNPLAY_DEPLOYMENT_MODE || 'onprem',
  );

  const sourceContract = collectSchemaContractFromDb(sourceDbUrl, { exclusions: functionalExclusions });
  if ((sourceContract.requiredTables || []).length === 0) {
    logError('MGV-9004', 'Promotion gate failed: source schema contract is empty');
    process.exit(1);
  }

  const targetCoverage = evaluateDbSchemaContractCoverage({
    dbUrl: targetDbUrl,
    contract: sourceContract,
  });

  const missingTotal =
    targetCoverage.missingTables.length +
    targetCoverage.missingColumns.length +
    targetCoverage.missingEnums.length +
    targetCoverage.missingConstraints.length +
    targetCoverage.missingIndexes.length;

  logInfo('MGV-5002', 'Promotion gate schema contract evaluation complete', {
    dryRun,
    autoApplyTarget,
    strictCoverage,
    required: targetCoverage.requiredCounts,
    missing: {
      tables: targetCoverage.missingTables.length,
      columns: targetCoverage.missingColumns.length,
      enums: targetCoverage.missingEnums.length,
      constraints: targetCoverage.missingConstraints.length,
      indexes: targetCoverage.missingIndexes.length,
    },
  });

  if (missingTotal === 0) {
    logInfo('MGV-0004', 'Target already satisfies DEV schema contract');
    return;
  }

  if (dryRun && !autoApplyTarget) {
    logInfo('MGV-0003', 'Promotion dry-run: target is behind DEV schema contract; update stage will reconcile', {
      sampleMissing: {
        tables: targetCoverage.missingTables.slice(0, 20),
        columns: targetCoverage.missingColumns.slice(0, 30),
        enums: targetCoverage.missingEnums.slice(0, 20),
        constraints: targetCoverage.missingConstraints.slice(0, 20),
        indexes: targetCoverage.missingIndexes.slice(0, 20),
      },
    });
    return;
  }

  if (!autoApplyTarget && strictCoverage) {
    logError('MGV-5003', 'Target is behind DEV schema contract and strict coverage is enabled', {
      sampleMissing: {
        tables: targetCoverage.missingTables.slice(0, 20),
        columns: targetCoverage.missingColumns.slice(0, 30),
        enums: targetCoverage.missingEnums.slice(0, 20),
        constraints: targetCoverage.missingConstraints.slice(0, 20),
        indexes: targetCoverage.missingIndexes.slice(0, 20),
      },
    });
    process.exit(1);
  }

  if (!autoApplyTarget) {
    logInfo('MGV-0006', 'Promotion gate noted schema gap; no apply requested');
    return;
  }

  const migrateResult = runMigrationRunner({
    projectRoot,
    dbUrl: targetDbUrl,
    deploymentMode,
    allowJournalRepair: true,
  });

  if (!migrateResult.ok) {
    logError('MGV-9006', 'Target migration apply failed during promotion gate', {
      stderr: migrateResult.stderr,
      stdout: migrateResult.stdout,
    });
    process.exit(1);
  }

  const postCoverage = evaluateDbSchemaContractCoverage({
    dbUrl: targetDbUrl,
    contract: sourceContract,
  });
  if (!postCoverage.isComplete) {
    logError('MGV-9007', 'Post-apply verification failed for promotion target', {
      sampleMissing: {
        tables: postCoverage.missingTables.slice(0, 20),
        columns: postCoverage.missingColumns.slice(0, 30),
        enums: postCoverage.missingEnums.slice(0, 20),
        constraints: postCoverage.missingConstraints.slice(0, 20),
        indexes: postCoverage.missingIndexes.slice(0, 20),
      },
    });
    process.exit(1);
  }

  logInfo('MGV-0005', 'Promotion gate passed after applying target migrations');
}

function verifyRuntimeContractCommand() {
  const dbUrl = requiredArg('db-url', process.env.DATABASE_URL);
  const functionalOnly = boolFlag(args['functional-only']);
  const deploymentMode = normalizeDeploymentMode(
    args['deployment-mode'] || process.env.DEPLOYMENT_MODE || process.env.LEARNPLAY_DEPLOYMENT_MODE || 'onprem',
  );
  let schemaFile = '';
  if (args['contract-schema-file']) {
    schemaFile = path.resolve(projectRoot, String(args['contract-schema-file']));
  } else {
    const candidates = [
      path.join(projectRoot, 'schema-full.sql'),
      deploymentMode === 'cloud'
        ? path.join(projectRoot, 'dist-cloud', 'schema-full.sql')
        : path.join(projectRoot, 'dist-onprem', 'schema-full.sql'),
      path.join(projectRoot, 'dist', 'schema-full.sql'),
    ];
    schemaFile = candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
  }
  const exclusionsFile = args['functional-exclusions-file']
    ? path.resolve(projectRoot, String(args['functional-exclusions-file']))
    : path.join(projectRoot, 'scripts', 'schema', 'functional-schema-exclusions.json');
  const functionalExclusions = loadFunctionalSchemaExclusions(exclusionsFile);

  const contract = collectSchemaContractFromSchemaFull(schemaFile, { exclusions: functionalExclusions });
  const coverage = evaluateDbSchemaContractCoverage({
    dbUrl,
    contract,
  });
  const functionalMissingTotal =
    coverage.missingTables.length + coverage.missingColumns.length + coverage.missingEnums.length;

  if (functionalOnly) {
    if (functionalMissingTotal > 0) {
      logError('MGV-9101', 'Runtime schema contract failed', {
        mode: 'functional-only',
        missingTables: coverage.missingTables.slice(0, 25),
        missingColumns: coverage.missingColumns.slice(0, 50),
        missingEnums: coverage.missingEnums.slice(0, 25),
        requiredCounts: coverage.requiredCounts,
      });
      process.exit(1);
    }

    logInfo('MGV-0011', 'Runtime functional schema contract passed', {
      requiredCounts: coverage.requiredCounts,
      ignoredStructuralDrift: {
        missingConstraints: coverage.missingConstraints.length,
        missingIndexes: coverage.missingIndexes.length,
      },
    });
    return;
  }

  if (!coverage.isComplete) {
    logError('MGV-9101', 'Runtime schema contract failed', {
      missingTables: coverage.missingTables.slice(0, 25),
      missingColumns: coverage.missingColumns.slice(0, 50),
      missingEnums: coverage.missingEnums.slice(0, 25),
      missingConstraints: coverage.missingConstraints.slice(0, 25),
      missingIndexes: coverage.missingIndexes.slice(0, 25),
      requiredCounts: coverage.requiredCounts,
    });
    process.exit(1);
  }

  logInfo('MGV-0010', 'Runtime schema contract passed', {
    requiredCounts: coverage.requiredCounts,
  });
}

function printHelp() {
  console.log(`Usage:\n  node scripts/migration-governance.mjs <command> [options]\n\nCommands:\n  validate                 Validate migration file naming + journal alignment\n  detect-drift             Run drizzle-kit check against DB schema\n  verify-dev               Validate file/journal/DEV DB alignment\n  verify-runtime-contract  Validate required runtime schema contract only\n  verify-promotion         Validate source/target promotion safety\n\nCommon options:\n  --deployment-mode <cloud|onprem>\n  --migrations-dir <path>\n  --journal-file <path>\n\nverify-dev options:\n  --db-url <postgres-url>\n  --auto-remediate\n  --auto-generate\n  --migration-name <name>\n\nverify-runtime-contract options:\n  --db-url <postgres-url>\n  --contract-schema-file <path>   (default: ./schema-full.sql)\n  --functional-exclusions-file <path>\n  --functional-only               Validate only tables/columns/enums; ignore constraint/index name drift\n\nverify-promotion options:\n  --source-db-url <postgres-url>\n  --target-db-url <postgres-url>\n  --dry-run\n  --apply\n  --functional-exclusions-file <path>\n  --strict-coverage\n`);
}

try {
  switch (command) {
    case 'validate':
      validateFilesCommand();
      break;
    case 'detect-drift':
      detectDriftCommand();
      break;
    case 'verify-dev':
      verifyDevCommand();
      break;
    case 'verify-runtime-contract':
      verifyRuntimeContractCommand();
      break;
    case 'verify-promotion':
      verifyPromotionCommand();
      break;
    case 'help':
    default:
      printHelp();
      if (command !== 'help') process.exit(1);
  }
} catch (error) {
  logError('MGV-9999', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
