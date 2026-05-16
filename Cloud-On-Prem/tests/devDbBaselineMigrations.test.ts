import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { describe, expect, it } from '@jest/globals';

function runGenerator(args: string[], cwd: string) {
  return spawnSync('node', ['scripts/dev-db-baseline-migrations.mjs', ...args], {
    cwd,
    encoding: 'utf8',
  });
}

function writeJson(filePath: string, data: any) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

describe('dev runtime baseline migration generator', () => {
  const projectRoot = path.resolve(__dirname, '..');

  it('initializes baseline state without generating migration on first build', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-db-baseline-init-'));
    const migrationsDir = path.join(tempDir, 'migrations');
    const stateDir = path.join(tempDir, 'state');
    const toSnapshot = path.join(tempDir, 'to.json');

    fs.mkdirSync(migrationsDir, { recursive: true });
    writeJson(toSnapshot, {
      tables: ['users'],
      columns: [{ tableName: 'users', columnName: 'id', typeSql: 'text', isNullable: 'NO', columnDefault: null, ordinal: 1 }],
      constraints: [],
      indexes: [],
      enums: [],
    });

    const result = runGenerator([
      '--scope',
      'cloud',
      '--migrations-dir',
      migrationsDir,
      '--state-dir',
      stateDir,
      '--to-snapshot',
      toSnapshot,
      '--write-state',
      'true',
    ], projectRoot);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('DBM-0001');
    expect(fs.existsSync(path.join(stateDir, 'dev-runtime-cloud.snapshot.json'))).toBe(true);
    expect(fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).length).toBe(0);
  });

  it('generates one migration for schema diff and then no-ops when unchanged', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dev-db-baseline-diff-'));
    const migrationsDir = path.join(tempDir, 'migrations');
    const prevSnapshot = path.join(tempDir, 'prev.json');
    const currSnapshot = path.join(tempDir, 'curr.json');
    const sameSnapshot = path.join(tempDir, 'same.json');

    fs.mkdirSync(migrationsDir, { recursive: true });
    fs.writeFileSync(path.join(migrationsDir, '0001_initial.sql'), '-- baseline\n', 'utf8');

    writeJson(prevSnapshot, {
      tables: ['users'],
      columns: [{ tableName: 'users', columnName: 'id', typeSql: 'text', isNullable: 'NO', columnDefault: null, ordinal: 1 }],
      constraints: [],
      indexes: [],
      enums: [],
    });

    writeJson(currSnapshot, {
      tables: ['users'],
      columns: [
        { tableName: 'users', columnName: 'id', typeSql: 'text', isNullable: 'NO', columnDefault: null, ordinal: 1 },
        { tableName: 'users', columnName: 'email', typeSql: 'text', isNullable: 'YES', columnDefault: null, ordinal: 2 },
      ],
      constraints: [],
      indexes: [],
      enums: [],
    });

    writeJson(sameSnapshot, {
      tables: ['users'],
      columns: [
        { tableName: 'users', columnName: 'id', typeSql: 'text', isNullable: 'NO', columnDefault: null, ordinal: 1 },
        { tableName: 'users', columnName: 'email', typeSql: 'text', isNullable: 'YES', columnDefault: null, ordinal: 2 },
      ],
      constraints: [],
      indexes: [],
      enums: [],
    });

    const generated = runGenerator([
      '--scope',
      'onprem',
      '--migrations-dir',
      migrationsDir,
      '--state-dir',
      path.join(tempDir, 'state'),
      '--from-snapshot',
      prevSnapshot,
      '--to-snapshot',
      currSnapshot,
      '--write-state',
      'false',
    ], projectRoot);
    expect(generated.status).toBe(0);
    expect(generated.stdout).toContain('DBM-1000');

    const sqlFilesAfterFirst = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
    expect(sqlFilesAfterFirst.length).toBe(2);
    const newMigration = path.join(migrationsDir, sqlFilesAfterFirst[1]);
    const sql = fs.readFileSync(newMigration, 'utf8');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS');

    const noChange = runGenerator([
      '--scope',
      'onprem',
      '--migrations-dir',
      migrationsDir,
      '--state-dir',
      path.join(tempDir, 'state'),
      '--from-snapshot',
      currSnapshot,
      '--to-snapshot',
      sameSnapshot,
      '--write-state',
      'false',
    ], projectRoot);
    expect(noChange.status).toBe(0);
    expect(noChange.stdout).toContain('DBM-0002');
    const sqlFilesAfterSecond = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
    expect(sqlFilesAfterSecond.length).toBe(2);
  });
});
