import { describe, expect, it } from '@jest/globals';
import {
  getPresentationVersionsToDeleteOnUpload,
  resolveActivePresentationVersion,
} from '../services/lessonPresentationVersionPolicy';

const version = (id: string, versionNumber: number, isGenerated = false, storageKey = `lesson/v${versionNumber}.pptx`) => ({
  id,
  version: versionNumber,
  isGenerated,
  storageKey,
});

describe('lesson presentation version policy', () => {
  it('keeps previous versions when replacing a PPTX so users can reactivate them later', () => {
    const existing = [
      version('v2', 2, false),
      version('v1', 1, false),
    ];

    expect(getPresentationVersionsToDeleteOnUpload(existing)).toEqual([]);
  });

  it('resolves the explicit active version instead of always choosing the newest upload', () => {
    const existing = [
      version('v3', 3, false, 'lesson/v3.pptx'),
      version('v2', 2, false, 'lesson/v2.pptx'),
      version('v1', 1, false, 'lesson/v1.pptx'),
    ];

    expect(resolveActivePresentationVersion(existing, 2)).toEqual(existing[1]);
  });

  it('falls back to the newest version when no active version is set', () => {
    const existing = [
      version('v3', 3, false, 'lesson/v3.pptx'),
      version('v2', 2, false, 'lesson/v2.pptx'),
    ];

    expect(resolveActivePresentationVersion(existing, null)).toEqual(existing[0]);
  });
});
