import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

const UI_COMPONENTS_ROOT = path.resolve(process.cwd(), 'client/src/components/ui');
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.jsx']);
const FORBIDDEN_LEGACY_WRAPPERS = ['hsl(var(--', 'hsla(var(--', 'rgb(var(--', 'rgba(var(--'];

function collectSourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return collectSourceFiles(entryPath);
    }

    return SOURCE_EXTENSIONS.has(path.extname(entry.name)) ? [entryPath] : [];
  });
}

describe('ui primitive semantic token parity', () => {
  it('does not reintroduce legacy semantic wrapper consumption in owned primitives', () => {
    const violations = collectSourceFiles(UI_COMPONENTS_ROOT).flatMap((filePath) => {
      const source = fs.readFileSync(filePath, 'utf8');
      const relativePath = path.relative(process.cwd(), filePath);

      return FORBIDDEN_LEGACY_WRAPPERS.flatMap((pattern) =>
        source.includes(pattern) ? [`${relativePath}: ${pattern}`] : []
      );
    });

    expect(violations).toEqual([]);
  });
});
