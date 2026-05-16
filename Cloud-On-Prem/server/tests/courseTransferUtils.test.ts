import { describe, expect, it } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';
import archiver from 'archiver';

import {
  COURSE_TRANSFER_PACKAGE_VERSION,
  INCLUDED_ENTITY_TABLES,
  OPTIONAL_ENTITY_TABLES,
  computeChecksumsForDirectory,
  deepRewriteObject,
  decryptProtectedTransferPackageIfNeeded,
  extractZipSafely,
  filterIncludedTables,
  remapIdsForBundle,
  rewriteFileReferencesInRecord,
  sanitizeZipEntryPath,
  validateExtractedPackageLayout,
  validateManifestOrThrow,
  writeProtectedTransferPackage,
} from '../services/courseTransferUtils';
import crypto from 'crypto';

async function createZip(zipPath: string, writer: (archive: archiver.Archiver) => void) {
  await fs.promises.mkdir(path.dirname(zipPath), { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', resolve);
    output.on('error', reject);
    archive.on('error', reject);
    archive.pipe(output);
    writer(archive);
    archive.finalize().catch(reject);
  });
}

function validManifest(overrides: Record<string, any> = {}) {
  return {
    packageVersion: COURSE_TRANSFER_PACKAGE_VERSION,
    sourceAppVersion: 'test',
    exportedAt: new Date().toISOString(),
    sourceCourse: {
      id: 'course-old',
      title: 'Test Course',
      language: 'en',
      org: { id: 'org-a' },
    },
    compatibility: {
      minPackageVersion: '1.0.0',
    },
    include: [...INCLUDED_ENTITY_TABLES],
    exclude: ['progress'],
    files: [],
    checksums: {},
    ...overrides,
  };
}

describe('courseTransferUtils', () => {
  it('roundtrips protected packages with cloud-wrapped transfer keys and no shared package secret', async () => {
    const previousPrivate = process.env.CLOUD_LICENSE_PRIVATE_KEY;
    const previousPublicPath = process.env.CLOUD_LICENSE_PUBLIC_KEY_PATH;
    const previousTransferPrivate = process.env.COURSE_TRANSFER_PRIVATE_KEY;
    const previousTransferPrivatePath = process.env.COURSE_TRANSFER_PRIVATE_KEY_PATH;
    const previousTransferPublic = process.env.COURSE_TRANSFER_PUBLIC_KEY;
    const previousTransferPublicPath = process.env.COURSE_TRANSFER_PUBLIC_KEY_PATH;
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'course-transfer-protected-test-'));
    try {
      const licenseKeys = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
      const transferKeys = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
      const publicPath = path.join(tmpDir, 'cloud-license-public-key.pem');
      const transferPrivatePath = path.join(tmpDir, 'course-transfer-private-key.pem');
      const transferPublicPath = path.join(tmpDir, 'course-transfer-public-key.pem');
      await fs.promises.writeFile(
        publicPath,
        licenseKeys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
        'utf-8',
      );
      await fs.promises.writeFile(
        transferPrivatePath,
        transferKeys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
        'utf-8',
      );
      await fs.promises.writeFile(
        transferPublicPath,
        transferKeys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
        'utf-8',
      );
      process.env.CLOUD_LICENSE_PUBLIC_KEY_PATH = publicPath;
      delete process.env.CLOUD_LICENSE_PRIVATE_KEY;
      process.env.COURSE_TRANSFER_PRIVATE_KEY_PATH = transferPrivatePath;
      process.env.COURSE_TRANSFER_PUBLIC_KEY_PATH = transferPublicPath;
      delete process.env.COURSE_TRANSFER_PRIVATE_KEY;
      delete process.env.COURSE_TRANSFER_PUBLIC_KEY;

      const rawZipPath = path.join(tmpDir, 'raw.zip');
      await createZip(rawZipPath, (archive) => {
        archive.append('hello transfer', { name: 'hello.txt' });
      });
      const protectedZipPath = path.join(tmpDir, 'protected.zip');

      await writeProtectedTransferPackage({
        rawZipPath,
        outputZipPath: protectedZipPath,
        sourceContext: {
          variant: 'cloud',
          organizationId: 'org-cloud',
          courseId: 'course-cloud',
        },
      });

      const opened = await decryptProtectedTransferPackageIfNeeded({ zipPath: protectedZipPath });
      expect(opened.protectedPackage).toBe(true);
      const extracted = await extractZipSafely({ zipPath: opened.zipPath });
      expect(await fs.promises.readFile(path.join(extracted.outputDir, 'hello.txt'), 'utf-8')).toBe('hello transfer');
    } finally {
      process.env.CLOUD_LICENSE_PRIVATE_KEY = previousPrivate;
      process.env.CLOUD_LICENSE_PUBLIC_KEY_PATH = previousPublicPath;
      process.env.COURSE_TRANSFER_PRIVATE_KEY = previousTransferPrivate;
      process.env.COURSE_TRANSFER_PRIVATE_KEY_PATH = previousTransferPrivatePath;
      process.env.COURSE_TRANSFER_PUBLIC_KEY = previousTransferPublic;
      process.env.COURSE_TRANSFER_PUBLIC_KEY_PATH = previousTransferPublicPath;
      await fs.promises.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('keeps Cloud PRD export authorization verification separate from transfer payload wrapping keys', async () => {
    const previousPrivate = process.env.CLOUD_LICENSE_PRIVATE_KEY;
    const previousPublicPath = process.env.CLOUD_LICENSE_PUBLIC_KEY_PATH;
    const previousTransferPrivate = process.env.COURSE_TRANSFER_PRIVATE_KEY;
    const previousTransferPrivatePath = process.env.COURSE_TRANSFER_PRIVATE_KEY_PATH;
    const previousTransferPublic = process.env.COURSE_TRANSFER_PUBLIC_KEY;
    const previousTransferPublicPath = process.env.COURSE_TRANSFER_PUBLIC_KEY_PATH;
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'course-transfer-split-key-test-'));
    try {
      const licenseKeys = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
      const transferKeys = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
      const licensePublicPath = path.join(tmpDir, 'cloud-license-public-key.pem');
      const transferPrivatePath = path.join(tmpDir, 'course-transfer-private-key.pem');
      const transferPublicPath = path.join(tmpDir, 'course-transfer-public-key.pem');
      await fs.promises.writeFile(
        licensePublicPath,
        licenseKeys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
        'utf-8',
      );
      await fs.promises.writeFile(
        transferPrivatePath,
        transferKeys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
        'utf-8',
      );
      await fs.promises.writeFile(
        transferPublicPath,
        transferKeys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
        'utf-8',
      );

      process.env.CLOUD_LICENSE_PUBLIC_KEY_PATH = licensePublicPath;
      process.env.CLOUD_LICENSE_PRIVATE_KEY = licenseKeys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
      process.env.COURSE_TRANSFER_PRIVATE_KEY_PATH = transferPrivatePath;
      process.env.COURSE_TRANSFER_PUBLIC_KEY_PATH = transferPublicPath;
      delete process.env.COURSE_TRANSFER_PRIVATE_KEY;
      delete process.env.COURSE_TRANSFER_PUBLIC_KEY;

      const { signCourseTransferAuthorization } = await import('../services/courseTransferUtils');
      const exportAuthorization = signCourseTransferAuthorization({
        action: 'export',
        enterpriseSystemId: 'system-onprem',
      });
      delete process.env.CLOUD_LICENSE_PRIVATE_KEY;

      const rawZipPath = path.join(tmpDir, 'raw.zip');
      await createZip(rawZipPath, (archive) => {
        archive.append('split keys', { name: 'split.txt' });
      });
      const protectedZipPath = path.join(tmpDir, 'protected.zip');

      await writeProtectedTransferPackage({
        rawZipPath,
        outputZipPath: protectedZipPath,
        sourceContext: {
          variant: 'onprem',
          organizationId: 'org-onprem',
          courseId: 'course-onprem',
          enterpriseSystemId: 'system-onprem',
        },
        exportAuthorization,
      });

      const opened = await decryptProtectedTransferPackageIfNeeded({ zipPath: protectedZipPath });
      const extracted = await extractZipSafely({ zipPath: opened.zipPath });
      expect(await fs.promises.readFile(path.join(extracted.outputDir, 'split.txt'), 'utf-8')).toBe('split keys');
    } finally {
      process.env.CLOUD_LICENSE_PRIVATE_KEY = previousPrivate;
      process.env.CLOUD_LICENSE_PUBLIC_KEY_PATH = previousPublicPath;
      process.env.COURSE_TRANSFER_PRIVATE_KEY = previousTransferPrivate;
      process.env.COURSE_TRANSFER_PRIVATE_KEY_PATH = previousTransferPrivatePath;
      process.env.COURSE_TRANSFER_PUBLIC_KEY = previousTransferPublic;
      process.env.COURSE_TRANSFER_PUBLIC_KEY_PATH = previousTransferPublicPath;
      await fs.promises.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('wraps onprem-origin protected packages with the authority-provided transfer public key', async () => {
    const previousPrivate = process.env.CLOUD_LICENSE_PRIVATE_KEY;
    const previousPublicPath = process.env.CLOUD_LICENSE_PUBLIC_KEY_PATH;
    const previousTransferPrivate = process.env.COURSE_TRANSFER_PRIVATE_KEY;
    const previousTransferPrivatePath = process.env.COURSE_TRANSFER_PRIVATE_KEY_PATH;
    const previousTransferPublic = process.env.COURSE_TRANSFER_PUBLIC_KEY;
    const previousTransferPublicPath = process.env.COURSE_TRANSFER_PUBLIC_KEY_PATH;
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'course-transfer-authority-wrap-test-'));
    try {
      const licenseKeys = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
      const localTransferKeys = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
      const authorityTransferKeys = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
      const licensePublicPath = path.join(tmpDir, 'cloud-license-public-key.pem');
      const localTransferPublicPath = path.join(tmpDir, 'local-course-transfer-public-key.pem');
      const authorityTransferPrivatePath = path.join(tmpDir, 'authority-course-transfer-private-key.pem');
      await fs.promises.writeFile(
        licensePublicPath,
        licenseKeys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
        'utf-8',
      );
      await fs.promises.writeFile(
        localTransferPublicPath,
        localTransferKeys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
        'utf-8',
      );
      await fs.promises.writeFile(
        authorityTransferPrivatePath,
        authorityTransferKeys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
        'utf-8',
      );

      process.env.CLOUD_LICENSE_PUBLIC_KEY_PATH = licensePublicPath;
      process.env.CLOUD_LICENSE_PRIVATE_KEY = licenseKeys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
      delete process.env.COURSE_TRANSFER_PRIVATE_KEY;
      process.env.COURSE_TRANSFER_PRIVATE_KEY_PATH = authorityTransferPrivatePath;
      delete process.env.COURSE_TRANSFER_PUBLIC_KEY;
      process.env.COURSE_TRANSFER_PUBLIC_KEY_PATH = localTransferPublicPath;

      const { signCourseTransferAuthorization } = await import('../services/courseTransferUtils');
      const exportAuthorization = signCourseTransferAuthorization({
        action: 'export',
        enterpriseSystemId: 'system-onprem',
      });
      delete process.env.CLOUD_LICENSE_PRIVATE_KEY;

      const rawZipPath = path.join(tmpDir, 'raw.zip');
      await createZip(rawZipPath, (archive) => {
        archive.append('authority wrapped', { name: 'authority.txt' });
      });
      const protectedZipPath = path.join(tmpDir, 'protected.zip');

      await writeProtectedTransferPackage({
        rawZipPath,
        outputZipPath: protectedZipPath,
        sourceContext: {
          variant: 'onprem',
          organizationId: 'org-onprem',
          courseId: 'course-onprem',
          enterpriseSystemId: 'system-onprem',
        },
        exportAuthorization,
        transferPublicKeyPem: authorityTransferKeys.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
      } as any);

      const opened = await decryptProtectedTransferPackageIfNeeded({ zipPath: protectedZipPath });
      const extracted = await extractZipSafely({ zipPath: opened.zipPath });
      expect(await fs.promises.readFile(path.join(extracted.outputDir, 'authority.txt'), 'utf-8')).toBe('authority wrapped');
    } finally {
      process.env.CLOUD_LICENSE_PRIVATE_KEY = previousPrivate;
      process.env.CLOUD_LICENSE_PUBLIC_KEY_PATH = previousPublicPath;
      process.env.COURSE_TRANSFER_PRIVATE_KEY = previousTransferPrivate;
      process.env.COURSE_TRANSFER_PRIVATE_KEY_PATH = previousTransferPrivatePath;
      process.env.COURSE_TRANSFER_PUBLIC_KEY = previousTransferPublic;
      process.env.COURSE_TRANSFER_PUBLIC_KEY_PATH = previousTransferPublicPath;
      await fs.promises.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('rejects onprem-origin protected packages without Cloud PRD export authorization', async () => {
    const previousPrivate = process.env.CLOUD_LICENSE_PRIVATE_KEY;
    const previousPublicPath = process.env.CLOUD_LICENSE_PUBLIC_KEY_PATH;
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'course-transfer-onprem-auth-test-'));
    try {
      const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
      const publicPath = path.join(tmpDir, 'cloud-license-public-key.pem');
      await fs.promises.writeFile(
        publicPath,
        publicKey.export({ type: 'spki', format: 'pem' }).toString(),
        'utf-8',
      );
      process.env.CLOUD_LICENSE_PUBLIC_KEY_PATH = publicPath;
      process.env.CLOUD_LICENSE_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();

      const rawZipPath = path.join(tmpDir, 'raw.zip');
      await createZip(rawZipPath, (archive) => {
        archive.append('blocked', { name: 'blocked.txt' });
      });
      const protectedZipPath = path.join(tmpDir, 'protected.zip');

      await writeProtectedTransferPackage({
        rawZipPath,
        outputZipPath: protectedZipPath,
        sourceContext: {
          variant: 'onprem',
          organizationId: 'org-onprem',
          courseId: 'course-onprem',
          enterpriseSystemId: 'system-onprem',
        },
      });

      await expect(decryptProtectedTransferPackageIfNeeded({ zipPath: protectedZipPath }))
        .rejects
        .toThrow('missing Cloud PRD export authorization');
    } finally {
      process.env.CLOUD_LICENSE_PRIVATE_KEY = previousPrivate;
      process.env.CLOUD_LICENSE_PUBLIC_KEY_PATH = previousPublicPath;
      await fs.promises.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('validates manifest schema and include declaration', () => {
    const manifest = validateManifestOrThrow(validManifest());
    expect(manifest.packageVersion).toBe('1.0.0');

    expect(() => validateManifestOrThrow(validManifest({ packageVersion: '2.0.0' }))).toThrow('Unsupported packageVersion');
    expect(() => validateManifestOrThrow(validManifest({ include: ['courses'] }))).toThrow('missing required table');
    expect(() => validateManifestOrThrow({ packageVersion: '1.0.0' })).toThrow();
  });

  it('accepts older packages that do not declare source asset tables', async () => {
    const includeWithoutSourceTables = INCLUDED_ENTITY_TABLES.filter(
      (table) => !(OPTIONAL_ENTITY_TABLES as readonly string[]).includes(table),
    );
    const manifest = validateManifestOrThrow(validManifest({ include: includeWithoutSourceTables }));
    expect(manifest.include).not.toContain('courseSourceAssets');

    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'course-transfer-legacy-test-'));
    try {
      await fs.promises.mkdir(path.join(tmpDir, 'data'), { recursive: true });
      for (const table of includeWithoutSourceTables) {
        await fs.promises.writeFile(path.join(tmpDir, 'data', `${table}.json`), JSON.stringify([]), 'utf-8');
      }

      expect(() => validateExtractedPackageLayout({
        extractedDir: tmpDir,
        manifest,
        enforceChecksums: false,
      })).not.toThrow();
    } finally {
      await fs.promises.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('filters only included entity tables', () => {
    const input: Record<string, any[]> = {
      courses: [{ id: 'c1' }],
      lessons: [{ id: 'l1' }],
      progress: [{ id: 'p1' }],
    };

    const filtered = filterIncludedTables(input);
    expect(filtered.courses).toHaveLength(1);
    expect(filtered.lessons).toHaveLength(1);
    expect((filtered as any).progress).toBeUndefined();
  });

  it('creates old->new id maps and rewrites nested references', () => {
    const bundle = {
      courses: [{ id: 'course-old', title: 'A' }],
      lessons: [{ id: 'lesson-old', courseId: 'course-old', meta: { linkedCourseId: 'course-old' } }],
      courseFrameworks: [],
      courseLessons: [],
      lessonSlides: [],
      lessonPresentationVersions: [],
      lessonContentVersions: [],
      lessonVersions: [],
      lessonQuizLinks: [],
      quizCollections: [],
      quizCards: [],
      quizCollectionVersions: [],
      quizCardVersions: [],
      courseVersions: [],
      courseTags: [],
    };

    const { allIdMap } = remapIdsForBundle(bundle);
    expect(allIdMap['course-old']).toBeDefined();
    expect(allIdMap['lesson-old']).toBeDefined();
    expect(allIdMap['course-old']).not.toBe('course-old');

    const rewritten = deepRewriteObject(bundle.lessons[0], { idMap: allIdMap, filePathMap: {} });
    expect(rewritten.courseId).toBe(allIdMap['course-old']);
    expect(rewritten.meta.linkedCourseId).toBe(allIdMap['course-old']);
  });

  it('rewrites file references recursively', () => {
    const row = {
      storageKey: '/private/a.pptx',
      nested: {
        preview: '/private/a.pptx',
      },
    };

    const rewritten = rewriteFileReferencesInRecord(row, {
      '/private/a.pptx': '/private/imported/new-a.pptx',
    });

    expect(rewritten.storageKey).toBe('/private/imported/new-a.pptx');
    expect(rewritten.nested.preview).toBe('/private/imported/new-a.pptx');
  });

  it('roundtrip integration: validates package layout after extract', async () => {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'course-transfer-test-'));
    const zipPath = path.join(tmpDir, 'package.zip');

    const baseManifest = validManifest({
      files: [{
        sourcePath: '/private/a.pptx',
        packagePath: 'files/a.pptx',
        sha256: '',
        sizeBytes: 3,
      }],
    });

    await createZip(zipPath, (archive) => {
      archive.append(JSON.stringify([{ id: 'course-old' }]), { name: 'data/courses.json' });
      for (const table of INCLUDED_ENTITY_TABLES) {
        if (table === 'courses') continue;
        archive.append(JSON.stringify([]), { name: `data/${table}.json` });
      }
      archive.append('abc', { name: 'files/a.pptx' });
      archive.append(JSON.stringify(baseManifest), { name: 'manifest.json' });
      archive.append(JSON.stringify({}), { name: 'checksums.json' });
    });

    const extracted = await extractZipSafely({ zipPath });

    const checksums = await computeChecksumsForDirectory(extracted.outputDir);
    const manifest = {
      ...baseManifest,
      files: [{
        ...((baseManifest.files as any[])[0] as Record<string, any>),
        sha256: checksums['files/a.pptx'],
      }],
      checksums: {
        'files/a.pptx': checksums['files/a.pptx'],
      },
    };

    await fs.promises.writeFile(path.join(extracted.outputDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');

    const parsedManifest = validateManifestOrThrow(manifest);
    validateExtractedPackageLayout({
      extractedDir: extracted.outputDir,
      manifest: parsedManifest,
      enforceChecksums: true,
    });

    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  it('rejects corrupted zip', async () => {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'course-transfer-test-'));
    const zipPath = path.join(tmpDir, 'corrupt.zip');
    await fs.promises.writeFile(zipPath, 'not-a-zip', 'utf-8');

    await expect(extractZipSafely({ zipPath })).rejects.toThrow();
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  it('rejects zip-slip and invalid extraction paths', () => {
    expect(() => sanitizeZipEntryPath('../evil.txt')).toThrow('Unsafe zip entry path');
    expect(() => sanitizeZipEntryPath('/absolute/path.txt')).toThrow('Absolute zip entry path');
  });

  it('negative layout tests: missing required file and malformed manifest', async () => {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'course-transfer-test-'));
    await fs.promises.mkdir(path.join(tmpDir, 'data'), { recursive: true });
    await fs.promises.writeFile(path.join(tmpDir, 'data/courses.json'), JSON.stringify([]), 'utf-8');

    const manifest = validateManifestOrThrow(validManifest());
    expect(() => validateExtractedPackageLayout({ extractedDir: tmpDir, manifest, enforceChecksums: false })).toThrow('missing required data file');

    expect(() => validateManifestOrThrow(validManifest({ packageVersion: '99.0.0' }))).toThrow('Unsupported packageVersion');
    expect(() => validateManifestOrThrow({ packageVersion: '1.0.0', include: [] })).toThrow();

    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });
});
