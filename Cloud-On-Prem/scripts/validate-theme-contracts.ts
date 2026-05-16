import { themePresets } from '../client/src/config/themePresets';
import { REQUIRED_TOKEN_KEYS } from '../shared/brandingTokens';
import { THEME_COMPONENT_CONTRACTS, validateThemeComponentContracts } from '../shared/themeComponentContracts';
import { auditThemeContrast } from '../shared/themeContrastGuard';

function validateTokens(tokens: Record<string, string>, context: string): string[] {
  const failures: string[] = [];

  for (const key of REQUIRED_TOKEN_KEYS) {
    if (!tokens[key]) {
      failures.push(`[${context}] missing required token ${key}`);
    }
  }

  for (const contract of THEME_COMPONENT_CONTRACTS) {
    for (const stateContract of contract.states) {
      for (const token of stateContract.requiredTokens) {
        if (!tokens[token]) {
          failures.push(`[${context}] component contract ${contract.component}.${stateContract.state} missing ${token}`);
        }
      }
      for (const pair of stateContract.requiredPairs || []) {
        if (!tokens[pair.fg]) {
          failures.push(`[${context}] component contract ${contract.component}.${stateContract.state} missing ${pair.fg}`);
        }
        if (!tokens[pair.bg]) {
          failures.push(`[${context}] component contract ${contract.component}.${stateContract.state} missing ${pair.bg}`);
        }
      }
    }
  }

  const contrastIssues = auditThemeContrast(tokens).filter((issue) => issue.level === 'error');
  for (const issue of contrastIssues) {
    failures.push(
      `[${context}] critical contrast ${issue.pair} ratio=${issue.ratio} required=${issue.required}`
    );
  }

  return failures;
}

const failures: string[] = [];
const validTokenKeys = new Set<string>(REQUIRED_TOKEN_KEYS as readonly string[]);
const schemaIssues = validateThemeComponentContracts(validTokenKeys);
for (const issue of schemaIssues) {
  failures.push(`[theme-contract-schema] ${issue.message}`);
}

for (const preset of themePresets) {
  failures.push(...validateTokens(preset.tokens, `preset:${preset.id}`));
}

if (failures.length > 0) {
  console.error(`[ThemeContracts] FAILED with ${failures.length} issue(s)`);
  for (const failure of failures.slice(0, 300)) {
    console.error(failure);
  }
  if (failures.length > 300) {
    console.error(`[ThemeContracts] ... ${failures.length - 300} more omitted`);
  }
  process.exit(1);
}

console.log(`[ThemeContracts] PASS: ${themePresets.length} presets validated`);
