export type ComponentState =
  | 'default'
  | 'hover'
  | 'active'
  | 'disabled'
  | 'focus'
  | 'selected'
  | 'error'
  | 'success'
  | 'warning'
  | 'loading';

export interface RequiredPair {
  fg: string;
  bg: string;
  minRatio: number;
  level?: 'error' | 'warning';
}

export interface ComponentStateContract {
  state: ComponentState;
  requiredTokens: string[];
  requiredPairs?: RequiredPair[];
}

export interface ComponentTokenContract {
  component: string;
  states: ComponentStateContract[];
}

export interface ThemeContractValidationIssue {
  code:
    | 'duplicate-component'
    | 'missing-component-name'
    | 'missing-state-contracts'
    | 'duplicate-state'
    | 'missing-required-state'
    | 'missing-token'
    | 'invalid-token-reference'
    | 'invalid-contrast-pair'
    | 'invalid-contrast-threshold';
  message: string;
  component?: string;
  state?: ComponentState;
  token?: string;
}

export const THEME_COMPONENT_CONTRACTS: ComponentTokenContract[] = [
  {
    component: 'button.primary',
    states: [
      {
        state: 'default',
        requiredTokens: ['--btn-primary-bg', '--btn-primary-fg'],
        requiredPairs: [{ fg: '--btn-primary-fg', bg: '--btn-primary-bg', minRatio: 4.5 }],
      },
      {
        state: 'hover',
        requiredTokens: ['--btn-primary-hover', '--btn-primary-fg'],
        requiredPairs: [{ fg: '--btn-primary-fg', bg: '--btn-primary-hover', minRatio: 4.5 }],
      },
      {
        state: 'active',
        requiredTokens: ['--btn-primary-active', '--btn-primary-fg'],
        requiredPairs: [{ fg: '--btn-primary-fg', bg: '--btn-primary-active', minRatio: 4.5 }],
      },
      {
        state: 'disabled',
        requiredTokens: ['--btn-primary-disabled-bg', '--btn-primary-disabled-fg'],
        requiredPairs: [{ fg: '--btn-primary-disabled-fg', bg: '--btn-primary-disabled-bg', minRatio: 3.0, level: 'warning' }],
      },
      { state: 'focus', requiredTokens: ['--btn-primary-focus-ring'] },
    ],
  },
  {
    component: 'button.secondary',
    states: [
      {
        state: 'default',
        requiredTokens: ['--btn-secondary-bg', '--btn-secondary-fg'],
        requiredPairs: [{ fg: '--btn-secondary-fg', bg: '--btn-secondary-bg', minRatio: 4.5 }],
      },
      {
        state: 'hover',
        requiredTokens: ['--btn-secondary-hover', '--btn-secondary-hover-fg'],
        requiredPairs: [{ fg: '--btn-secondary-hover-fg', bg: '--btn-secondary-hover', minRatio: 4.5 }],
      },
      {
        state: 'active',
        requiredTokens: ['--btn-secondary-active', '--btn-secondary-active-fg'],
        requiredPairs: [{ fg: '--btn-secondary-active-fg', bg: '--btn-secondary-active', minRatio: 4.5 }],
      },
      {
        state: 'disabled',
        requiredTokens: ['--btn-secondary-disabled-bg', '--btn-secondary-disabled-fg'],
        requiredPairs: [{ fg: '--btn-secondary-disabled-fg', bg: '--btn-secondary-disabled-bg', minRatio: 3.0, level: 'warning' }],
      },
      { state: 'focus', requiredTokens: ['--btn-secondary-focus-ring'] },
    ],
  },
  {
    component: 'button.outline',
    states: [
      {
        state: 'default',
        requiredTokens: ['--btn-outline-bg', '--btn-outline-fg', '--btn-outline-border'],
        requiredPairs: [{ fg: '--btn-outline-fg', bg: '--btn-outline-bg', minRatio: 4.5 }],
      },
      {
        state: 'hover',
        requiredTokens: ['--btn-outline-hover-bg', '--btn-outline-fg', '--btn-outline-hover-border'],
        requiredPairs: [{ fg: '--btn-outline-fg', bg: '--btn-outline-hover-bg', minRatio: 4.5 }],
      },
      {
        state: 'active',
        requiredTokens: ['--btn-outline-active-bg', '--btn-outline-fg'],
        requiredPairs: [{ fg: '--btn-outline-fg', bg: '--btn-outline-active-bg', minRatio: 4.5 }],
      },
      {
        state: 'disabled',
        requiredTokens: ['--input-disabled-bg', '--input-disabled-fg', '--input-disabled-border'],
        requiredPairs: [{ fg: '--input-disabled-fg', bg: '--input-disabled-bg', minRatio: 3.0, level: 'warning' }],
      },
      { state: 'focus', requiredTokens: ['--btn-primary-focus-ring'] },
    ],
  },
  {
    component: 'badge',
    states: [
      {
        state: 'default',
        requiredTokens: ['--badge-bg', '--badge-fg'],
        requiredPairs: [{ fg: '--badge-fg', bg: '--badge-bg', minRatio: 4.5 }],
      },
      {
        state: 'hover',
        requiredTokens: ['--badge-hover-bg', '--badge-hover-fg'],
        requiredPairs: [{ fg: '--badge-hover-fg', bg: '--badge-hover-bg', minRatio: 4.5 }],
      },
      {
        state: 'active',
        requiredTokens: ['--badge-bg', '--badge-fg'],
        requiredPairs: [{ fg: '--badge-fg', bg: '--badge-bg', minRatio: 4.5 }],
      },
      {
        state: 'disabled',
        requiredTokens: ['--surface-muted', '--text-muted'],
        requiredPairs: [{ fg: '--text-muted', bg: '--surface-muted', minRatio: 3.0, level: 'warning' }],
      },
      { state: 'focus', requiredTokens: ['--focus-ring'] },
    ],
  },
  {
    component: 'tabs',
    states: [
      {
        state: 'default',
        requiredTokens: ['--tab-bg', '--tab-fg'],
        requiredPairs: [{ fg: '--tab-fg', bg: '--tab-bg', minRatio: 4.5 }],
      },
      {
        state: 'hover',
        requiredTokens: ['--tab-hover-bg', '--tab-hover-fg'],
        requiredPairs: [{ fg: '--tab-hover-fg', bg: '--tab-hover-bg', minRatio: 4.5 }],
      },
      {
        state: 'active',
        requiredTokens: ['--tab-active-bg', '--tab-active-fg', '--tab-indicator'],
        requiredPairs: [{ fg: '--tab-active-fg', bg: '--tab-active-bg', minRatio: 4.5 }],
      },
      {
        state: 'disabled',
        requiredTokens: ['--tab-bg', '--tab-disabled-fg'],
        requiredPairs: [{ fg: '--tab-disabled-fg', bg: '--tab-bg', minRatio: 3.0, level: 'warning' }],
      },
      { state: 'focus', requiredTokens: ['--tab-focus-ring'] },
    ],
  },
  {
    component: 'input',
    states: [
      {
        state: 'default',
        requiredTokens: ['--input-bg', '--input-fg', '--input-border'],
        requiredPairs: [{ fg: '--input-fg', bg: '--input-bg', minRatio: 4.5 }],
      },
      { state: 'hover', requiredTokens: ['--input-hover-border'] },
      { state: 'active', requiredTokens: ['--input-focus-border'] },
      {
        state: 'error',
        requiredTokens: ['--input-invalid-bg', '--input-invalid-border', '--input-invalid-focus-ring', '--input-fg'],
        requiredPairs: [{ fg: '--input-fg', bg: '--input-invalid-bg', minRatio: 4.5 }],
      },
      {
        state: 'success',
        requiredTokens: ['--input-success-bg', '--input-success-border', '--input-fg'],
        requiredPairs: [{ fg: '--input-fg', bg: '--input-success-bg', minRatio: 4.5 }],
      },
      {
        state: 'disabled',
        requiredTokens: ['--input-disabled-bg', '--input-disabled-fg', '--input-disabled-border'],
        requiredPairs: [{ fg: '--input-disabled-fg', bg: '--input-disabled-bg', minRatio: 3.0, level: 'warning' }],
      },
      { state: 'focus', requiredTokens: ['--input-focus-ring'] },
    ],
  },
  {
    component: 'select',
    states: [
      {
        state: 'default',
        requiredTokens: ['--select-bg', '--select-fg', '--select-border'],
        requiredPairs: [{ fg: '--select-fg', bg: '--select-bg', minRatio: 4.5 }],
      },
      { state: 'hover', requiredTokens: ['--select-hover-border'] },
      { state: 'active', requiredTokens: ['--select-option-selected', '--select-fg'] },
      {
        state: 'error',
        requiredTokens: ['--input-invalid-bg', '--input-invalid-border', '--input-invalid-focus-ring', '--select-fg'],
        requiredPairs: [{ fg: '--select-fg', bg: '--input-invalid-bg', minRatio: 4.5 }],
      },
      {
        state: 'success',
        requiredTokens: ['--input-success-bg', '--input-success-border', '--select-fg'],
        requiredPairs: [{ fg: '--select-fg', bg: '--input-success-bg', minRatio: 4.5 }],
      },
      {
        state: 'disabled',
        requiredTokens: ['--input-disabled-bg', '--input-disabled-fg', '--input-disabled-border'],
        requiredPairs: [{ fg: '--input-disabled-fg', bg: '--input-disabled-bg', minRatio: 3.0, level: 'warning' }],
      },
      { state: 'focus', requiredTokens: ['--input-focus-ring'] },
    ],
  },
  {
    component: 'button.danger',
    states: [
      {
        state: 'default',
        requiredTokens: ['--btn-danger-bg', '--btn-danger-fg'],
        requiredPairs: [{ fg: '--btn-danger-fg', bg: '--btn-danger-bg', minRatio: 4.5 }],
      },
      {
        state: 'hover',
        requiredTokens: ['--btn-danger-hover', '--btn-danger-fg'],
        requiredPairs: [{ fg: '--btn-danger-fg', bg: '--btn-danger-hover', minRatio: 4.5 }],
      },
      {
        state: 'active',
        requiredTokens: ['--btn-danger-active', '--btn-danger-fg'],
        requiredPairs: [{ fg: '--btn-danger-fg', bg: '--btn-danger-active', minRatio: 4.5 }],
      },
      { state: 'focus', requiredTokens: ['--btn-danger-focus-ring'] },
      {
        state: 'disabled',
        requiredTokens: ['--btn-primary-disabled-bg', '--btn-primary-disabled-fg'],
        requiredPairs: [{ fg: '--btn-primary-disabled-fg', bg: '--btn-primary-disabled-bg', minRatio: 3.0, level: 'warning' }],
      },
    ],
  },
  {
    component: 'button.ghost',
    states: [
      {
        state: 'default',
        requiredTokens: ['--btn-ghost-bg', '--btn-ghost-fg'],
        requiredPairs: [{ fg: '--btn-ghost-fg', bg: '--btn-ghost-bg', minRatio: 4.5 }],
      },
      {
        state: 'hover',
        requiredTokens: ['--btn-ghost-hover', '--btn-ghost-fg'],
        requiredPairs: [{ fg: '--btn-ghost-fg', bg: '--btn-ghost-hover', minRatio: 4.5 }],
      },
      {
        state: 'active',
        requiredTokens: ['--btn-ghost-active', '--btn-ghost-fg'],
        requiredPairs: [{ fg: '--btn-ghost-fg', bg: '--btn-ghost-active', minRatio: 4.5 }],
      },
      {
        state: 'disabled',
        requiredTokens: ['--btn-ghost-bg', '--btn-ghost-disabled-fg'],
        requiredPairs: [{ fg: '--btn-ghost-disabled-fg', bg: '--btn-ghost-bg', minRatio: 3.0, level: 'warning' }],
      },
      { state: 'focus', requiredTokens: ['--btn-primary-focus-ring'] },
    ],
  },
  {
    component: 'button.success',
    states: [
      {
        state: 'default',
        requiredTokens: ['--btn-success-bg', '--btn-success-fg'],
        requiredPairs: [{ fg: '--btn-success-fg', bg: '--btn-success-bg', minRatio: 4.5 }],
      },
      {
        state: 'hover',
        requiredTokens: ['--btn-success-hover', '--btn-success-fg'],
        requiredPairs: [{ fg: '--btn-success-fg', bg: '--btn-success-hover', minRatio: 4.5 }],
      },
      {
        state: 'active',
        requiredTokens: ['--btn-success-active', '--btn-success-fg'],
        requiredPairs: [{ fg: '--btn-success-fg', bg: '--btn-success-active', minRatio: 4.5 }],
      },
      { state: 'focus', requiredTokens: ['--btn-success-focus-ring'] },
      {
        state: 'disabled',
        requiredTokens: ['--btn-success-disabled-bg', '--btn-success-disabled-fg'],
        requiredPairs: [{ fg: '--btn-success-disabled-fg', bg: '--btn-success-disabled-bg', minRatio: 3.0, level: 'warning' }],
      },
    ],
  },
  {
    component: 'button.warning',
    states: [
      {
        state: 'default',
        requiredTokens: ['--btn-warning-bg', '--btn-warning-fg'],
        requiredPairs: [{ fg: '--btn-warning-fg', bg: '--btn-warning-bg', minRatio: 4.5 }],
      },
      {
        state: 'hover',
        requiredTokens: ['--btn-warning-hover', '--btn-warning-fg'],
        requiredPairs: [{ fg: '--btn-warning-fg', bg: '--btn-warning-hover', minRatio: 4.5 }],
      },
      {
        state: 'active',
        requiredTokens: ['--btn-warning-active', '--btn-warning-fg'],
        requiredPairs: [{ fg: '--btn-warning-fg', bg: '--btn-warning-active', minRatio: 4.5 }],
      },
      { state: 'focus', requiredTokens: ['--btn-primary-focus-ring'] },
      {
        state: 'disabled',
        requiredTokens: ['--btn-warning-bg', '--btn-warning-disabled-fg'],
        requiredPairs: [{ fg: '--btn-warning-disabled-fg', bg: '--btn-warning-bg', minRatio: 3.0, level: 'warning' }],
      },
    ],
  },
  {
    component: 'alert.info',
    states: [
      {
        state: 'default',
        requiredTokens: ['--alert-info-bg', '--alert-info-fg', '--alert-info-border', '--alert-info-icon'],
        requiredPairs: [{ fg: '--alert-info-fg', bg: '--alert-info-bg', minRatio: 4.5 }],
      },
    ],
  },
  {
    component: 'alert.success',
    states: [
      {
        state: 'default',
        requiredTokens: ['--alert-success-bg', '--alert-success-fg', '--alert-success-border', '--alert-success-icon'],
        requiredPairs: [{ fg: '--alert-success-fg', bg: '--alert-success-bg', minRatio: 4.5 }],
      },
    ],
  },
  {
    component: 'alert.warning',
    states: [
      {
        state: 'default',
        requiredTokens: ['--alert-warning-bg', '--alert-warning-fg', '--alert-warning-border', '--alert-warning-icon'],
        requiredPairs: [{ fg: '--alert-warning-fg', bg: '--alert-warning-bg', minRatio: 4.5 }],
      },
    ],
  },
  {
    component: 'alert.error',
    states: [
      {
        state: 'default',
        requiredTokens: ['--alert-error-bg', '--alert-error-fg', '--alert-error-border', '--alert-error-icon'],
        requiredPairs: [{ fg: '--alert-error-fg', bg: '--alert-error-bg', minRatio: 4.5 }],
      },
    ],
  },
  {
    component: 'toast.default',
    states: [
      {
        state: 'default',
        requiredTokens: ['--toast-default-bg', '--toast-default-fg', '--toast-default-border'],
        requiredPairs: [{ fg: '--toast-default-fg', bg: '--toast-default-bg', minRatio: 4.5 }],
      },
    ],
  },
  {
    component: 'toast.success',
    states: [
      {
        state: 'default',
        requiredTokens: ['--toast-success-bg', '--toast-success-fg', '--toast-success-border'],
        requiredPairs: [{ fg: '--toast-success-fg', bg: '--toast-success-bg', minRatio: 4.5 }],
      },
    ],
  },
  {
    component: 'toast.error',
    states: [
      {
        state: 'default',
        requiredTokens: ['--toast-error-bg', '--toast-error-fg', '--toast-error-border'],
        requiredPairs: [{ fg: '--toast-error-fg', bg: '--toast-error-bg', minRatio: 4.5 }],
      },
    ],
  },
  {
    component: 'nav.item',
    states: [
      {
        state: 'default',
        requiredTokens: ['--nav-bg', '--nav-fg'],
        requiredPairs: [{ fg: '--nav-fg', bg: '--nav-bg', minRatio: 4.5 }],
      },
      {
        state: 'hover',
        requiredTokens: ['--nav-hover', '--nav-fg'],
        requiredPairs: [{ fg: '--nav-fg', bg: '--nav-hover', minRatio: 4.5 }],
      },
      {
        state: 'active',
        requiredTokens: ['--nav-active', '--nav-active-fg'],
        requiredPairs: [{ fg: '--nav-active-fg', bg: '--nav-active', minRatio: 4.5 }],
      },
      {
        state: 'disabled',
        requiredTokens: ['--nav-bg', '--nav-disabled'],
        requiredPairs: [{ fg: '--nav-disabled', bg: '--nav-bg', minRatio: 3.0, level: 'warning' }],
      },
      { state: 'focus', requiredTokens: ['--nav-link-focus'] },
    ],
  },
  {
    component: 'table',
    states: [
      {
        state: 'default',
        requiredTokens: [
          '--table-header-bg',
          '--table-header-fg',
          '--table-header-border',
          '--table-cell-border',
          '--table-row-bg',
          '--table-row-alt-bg',
          '--table-row-fg',
          '--table-sort-icon',
          '--table-sort-icon-active',
        ],
        requiredPairs: [
          { fg: '--table-header-fg', bg: '--table-header-bg', minRatio: 4.5 },
          { fg: '--table-row-fg', bg: '--table-row-bg', minRatio: 4.5 },
          { fg: '--table-row-fg', bg: '--table-row-alt-bg', minRatio: 4.5 },
          { fg: '--table-header-border', bg: '--table-header-bg', minRatio: 3.0, level: 'warning' },
          { fg: '--table-cell-border', bg: '--table-row-bg', minRatio: 3.0, level: 'warning' },
          { fg: '--table-sort-icon', bg: '--table-header-bg', minRatio: 3.0, level: 'warning' },
        ],
      },
      {
        state: 'hover',
        requiredTokens: ['--table-row-hover-bg', '--table-row-fg', '--table-row-hover-border'],
        requiredPairs: [{ fg: '--table-row-fg', bg: '--table-row-hover-bg', minRatio: 4.5 }],
      },
      {
        state: 'active',
        requiredTokens: ['--table-row-active-bg', '--table-row-fg'],
        requiredPairs: [{ fg: '--table-row-fg', bg: '--table-row-active-bg', minRatio: 4.5 }],
      },
      {
        state: 'selected',
        requiredTokens: ['--table-row-selected-bg', '--table-row-selected-fg'],
        requiredPairs: [{ fg: '--table-row-selected-fg', bg: '--table-row-selected-bg', minRatio: 4.5 }],
      },
    ],
  },
  {
    component: 'card',
    states: [
      {
        state: 'default',
        requiredTokens: ['--card-bg', '--card-fg', '--card-border'],
        requiredPairs: [{ fg: '--card-fg', bg: '--card-bg', minRatio: 4.5 }],
      },
      {
        state: 'hover',
        requiredTokens: ['--card-hover-bg', '--card-fg', '--card-hover-border'],
        requiredPairs: [{ fg: '--card-fg', bg: '--card-hover-bg', minRatio: 4.5 }],
      },
      {
        state: 'active',
        requiredTokens: ['--card-active-bg', '--card-fg', '--card-active-border'],
        requiredPairs: [{ fg: '--card-fg', bg: '--card-active-bg', minRatio: 4.5 }],
      },
      {
        state: 'selected',
        requiredTokens: ['--card-selected-bg', '--card-fg', '--card-selected-border'],
        requiredPairs: [{ fg: '--card-fg', bg: '--card-selected-bg', minRatio: 4.5 }],
      },
      {
        state: 'disabled',
        requiredTokens: ['--card-disabled-bg', '--card-disabled-fg'],
        requiredPairs: [{ fg: '--card-disabled-fg', bg: '--card-disabled-bg', minRatio: 3.0, level: 'warning' }],
      },
    ],
  },
  {
    component: 'modal',
    states: [
      {
        state: 'default',
        requiredTokens: ['--modal-bg', '--modal-fg', '--modal-border', '--modal-overlay'],
        requiredPairs: [{ fg: '--modal-fg', bg: '--modal-bg', minRatio: 4.5 }],
      },
    ],
  },
  {
    component: 'dropdown',
    states: [
      {
        state: 'default',
        requiredTokens: ['--dropdown-bg', '--dropdown-fg', '--dropdown-border'],
        requiredPairs: [{ fg: '--dropdown-fg', bg: '--dropdown-bg', minRatio: 4.5 }],
      },
      {
        state: 'hover',
        requiredTokens: ['--dropdown-item-hover-bg', '--dropdown-item-hover-fg'],
        requiredPairs: [{ fg: '--dropdown-item-hover-fg', bg: '--dropdown-item-hover-bg', minRatio: 4.5 }],
      },
      {
        state: 'active',
        requiredTokens: ['--dropdown-item-active-bg', '--dropdown-item-active-fg'],
        requiredPairs: [{ fg: '--dropdown-item-active-fg', bg: '--dropdown-item-active-bg', minRatio: 4.5 }],
      },
    ],
  },
  {
    component: 'context-menu',
    states: [
      {
        state: 'default',
        requiredTokens: ['--dropdown-bg', '--dropdown-fg', '--dropdown-border'],
        requiredPairs: [{ fg: '--dropdown-fg', bg: '--dropdown-bg', minRatio: 4.5 }],
      },
      {
        state: 'hover',
        requiredTokens: ['--dropdown-item-hover-bg', '--dropdown-item-hover-fg'],
        requiredPairs: [{ fg: '--dropdown-item-hover-fg', bg: '--dropdown-item-hover-bg', minRatio: 4.5 }],
      },
      {
        state: 'active',
        requiredTokens: ['--dropdown-item-active-bg', '--dropdown-item-active-fg'],
        requiredPairs: [{ fg: '--dropdown-item-active-fg', bg: '--dropdown-item-active-bg', minRatio: 4.5 }],
      },
    ],
  },
  {
    component: 'menubar',
    states: [
      {
        state: 'default',
        requiredTokens: ['--dropdown-bg', '--dropdown-fg', '--dropdown-border'],
        requiredPairs: [{ fg: '--dropdown-fg', bg: '--dropdown-bg', minRatio: 4.5 }],
      },
      {
        state: 'hover',
        requiredTokens: ['--dropdown-item-hover-bg', '--dropdown-item-hover-fg'],
        requiredPairs: [{ fg: '--dropdown-item-hover-fg', bg: '--dropdown-item-hover-bg', minRatio: 4.5 }],
      },
      {
        state: 'active',
        requiredTokens: ['--dropdown-item-active-bg', '--dropdown-item-active-fg'],
        requiredPairs: [{ fg: '--dropdown-item-active-fg', bg: '--dropdown-item-active-bg', minRatio: 4.5 }],
      },
    ],
  },
  {
    component: 'navigation-menu',
    states: [
      {
        state: 'default',
        requiredTokens: ['--nav-bg', '--nav-link'],
        requiredPairs: [{ fg: '--nav-link', bg: '--nav-bg', minRatio: 4.5 }],
      },
      {
        state: 'hover',
        requiredTokens: ['--nav-hover', '--nav-link-hover'],
        requiredPairs: [{ fg: '--nav-link-hover', bg: '--nav-hover', minRatio: 3.0, level: 'warning' }],
      },
      {
        state: 'active',
        requiredTokens: ['--nav-active', '--nav-active-fg'],
        requiredPairs: [{ fg: '--nav-active-fg', bg: '--nav-active', minRatio: 4.5 }],
      },
    ],
  },
  {
    component: 'command',
    states: [
      {
        state: 'default',
        requiredTokens: ['--dropdown-bg', '--dropdown-fg', '--dropdown-border'],
        requiredPairs: [{ fg: '--dropdown-fg', bg: '--dropdown-bg', minRatio: 4.5 }],
      },
      {
        state: 'hover',
        requiredTokens: ['--dropdown-item-hover-bg', '--dropdown-item-hover-fg'],
        requiredPairs: [{ fg: '--dropdown-item-hover-fg', bg: '--dropdown-item-hover-bg', minRatio: 4.5 }],
      },
      {
        state: 'active',
        requiredTokens: ['--dropdown-item-active-bg', '--dropdown-item-active-fg'],
        requiredPairs: [{ fg: '--dropdown-item-active-fg', bg: '--dropdown-item-active-bg', minRatio: 4.5 }],
      },
      {
        state: 'focus',
        requiredTokens: ['--input-focus-ring'],
      },
    ],
  },
  {
    component: 'sheet.controls',
    states: [
      {
        state: 'default',
        requiredTokens: ['--modal-bg', '--modal-fg', '--modal-border'],
        requiredPairs: [{ fg: '--modal-fg', bg: '--modal-bg', minRatio: 4.5 }],
      },
      {
        state: 'hover',
        requiredTokens: ['--dropdown-item-hover-bg', '--dropdown-item-hover-fg'],
        requiredPairs: [{ fg: '--dropdown-item-hover-fg', bg: '--dropdown-item-hover-bg', minRatio: 4.5 }],
      },
      {
        state: 'focus',
        requiredTokens: ['--focus-ring'],
      },
    ],
  },
  {
    component: 'dialog.controls',
    states: [
      {
        state: 'default',
        requiredTokens: ['--modal-bg', '--modal-fg', '--modal-border'],
        requiredPairs: [{ fg: '--modal-fg', bg: '--modal-bg', minRatio: 4.5 }],
      },
      {
        state: 'hover',
        requiredTokens: ['--dropdown-item-hover-bg', '--dropdown-item-hover-fg'],
        requiredPairs: [{ fg: '--dropdown-item-hover-fg', bg: '--dropdown-item-hover-bg', minRatio: 4.5 }],
      },
      {
        state: 'focus',
        requiredTokens: ['--focus-ring'],
      },
    ],
  },
  {
    component: 'tooltip',
    states: [
      {
        state: 'default',
        requiredTokens: ['--tooltip-bg', '--tooltip-fg', '--tooltip-border'],
        requiredPairs: [{ fg: '--tooltip-fg', bg: '--tooltip-bg', minRatio: 4.5 }],
      },
    ],
  },
  {
    component: 'progress',
    states: [
      {
        state: 'default',
        requiredTokens: ['--progress-bg', '--progress-label'],
        requiredPairs: [{ fg: '--progress-label', bg: '--progress-bg', minRatio: 4.5 }],
      },
      {
        state: 'active',
        requiredTokens: ['--progress-fill', '--progress-fill-fg'],
        requiredPairs: [{ fg: '--progress-fill-fg', bg: '--progress-fill', minRatio: 3.0, level: 'warning' }],
      },
      {
        state: 'success',
        requiredTokens: ['--progress-success-fill', '--progress-fill-fg'],
        requiredPairs: [{ fg: '--progress-fill-fg', bg: '--progress-success-fill', minRatio: 3.0, level: 'warning' }],
      },
      {
        state: 'warning',
        requiredTokens: ['--progress-warning-fill', '--progress-fill-fg'],
        requiredPairs: [{ fg: '--progress-fill-fg', bg: '--progress-warning-fill', minRatio: 3.0, level: 'warning' }],
      },
      {
        state: 'error',
        requiredTokens: ['--progress-error-fill', '--progress-fill-fg'],
        requiredPairs: [{ fg: '--progress-fill-fg', bg: '--progress-error-fill', minRatio: 3.0, level: 'warning' }],
      },
      {
        state: 'loading',
        requiredTokens: ['--loading-overlay', '--progress-bg'],
      },
    ],
  },
  {
    component: 'checkbox',
    states: [
      {
        state: 'default',
        requiredTokens: ['--checkbox-bg', '--checkbox-border'],
      },
      {
        state: 'hover',
        requiredTokens: ['--checkbox-hover-border'],
      },
      {
        state: 'selected',
        requiredTokens: ['--checkbox-checked-bg', '--checkbox-checked-fg'],
        requiredPairs: [{ fg: '--checkbox-checked-fg', bg: '--checkbox-checked-bg', minRatio: 4.5 }],
      },
      {
        state: 'disabled',
        requiredTokens: ['--checkbox-disabled-bg', '--input-disabled-fg'],
        requiredPairs: [{ fg: '--input-disabled-fg', bg: '--checkbox-disabled-bg', minRatio: 3.0, level: 'warning' }],
      },
      {
        state: 'focus',
        requiredTokens: ['--focus-ring'],
      },
    ],
  },
  {
    component: 'radio',
    states: [
      {
        state: 'default',
        requiredTokens: ['--radio-bg', '--radio-border'],
      },
      {
        state: 'hover',
        requiredTokens: ['--radio-hover-border'],
      },
      {
        state: 'selected',
        requiredTokens: ['--radio-checked-bg', '--radio-checked-fg'],
        requiredPairs: [{ fg: '--radio-checked-fg', bg: '--radio-checked-bg', minRatio: 4.5 }],
      },
      {
        state: 'disabled',
        requiredTokens: ['--input-disabled-bg', '--input-disabled-fg'],
        requiredPairs: [{ fg: '--input-disabled-fg', bg: '--input-disabled-bg', minRatio: 3.0, level: 'warning' }],
      },
      {
        state: 'focus',
        requiredTokens: ['--focus-ring'],
      },
    ],
  },
  {
    component: 'switch',
    states: [
      {
        state: 'default',
        requiredTokens: ['--switch-bg', '--switch-thumb'],
      },
      {
        state: 'hover',
        requiredTokens: ['--switch-hover-bg', '--switch-thumb'],
      },
      {
        state: 'selected',
        requiredTokens: ['--switch-checked-bg', '--switch-thumb'],
      },
      {
        state: 'active',
        requiredTokens: ['--switch-checked-hover-bg', '--switch-thumb'],
      },
      {
        state: 'focus',
        requiredTokens: ['--focus-ring'],
      },
    ],
  },
  {
    component: 'slider',
    states: [
      {
        state: 'default',
        requiredTokens: ['--slider-track', '--slider-range'],
      },
      {
        state: 'hover',
        requiredTokens: ['--slider-thumb-hover', '--slider-thumb'],
      },
      {
        state: 'active',
        requiredTokens: ['--slider-thumb', '--slider-thumb-border'],
      },
      {
        state: 'focus',
        requiredTokens: ['--slider-focus-ring'],
      },
      {
        state: 'disabled',
        requiredTokens: ['--input-disabled-bg', '--input-disabled-fg'],
        requiredPairs: [{ fg: '--input-disabled-fg', bg: '--input-disabled-bg', minRatio: 3.0, level: 'warning' }],
      },
    ],
  },
  {
    component: 'pagination',
    states: [
      {
        state: 'default',
        requiredTokens: ['--pagination-bg', '--pagination-fg'],
        requiredPairs: [{ fg: '--pagination-fg', bg: '--pagination-bg', minRatio: 4.5 }],
      },
      {
        state: 'hover',
        requiredTokens: ['--pagination-hover-bg', '--pagination-fg'],
        requiredPairs: [{ fg: '--pagination-fg', bg: '--pagination-hover-bg', minRatio: 4.5 }],
      },
      {
        state: 'active',
        requiredTokens: ['--pagination-active-bg', '--pagination-active-fg'],
        requiredPairs: [{ fg: '--pagination-active-fg', bg: '--pagination-active-bg', minRatio: 4.5 }],
      },
      {
        state: 'disabled',
        requiredTokens: ['--pagination-disabled-bg', '--pagination-disabled-fg'],
        requiredPairs: [{ fg: '--pagination-disabled-fg', bg: '--pagination-disabled-bg', minRatio: 3.0, level: 'warning' }],
      },
      {
        state: 'focus',
        requiredTokens: ['--focus-ring'],
      },
    ],
  },
  {
    component: 'spinner',
    states: [
      {
        state: 'loading',
        requiredTokens: ['--spinner-fill', '--spinner-track'],
      },
    ],
  },
  {
    component: 'skeleton',
    states: [
      {
        state: 'loading',
        requiredTokens: ['--skeleton-bg', '--skeleton-highlight'],
      },
    ],
  },
  {
    component: 'empty-state',
    states: [
      {
        state: 'default',
        requiredTokens: ['--empty-state-bg', '--empty-state-fg', '--empty-state-body', '--empty-state-heading', '--empty-state-icon'],
        requiredPairs: [
          { fg: '--empty-state-fg', bg: '--empty-state-bg', minRatio: 4.5 },
          { fg: '--empty-state-body', bg: '--empty-state-bg', minRatio: 4.5 },
          { fg: '--empty-state-heading', bg: '--empty-state-bg', minRatio: 4.5 },
        ],
      },
    ],
  },
  {
    component: 'hero',
    states: [
      {
        state: 'default',
        requiredTokens: ['--hero-bg', '--hero-badge-bg', '--hero-badge-fg', '--hero-audience-pill-bg', '--hero-audience-pill-fg'],
        requiredPairs: [
          { fg: '--hero-badge-fg', bg: '--hero-badge-bg', minRatio: 4.5 },
          { fg: '--hero-audience-pill-fg', bg: '--hero-audience-pill-bg', minRatio: 4.5 },
        ],
      },
      {
        state: 'active',
        requiredTokens: ['--hero-cta-primary-bg', '--hero-cta-primary-fg', '--hero-cta-secondary-bg', '--hero-cta-secondary-fg'],
        requiredPairs: [
          { fg: '--hero-cta-primary-fg', bg: '--hero-cta-primary-bg', minRatio: 4.5 },
          { fg: '--hero-cta-secondary-fg', bg: '--hero-cta-secondary-bg', minRatio: 4.5 },
        ],
      },
      {
        state: 'hover',
        requiredTokens: ['--hero-cta-primary-hover', '--hero-cta-primary-fg', '--hero-cta-secondary-hover', '--hero-cta-secondary-fg'],
        requiredPairs: [
          { fg: '--hero-cta-primary-fg', bg: '--hero-cta-primary-hover', minRatio: 4.5 },
          { fg: '--hero-cta-secondary-fg', bg: '--hero-cta-secondary-hover', minRatio: 4.5 },
        ],
      },
      { state: 'focus', requiredTokens: ['--hero-cta-primary-focus-ring', '--hero-cta-secondary-focus-ring'] },
    ],
  },
  {
    component: 'pill',
    states: [
      {
        state: 'default',
        requiredTokens: ['--pill-bg', '--pill-fg', '--pill-border'],
        requiredPairs: [{ fg: '--pill-fg', bg: '--pill-bg', minRatio: 4.5 }],
      },
      {
        state: 'hover',
        requiredTokens: ['--pill-hover-bg', '--pill-fg', '--pill-hover-border'],
        requiredPairs: [{ fg: '--pill-fg', bg: '--pill-hover-bg', minRatio: 4.5 }],
      },
      {
        state: 'active',
        requiredTokens: ['--pill-active-bg', '--pill-active-fg'],
        requiredPairs: [{ fg: '--pill-active-fg', bg: '--pill-active-bg', minRatio: 4.5 }],
      },
      {
        state: 'disabled',
        requiredTokens: ['--pill-disabled-bg', '--pill-disabled-fg'],
        requiredPairs: [{ fg: '--pill-disabled-fg', bg: '--pill-disabled-bg', minRatio: 3.0, level: 'warning' }],
      },
    ],
  },
  {
    component: 'tag',
    states: [
      {
        state: 'default',
        requiredTokens: ['--tag-bg', '--tag-fg', '--tag-border'],
        requiredPairs: [{ fg: '--tag-fg', bg: '--tag-bg', minRatio: 4.5 }],
      },
      {
        state: 'hover',
        requiredTokens: ['--tag-hover-bg', '--tag-fg'],
        requiredPairs: [{ fg: '--tag-fg', bg: '--tag-hover-bg', minRatio: 4.5 }],
      },
    ],
  },
];

export function getContractRequiredTokens(): string[] {
  const tokens = new Set<string>();
  for (const component of THEME_COMPONENT_CONTRACTS) {
    for (const state of component.states) {
      state.requiredTokens.forEach((token) => tokens.add(token));
      state.requiredPairs?.forEach((pair) => {
        tokens.add(pair.fg);
        tokens.add(pair.bg);
      });
    }
  }
  return Array.from(tokens);
}

export function getContractPairs(): Array<RequiredPair & { component: string; state: ComponentState }> {
  const pairs: Array<RequiredPair & { component: string; state: ComponentState }> = [];
  for (const component of THEME_COMPONENT_CONTRACTS) {
    for (const state of component.states) {
      for (const pair of state.requiredPairs || []) {
        pairs.push({
          component: component.component,
          state: state.state,
          fg: pair.fg,
          bg: pair.bg,
          minRatio: pair.minRatio,
          level: pair.level || 'error',
        });
      }
    }
  }
  return pairs;
}

const COMPONENT_REQUIRED_STATES: Record<string, ComponentState[]> = {
  'button.primary': ['default', 'hover', 'active', 'disabled', 'focus'],
  'button.secondary': ['default', 'hover', 'active', 'disabled', 'focus'],
  'button.outline': ['default', 'hover', 'active', 'disabled', 'focus'],
  'button.danger': ['default', 'hover', 'active', 'disabled', 'focus'],
  'button.ghost': ['default', 'hover', 'active', 'disabled', 'focus'],
  'button.success': ['default', 'hover', 'active', 'disabled', 'focus'],
  'button.warning': ['default', 'hover', 'active', 'disabled', 'focus'],
  badge: ['default', 'hover', 'active', 'disabled', 'focus'],
  tabs: ['default', 'hover', 'active', 'disabled', 'focus'],
  input: ['default', 'hover', 'active', 'focus', 'disabled', 'error', 'success'],
  select: ['default', 'hover', 'active', 'focus', 'disabled', 'error', 'success'],
  checkbox: ['default', 'hover', 'selected', 'disabled', 'focus'],
  radio: ['default', 'hover', 'selected', 'disabled', 'focus'],
  switch: ['default', 'hover', 'selected', 'active', 'focus'],
  slider: ['default', 'hover', 'active', 'focus', 'disabled'],
  pagination: ['default', 'hover', 'active', 'disabled', 'focus'],
  'nav.item': ['default', 'hover', 'active', 'disabled', 'focus'],
  'navigation-menu': ['default', 'hover', 'active'],
  table: ['default', 'hover', 'active', 'selected'],
  card: ['default', 'hover', 'active', 'selected', 'disabled'],
  dropdown: ['default', 'hover', 'active'],
  'context-menu': ['default', 'hover', 'active'],
  menubar: ['default', 'hover', 'active'],
  command: ['default', 'hover', 'active', 'focus'],
  progress: ['default', 'active', 'success', 'warning', 'error', 'loading'],
  spinner: ['loading'],
  skeleton: ['loading'],
  'alert.info': ['default'],
  'alert.success': ['default'],
  'alert.warning': ['default'],
  'alert.error': ['default'],
  'toast.default': ['default'],
  'toast.success': ['default'],
  'toast.error': ['default'],
  modal: ['default'],
  'sheet.controls': ['default', 'hover', 'focus'],
  'dialog.controls': ['default', 'hover', 'focus'],
  tooltip: ['default'],
  'empty-state': ['default'],
  hero: ['default', 'active', 'hover', 'focus'],
  tag: ['default', 'hover'],
};

export function validateThemeComponentContracts(validTokenKeys?: Set<string>): ThemeContractValidationIssue[] {
  const issues: ThemeContractValidationIssue[] = [];
  const seenComponents = new Set<string>();

  for (const contract of THEME_COMPONENT_CONTRACTS) {
    if (!contract.component.trim()) {
      issues.push({
        code: 'missing-component-name',
        message: 'Component contract must define a non-empty component key',
      });
      continue;
    }

    if (seenComponents.has(contract.component)) {
      issues.push({
        code: 'duplicate-component',
        component: contract.component,
        message: `Duplicate component contract "${contract.component}"`,
      });
      continue;
    }
    seenComponents.add(contract.component);

    if (!contract.states.length) {
      issues.push({
        code: 'missing-state-contracts',
        component: contract.component,
        message: `Component "${contract.component}" has no state contracts`,
      });
      continue;
    }

    const seenStates = new Set<ComponentState>();
    for (const state of contract.states) {
      if (seenStates.has(state.state)) {
        issues.push({
          code: 'duplicate-state',
          component: contract.component,
          state: state.state,
          message: `Duplicate state "${state.state}" in "${contract.component}"`,
        });
      }
      seenStates.add(state.state);

      if (!state.requiredTokens.length && !(state.requiredPairs?.length)) {
        issues.push({
          code: 'missing-token',
          component: contract.component,
          state: state.state,
          message: `State "${contract.component}.${state.state}" must define required tokens or required pairs`,
        });
      }

      const stateTokenSet = new Set(state.requiredTokens);
      for (const token of state.requiredTokens) {
        if (validTokenKeys && !validTokenKeys.has(token)) {
          issues.push({
            code: 'invalid-token-reference',
            component: contract.component,
            state: state.state,
            token,
            message: `State "${contract.component}.${state.state}" references unknown token "${token}"`,
          });
        }
      }

      for (const pair of state.requiredPairs || []) {
        if (!pair.fg || !pair.bg) {
          issues.push({
            code: 'invalid-contrast-pair',
            component: contract.component,
            state: state.state,
            message: `State "${contract.component}.${state.state}" has an invalid contrast pair`,
          });
          continue;
        }
        if (pair.minRatio <= 0 || pair.minRatio > 21) {
          issues.push({
            code: 'invalid-contrast-threshold',
            component: contract.component,
            state: state.state,
            message: `State "${contract.component}.${state.state}" defines invalid min ratio ${pair.minRatio}`,
          });
        }
        if (validTokenKeys) {
          if (!validTokenKeys.has(pair.fg)) {
            issues.push({
              code: 'invalid-token-reference',
              component: contract.component,
              state: state.state,
              token: pair.fg,
              message: `State "${contract.component}.${state.state}" references unknown fg token "${pair.fg}"`,
            });
          }
          if (!validTokenKeys.has(pair.bg)) {
            issues.push({
              code: 'invalid-token-reference',
              component: contract.component,
              state: state.state,
              token: pair.bg,
              message: `State "${contract.component}.${state.state}" references unknown bg token "${pair.bg}"`,
            });
          }
        }
        if (!stateTokenSet.has(pair.fg) || !stateTokenSet.has(pair.bg)) {
          issues.push({
            code: 'invalid-contrast-pair',
            component: contract.component,
            state: state.state,
            message: `State "${contract.component}.${state.state}" contrast pairs must also appear in requiredTokens`,
          });
        }
      }
    }
  }

  for (const [component, requiredStates] of Object.entries(COMPONENT_REQUIRED_STATES)) {
    const contract = THEME_COMPONENT_CONTRACTS.find((entry) => entry.component === component);
    if (!contract) {
      issues.push({
        code: 'missing-state-contracts',
        component,
        message: `Component "${component}" is missing from theme contracts`,
      });
      continue;
    }
    const definedStates = new Set<ComponentState>(contract.states.map((state) => state.state));
    for (const requiredState of requiredStates) {
      if (!definedStates.has(requiredState)) {
        issues.push({
          code: 'missing-required-state',
          component,
          state: requiredState,
          message: `Component "${component}" must define "${requiredState}" state`,
        });
      }
    }
  }

  return issues;
}
