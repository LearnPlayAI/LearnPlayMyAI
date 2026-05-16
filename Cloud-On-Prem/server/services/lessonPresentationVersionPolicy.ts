type PresentationVersionLike = {
  version: number;
};

export function getPresentationVersionsToDeleteOnUpload<T extends PresentationVersionLike>(_versions: T[]): T[] {
  return [];
}

export function resolveActivePresentationVersion<T extends PresentationVersionLike>(
  versions: T[],
  activeVersion: number | null | undefined,
): T | null {
  if (versions.length === 0) {
    return null;
  }

  const normalizedActiveVersion = Number(activeVersion || 0);
  if (normalizedActiveVersion > 0) {
    const explicitActive = versions.find((version) => Number(version.version) === normalizedActiveVersion);
    if (explicitActive) {
      return explicitActive;
    }
  }

  return versions.reduce((latest, version) => (
    Number(version.version) > Number(latest.version) ? version : latest
  ), versions[0]);
}
