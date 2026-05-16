import type { BrandEditorState } from '../components/brand-editor';

export function hasUnsavedThemeChanges(
  editorState: BrandEditorState | null,
  initialState: BrandEditorState | null
): boolean {
  if (!editorState || !initialState) return false;
  return JSON.stringify(editorState) !== JSON.stringify(initialState);
}

export function shouldHydrateFetchedTheme(params: {
  themeLoading: boolean;
  hasUnsavedChanges: boolean;
  lastHydratedEndpoint: string | null;
  nextEndpoint: string;
}): boolean {
  const { themeLoading, hasUnsavedChanges, lastHydratedEndpoint, nextEndpoint } = params;
  if (themeLoading) return false;
  const sameEndpointSession = lastHydratedEndpoint === nextEndpoint;
  if (hasUnsavedChanges && sameEndpointSession) return false;
  return true;
}
