export function getThemeCelebrationPalette(): string[] {
  return [
    'var(--action-primary)',
    'var(--action-secondary)',
    'var(--action-accent)',
    'var(--chart-1)',
    'var(--chart-2)',
    'var(--chart-3)',
  ];
}

export function getThemeConfettiColors(): string[] {
  return getThemeCelebrationPalette();
}

export function getThemeAvatarFallbackGradient(): string {
  return 'var(--action-primary)';
}

export function getThemeAvatarFallbackRing(): string {
  return '2px solid var(--stroke-default)';
}
