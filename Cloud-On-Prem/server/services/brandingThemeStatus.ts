type ThemeStatus = 'draft' | 'active';

export function resolveThemeSaveStatus(existingStatus: ThemeStatus | null | undefined): ThemeStatus {
  void existingStatus;
  // Saving always produces a draft snapshot; explicit activation is required to publish.
  return 'draft';
}
