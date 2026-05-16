import { describe, expect, it } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const componentPath = path.resolve(process.cwd(), 'client/src/components/ShowcaseBanner.tsx');

describe('ShowcaseBanner contrast contract', () => {
  it('uses the warning alert variant when rendering warning foreground text', () => {
    const source = fs.readFileSync(componentPath, 'utf8');

    expect(source).toContain('<Alert');
    expect(source).toContain('variant="warning"');
    expect(source).toContain('text-alert-warning-foreground');
    expect(source).not.toContain('text-warning-foreground');
  });
});
