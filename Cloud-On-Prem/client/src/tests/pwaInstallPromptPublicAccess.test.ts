import { describe, expect, it } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const componentPath = path.resolve(process.cwd(), 'client/src/components/PWAInstallPrompt.tsx');

describe('PWAInstallPrompt public access contract', () => {
  it('does not require authentication before showing the install prompt', () => {
    const source = fs.readFileSync(componentPath, 'utf8');

    expect(source).not.toContain("from '@/hooks/useAuth'");
    expect(source).not.toContain('isAuthenticated');
    expect(source).not.toContain('authLoading');
    expect(source).toContain('brandingResolved');
  });
});
