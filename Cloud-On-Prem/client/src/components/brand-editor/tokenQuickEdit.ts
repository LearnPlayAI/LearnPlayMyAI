import { THEME_COMPONENT_CONTRACTS } from '@shared/themeComponentContracts';

export interface QuickEditTokenGroup {
  title: string;
  description: string;
  tokens: string[];
  components?: string[];
}

const BUTTON_TOKEN_PATTERN = /^(--btn-[a-z0-9-]+?)(?:-(?:bg|fg|border|hover|active|focus-ring|disabled-bg|disabled-fg))?$/;
const LESSON_ARTIFACT_TOKEN_PATTERN = /^(--lesson-artifact-[a-z0-9-]+?)-(?:bg|fg|border)$/;
const FOUNDATION_TOKEN_KEYS = new Set<string>([
  '--primary',
  '--secondary',
  '--accent',
  '--background',
  '--foreground',
  '--muted',
  '--muted-foreground',
  '--success',
  '--warning',
  '--destructive',
  '--action-accent',
]);

function uniqueInOrder(tokens: string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const token of tokens) {
    if (!token || seen.has(token)) continue;
    seen.add(token);
    ordered.push(token);
  }
  return ordered;
}

function asLabel(tokenKey: string): string {
  if (!tokenKey.startsWith('--')) return tokenKey;
  return tokenKey
    .replace(/^--/, '')
    .split('-')
    .map((part) => (part.length > 0 ? part[0].toUpperCase() + part.slice(1) : part))
    .join(' ');
}

function getContractComponentsForToken(editKey: string): string[] {
  const components: string[] = [];
  for (const contract of THEME_COMPONENT_CONTRACTS) {
    const hasToken = contract.states.some((state) => state.requiredTokens.includes(editKey));
    if (hasToken) {
      components.push(contract.component);
    }
  }
  return components;
}

function collectContractTokens(components: string[], available: Set<string>): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();

  for (const component of components) {
    const contract = THEME_COMPONENT_CONTRACTS.find((entry) => entry.component === component);
    if (!contract) continue;
    for (const state of contract.states) {
      for (const token of state.requiredTokens) {
        if (!available.has(token)) continue;
        if (seen.has(token)) continue;
        seen.add(token);
        ordered.push(token);
      }
    }
  }

  return ordered;
}

function collectAllContractTokens(available: Set<string>): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const contract of THEME_COMPONENT_CONTRACTS) {
    for (const state of contract.states) {
      for (const token of state.requiredTokens) {
        if (!available.has(token)) continue;
        if (seen.has(token)) continue;
        seen.add(token);
        ordered.push(token);
      }
    }
  }
  return ordered;
}

function relatedTokenCandidates(editKey: string): string[] {
  if (editKey === '--background' || editKey === '--surface-primary' || editKey === '--surface-base') {
    return ['--background', '--surface-primary', '--surface-base', '--foreground', '--text-primary', '--border'];
  }

  if (editKey === '--btn-focus-ring') {
    return [
      '--btn-focus-ring',
      '--btn-primary-focus-ring',
      '--btn-secondary-focus-ring',
      '--btn-danger-focus-ring',
      '--btn-success-focus-ring',
      '--hero-cta-primary-focus-ring',
      '--hero-cta-secondary-focus-ring',
      '--link-focus-ring',
      '--focus-ring',
    ];
  }

  if (editKey === '--surface-raised') {
    return ['--surface-raised', '--card-bg', '--card-fg', '--card-border', '--panel-bg', '--panel-fg'];
  }

  if (editKey === '--feature-card-bg') {
    return [
      '--feature-card-bg',
      '--feature-card-fg',
      '--feature-card-title',
      '--feature-card-body',
      '--feature-card-muted',
      '--feature-card-border',
      '--feature-card-hover-bg',
      '--feature-card-hover-border',
      '--feature-card-icon-bg',
      '--feature-card-icon-fg',
    ];
  }

  if (editKey === '--glass-card-bg') {
    return [
      '--glass-card-bg',
      '--glass-card-fg',
      '--glass-card-title',
      '--glass-card-body',
      '--glass-card-muted',
      '--glass-card-border',
      '--glass-card-hover-border',
    ];
  }

  if (editKey === '--panel-bg') {
    return ['--panel-bg', '--panel-fg', '--panel-border', '--panel-header-bg', '--panel-header-fg'];
  }

  if (editKey === '--popover') {
    return ['--popover', '--popover-foreground', '--dropdown-bg', '--dropdown-fg', '--dropdown-border'];
  }

  if (editKey === '--select-option-hover') {
    return [
      '--select-bg',
      '--select-fg',
      '--select-border',
      '--select-option-hover',
      '--select-option-selected',
      '--select-hover-border',
      '--input-focus-ring',
    ];
  }

  const lessonArtifact = editKey.match(LESSON_ARTIFACT_TOKEN_PATTERN);
  if (lessonArtifact) {
    const base = lessonArtifact[1];
    return [`${base}-bg`, `${base}-fg`, `${base}-border`];
  }

  const buttonMatch = editKey.match(BUTTON_TOKEN_PATTERN);
  if (buttonMatch) {
    const base = buttonMatch[1];
    return [
      `${base}-bg`,
      `${base}-fg`,
      `${base}-border`,
      `${base}-hover`,
      `${base}-active`,
      `${base}-focus-ring`,
      `${base}-disabled-bg`,
      `${base}-disabled-fg`,
    ];
  }

  if (editKey.startsWith('--link-')) {
    return ['--link-fg', '--link-hover-fg', '--link-active-fg', '--link-visited-fg', '--link-focus-ring', '--link-muted-fg'];
  }

  if (editKey.startsWith('--nav-pill-')) {
    return [
      '--nav-pill-bg',
      '--nav-pill-fg',
      '--nav-pill-hover-bg',
      '--nav-pill-hover-fg',
      '--nav-pill-active-bg',
      '--nav-pill-active-fg',
      '--nav-link',
      '--nav-bg',
    ];
  }

  if (editKey.startsWith('--nav-item-')) {
    return [
      '--nav-item-active-bg',
      '--nav-item-active-fg',
      '--nav-item-hover-bg',
      '--nav-item-hover-fg',
      '--nav-item-fg',
      '--nav-item-disabled-fg',
      '--nav-bg',
      '--nav-border',
    ];
  }

  if (editKey.startsWith('--sidebar-item-') || editKey === '--sidebar-bg' || editKey === '--sidebar-fg') {
    return [
      '--sidebar-bg',
      '--sidebar-fg',
      '--sidebar-border',
      '--sidebar-item-active-bg',
      '--sidebar-item-active-fg',
      '--sidebar-item-hover-bg',
      '--sidebar-item-hover-fg',
      '--sidebar-item-fg',
      '--sidebar-item-disabled-fg',
    ];
  }

  if (editKey.startsWith('--badge-')) {
    return ['--badge-bg', '--badge-fg', '--badge-secondary-bg', '--badge-secondary-fg', '--badge-outline-border', '--badge-outline-fg'];
  }

  if (editKey.startsWith('--toast-') || editKey === '--toast-bg') {
    return [
      '--toast-bg',
      '--toast-fg',
      '--toast-border',
      '--toast-default-bg',
      '--toast-default-fg',
      '--toast-default-border',
      '--toast-success-bg',
      '--toast-success-fg',
      '--toast-success-border',
      '--toast-error-bg',
      '--toast-error-fg',
      '--toast-error-border',
    ];
  }

  if (editKey.startsWith('--filter-pill-')) {
    return [
      '--filter-pill-bg',
      '--filter-pill-fg',
      '--filter-pill-border',
      '--filter-pill-hover-bg',
      '--filter-pill-hover-fg',
      '--filter-pill-active-bg',
      '--filter-pill-active-fg',
      '--filter-pill-disabled-bg',
      '--filter-pill-disabled-fg',
    ];
  }

  const bgMatch = editKey.match(/^(--[a-z0-9-]+)-bg$/);
  if (bgMatch) {
    const base = bgMatch[1];
    return [`${base}-bg`, `${base}-fg`, `${base}-border`, `${base}-hover-bg`, `${base}-active-bg`];
  }

  const fgMatch = editKey.match(/^(--[a-z0-9-]+)-fg$/);
  if (fgMatch) {
    const base = fgMatch[1];
    return [`${base}-bg`, `${base}-fg`, `${base}-border`];
  }

  return [editKey];
}

export function isColorToken(tokenKey: string): boolean {
  if (!tokenKey.startsWith('--')) return false;
  if (tokenKey.startsWith('--space-')) return false;
  if (tokenKey.includes('font')) return false;
  return true;
}

export function buildQuickEditGroup(editKey: string, availableTokens: string[]): QuickEditTokenGroup {
  const available = new Set(availableTokens);
  if (FOUNDATION_TOKEN_KEYS.has(editKey)) {
    const allContractTokens = collectAllContractTokens(available);
    const tokens = uniqueInOrder([editKey, ...allContractTokens]);
    return {
      title: `${asLabel(editKey)} Editor`,
      description: 'Foundation token and full primitive contract coverage across UI Kit components.',
      tokens,
      components: THEME_COMPONENT_CONTRACTS.map((contract) => contract.component),
    };
  }

  const contractComponents = getContractComponentsForToken(editKey);
  if (contractComponents.length > 0) {
    const contractTokens = collectContractTokens(contractComponents, available);
    const tokens = uniqueInOrder([editKey, ...contractTokens]);
    return {
      title: `${asLabel(editKey)} Editor`,
      description: `Selected token and full primitive contract coverage for: ${contractComponents.join(', ')}.`,
      tokens,
      components: contractComponents,
    };
  }

  const candidates = relatedTokenCandidates(editKey);
  const filtered = candidates.filter((token) => available.has(token) || token === editKey);
  const tokens = uniqueInOrder([editKey, ...filtered]);

  return {
    title: `${asLabel(editKey)} Editor`,
    description: 'Selected token and related primitives for this UI element.',
    tokens,
  };
}

export function tokenLabel(tokenKey: string): string {
  return asLabel(tokenKey);
}
