#!/usr/bin/env node
// export-object-store.js — Download all Replit Object Store files to a local directory
//
// Uses @replit/object-storage (already installed in the workspace).
// Must be run from within the Replit environment (sidecar at localhost:1106 required).
//
// Usage (called by export-all.sh):
//   node export-object-store.js <output_dir> [--include-private]
//
// Output:
//   <output_dir>/files/public/   — full public Object Store tree
//   <output_dir>/files/private/  — private user content (--include-private only)
//   <output_dir>/data/assets/    — platform subdirs staged for import-platform-data.sh

import { Client } from '@replit/object-storage';
import path from 'path';
import fs from 'fs';

const PLATFORM_SUBDIRS = ['gamma', 'branding', 'power-ups', 'cosmetics', 'achievements', 'cards'];

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log('Usage: node export-object-store.js <output_dir> [--include-private]');
  process.exit(0);
}

const includePrivate = args.includes('--include-private');
const outputDir = args.find(a => !a.startsWith('--'));

if (!outputDir) {
  console.error('❌ output_dir argument is required');
  process.exit(1);
}

function getAllFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...getAllFiles(full));
    else results.push(full);
  }
  return results;
}

async function downloadPrefix(client, prefix, stripPrefix, destBase) {
  let count = 0;
  let failures = 0;

  const listResult = await client.list({ prefix });
  if (!listResult.ok) {
    console.error(`  ✗ Failed to list "${prefix}": ${listResult.error?.message || 'unknown error'}`);
    return { count, failures: 1 };
  }

  const objects = listResult.value || [];
  if (objects.length === 0) {
    console.log(`  (no objects found with prefix "${prefix}")`);
    return { count, failures };
  }

  for (const obj of objects) {
    const key = obj.name;
    const rel = key.startsWith(stripPrefix) ? key.slice(stripPrefix.length) : key;
    const destPath = path.join(destBase, rel);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });

    const result = await client.downloadToFilename(key, destPath);
    if (result.ok) {
      console.log(`  ✓ ${key}`);
      count++;
    } else {
      console.error(`  ✗ ${key}: ${result.error?.message || 'download failed'}`);
      failures++;
    }
  }

  return { count, failures };
}

async function main() {
  const filesDir = path.join(outputDir, 'files');
  const publicDir = path.join(filesDir, 'public');
  const privateDir = path.join(filesDir, 'private');
  const assetsDir = path.join(outputDir, 'data', 'assets');

  fs.mkdirSync(publicDir, { recursive: true });
  fs.mkdirSync(assetsDir, { recursive: true });
  if (includePrivate) fs.mkdirSync(privateDir, { recursive: true });

  const client = new Client();

  console.log(`  Downloading public/ files → ${publicDir}`);
  const pub = await downloadPrefix(client, 'public/', 'public/', publicDir);
  let totalCount = pub.count;
  let totalFailed = pub.failures;

  if (includePrivate) {
    console.log('');
    console.log(`  Downloading .private/ files → ${privateDir}`);
    const priv = await downloadPrefix(client, '.private/', '.private/', privateDir);
    totalCount += priv.count;
    totalFailed += priv.failures;
  }

  console.log('');
  console.log('  Staging platform assets → data/assets/');
  let staged = 0;

  for (const subdir of PLATFORM_SUBDIRS) {
    const src = path.join(publicDir, subdir);
    const files = getAllFiles(src);
    if (files.length > 0) {
      for (const f of files) {
        const rel = path.relative(src, f);
        const dest = path.join(assetsDir, subdir, rel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(f, dest);
        staged++;
      }
      console.log(`    Staged ${subdir}/ (${files.length} files)`);
    }
  }

  console.log('');
  if (totalFailed > 0) {
    console.error(`  ⚠️  Object Store: ${totalCount} downloaded, ${totalFailed} failed, ${staged} staged to data/assets/`);
    process.exit(1);
  } else {
    console.log(`  ✅ Object Store: ${totalCount} files downloaded, ${staged} staged to data/assets/`);
  }
}

main().catch(e => {
  console.error('❌ Unexpected error:', e.message || e);
  process.exit(1);
});
