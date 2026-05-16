import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { describe, expect, it } from '@jest/globals';

function runGovernance(args: string[], cwd: string) {
  return spawnSync('node', ['scripts/migration-governance.mjs', ...args], {
    cwd,
    encoding: 'utf8',
  });
}

describe('migration governance cli', () => {
  const projectRoot = path.resolve(__dirname, '..');

  it('fails validate on invalid migration naming', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-gov-invalid-'));
    const migrationsDir = path.join(tempDir, 'migrations');
    const metaDir = path.join(migrationsDir, 'meta');
    const journalFile = path.join(metaDir, '_journal.json');

    fs.mkdirSync(metaDir, { recursive: true });
    fs.writeFileSync(path.join(migrationsDir, 'bad_name.sql'), 'select 1;');
    fs.writeFileSync(journalFile, JSON.stringify({ version: '7', entries: [] }));

    const result = runGovernance([
      'validate',
      '--migrations-dir',
      migrationsDir,
      '--journal-file',
      journalFile,
    ], projectRoot);

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('MGV-1001');
  });

  it('auto-remediates missing journal entries during validate', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-gov-remediate-'));
    const migrationsDir = path.join(tempDir, 'migrations');
    const metaDir = path.join(migrationsDir, 'meta');
    const journalFile = path.join(metaDir, '_journal.json');

    fs.mkdirSync(metaDir, { recursive: true });
    fs.writeFileSync(path.join(migrationsDir, '0001_first.sql'), 'select 1;');
    fs.writeFileSync(path.join(migrationsDir, '0002_second.sql'), 'select 2;');
    fs.writeFileSync(
      journalFile,
      JSON.stringify({
        version: '7',
        entries: [{ idx: 0, version: '7', when: 1, tag: '0001_first', breakpoints: true }],
      }),
    );

    const result = runGovernance([
      'validate',
      '--migrations-dir',
      migrationsDir,
      '--journal-file',
      journalFile,
      '--auto-remediate-journal',
    ], projectRoot);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('MGV-1002');
    expect(result.stdout).toContain('MGV-0000');

    const updated = JSON.parse(fs.readFileSync(journalFile, 'utf8'));
    expect(updated.entries.some((entry: any) => entry.tag === '0002_second')).toBe(true);
  });

  it('allows cloud excluded on-prem migration tag in journal', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-gov-cloud-'));
    const migrationsDir = path.join(tempDir, 'migrations');
    const metaDir = path.join(migrationsDir, 'meta');
    const journalFile = path.join(metaDir, '_journal.json');

    fs.mkdirSync(metaDir, { recursive: true });
    fs.writeFileSync(path.join(migrationsDir, '0001_first.sql'), 'select 1;');
    fs.writeFileSync(
      journalFile,
      JSON.stringify({
        version: '7',
        entries: [
          { idx: 0, version: '7', when: 1, tag: '0001_first', breakpoints: true },
          { idx: 1, version: '7', when: 2, tag: '0052_add_cust_super_role', breakpoints: true },
        ],
      }),
    );

    const result = runGovernance([
      'validate',
      '--deployment-mode',
      'cloud',
      '--migrations-dir',
      migrationsDir,
      '--journal-file',
      journalFile,
    ], projectRoot);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('MGV-0000');
  });
});
