// Vault loader removed — Mode B (LearnPlay-managed keys) is no longer supported.
// On-prem customers must always provide their own API keys.
// This file is kept as a stub to prevent import errors during builds.
export function loadVault(): { loaded: boolean; keysInjected: number; errors: string[] } {
  return { loaded: false, keysInjected: 0, errors: [] };
}
