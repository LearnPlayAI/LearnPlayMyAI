import { describe, expect, it } from '@jest/globals';
import { REQUIRED_TOKEN_KEYS } from '@shared/brandingTokens';
import {
  THEME_COMPONENT_CONTRACTS,
  getContractRequiredTokens,
  validateThemeComponentContracts,
} from '@shared/themeComponentContracts';

describe('theme component contracts', () => {
  it('validates schema and token references without issues', () => {
    const validKeys = new Set<string>(REQUIRED_TOKEN_KEYS as readonly string[]);
    const issues = validateThemeComponentContracts(validKeys);
    expect(issues).toEqual([]);
  });

  it('contains required state coverage for interactive components', () => {
    const stateMap = new Map(
      THEME_COMPONENT_CONTRACTS.map((contract) => [
        contract.component,
        new Set(contract.states.map((state) => state.state)),
      ])
    );

    expect(stateMap.get('input')).toEqual(
      new Set(['default', 'hover', 'active', 'focus', 'disabled', 'error', 'success'])
    );
    expect(stateMap.get('select')).toEqual(
      new Set(['default', 'hover', 'active', 'focus', 'disabled', 'error', 'success'])
    );
    expect(stateMap.get('progress')).toEqual(
      new Set(['default', 'active', 'success', 'warning', 'error', 'loading'])
    );

    for (const key of ['checkbox', 'radio']) {
      expect(stateMap.get(key)).toEqual(new Set(['default', 'hover', 'selected', 'disabled', 'focus']));
    }
    expect(stateMap.get('pagination')).toEqual(
      new Set(['default', 'hover', 'active', 'disabled', 'focus'])
    );

    expect(stateMap.get('spinner')).toEqual(new Set(['loading']));
    expect(stateMap.get('skeleton')).toEqual(new Set(['loading']));
  });

  it('returns deduplicated contract token list and all tokens exist in global token contract', () => {
    const contractTokens = getContractRequiredTokens();
    const unique = new Set(contractTokens);
    const globalTokenSet = new Set<string>(REQUIRED_TOKEN_KEYS as readonly string[]);

    expect(unique.size).toBe(contractTokens.length);

    const unknown = contractTokens.filter((token) => !globalTokenSet.has(token));
    expect(unknown).toEqual([]);
  });
});
