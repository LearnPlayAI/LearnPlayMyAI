#!/usr/bin/env node
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const result = spawnSync('npx', ['tsx', 'server/migrate-onprem.ts'], {
  cwd: projectRoot,
  env: process.env,
  stdio: 'inherit',
});

if (typeof result.status === 'number') {
  process.exit(result.status);
}
process.exit(1);
