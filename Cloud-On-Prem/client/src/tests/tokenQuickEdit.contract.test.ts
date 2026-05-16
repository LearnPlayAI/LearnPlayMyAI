import { describe, expect, it } from '@jest/globals';
import { buildQuickEditGroup } from '../components/brand-editor/tokenQuickEdit';
import { getContractRequiredTokens } from '@shared/themeComponentContracts';

function withAvailable(extra: string[] = []): string[] {
  return Array.from(new Set([...getContractRequiredTokens(), ...extra]));
}

describe('token quick edit contract coverage', () => {
  it('expands table header edits to full table contract bundle', () => {
    const group = buildQuickEditGroup('--table-header-bg', withAvailable());
    expect(group.components).toContain('table');
    expect(group.tokens).toContain('--table-header-bg');
    expect(group.tokens).toContain('--table-header-fg');
    expect(group.tokens).toContain('--table-header-border');
    expect(group.tokens).toContain('--table-cell-border');
    expect(group.tokens).toContain('--table-row-bg');
    expect(group.tokens).toContain('--table-row-selected-bg');
    expect(group.tokens).toContain('--table-row-selected-fg');
  });

  it('expands foundation tokens to all contract tokens', () => {
    const allAvailable = withAvailable(['--primary']);
    const group = buildQuickEditGroup('--primary', allAvailable);
    const contractCount = getContractRequiredTokens().filter((token) => allAvailable.includes(token)).length;
    expect(group.tokens).toContain('--primary');
    expect(group.tokens.length).toBeGreaterThanOrEqual(contractCount);
    expect(group.description.toLowerCase()).toContain('full primitive contract coverage');
  });

  it('expands toast shortcut token to full toast family', () => {
    const group = buildQuickEditGroup(
      '--toast-bg',
      withAvailable([
        '--toast-bg',
        '--toast-fg',
        '--toast-border',
        '--toast-default-bg',
        '--toast-default-fg',
        '--toast-default-border',
        '--toast-success-bg',
        '--toast-success-fg',
        '--toast-success-border',
      ]),
    );
    expect(group.tokens).toContain('--toast-bg');
    expect(group.tokens).toContain('--toast-default-bg');
    expect(group.tokens).toContain('--toast-success-bg');
  });
});
