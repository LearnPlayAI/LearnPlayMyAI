import { describe, it, expect } from '@jest/globals';
import path from 'path';
import { getUploadDir, resolveStoragePath } from '../utils/uploadPaths';
import { buildCanonicalStorageKey } from '../utils/storageKeyManager';

describe('resolveStoragePath', () => {
  const uploadDir = path.resolve(getUploadDir());

  it('keeps paths already in current upload dir', () => {
    const current = path.join(uploadDir, 'private', 'lessons', 'org-1', 'lesson-1', 'en', 'v1.pptx');
    expect(resolveStoragePath(current)).toBe(current);
  });

  it('maps legacy absolute /opt/uploads/private paths into current upload root', () => {
    const legacy = '/opt/uploads/private/lessons/org-1/lesson-1/en/v2.pptx';
    expect(resolveStoragePath(legacy)).toBe(
      path.join(uploadDir, 'private', 'lessons', 'org-1', 'lesson-1', 'en', 'v2.pptx')
    );
  });

  it('maps legacy absolute /opt/uploads/public paths into current upload root', () => {
    const legacy = '/opt/uploads/public/branding/org-1/logo.png';
    expect(resolveStoragePath(legacy)).toBe(
      path.join(uploadDir, 'public', 'branding', 'org-1', 'logo.png')
    );
  });

  it('maps relative private/public paths into current upload root', () => {
    expect(resolveStoragePath('private/lessons/org-1/lesson-1/en/v3.pptx')).toBe(
      path.join(uploadDir, 'private', 'lessons', 'org-1', 'lesson-1', 'en', 'v3.pptx')
    );
    expect(resolveStoragePath('/public/avatars/user/avatar.jpg')).toBe(
      path.join(uploadDir, 'public', 'avatars', 'user', 'avatar.jpg')
    );
  });
});

describe('course source asset storage keys', () => {
  it('uses private source asset domain for extracted source visuals', () => {
    const key = buildCanonicalStorageKey({
      scope: 'private',
      domain: 'source-assets',
      extension: '.png',
      seed: 'org-1:doc-1:page-7:figure-1',
    });

    expect(key).toContain('/private/');
    expect(key).toContain('/source-asset/');
    expect(key.endsWith('.png')).toBe(true);
  });
});
