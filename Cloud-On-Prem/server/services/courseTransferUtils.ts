import archiver from "archiver";
import { createCipheriv, createDecipheriv, createHash, createPrivateKey, createPublicKey, diffieHellman, generateKeyPairSync, hkdfSync, randomBytes, randomUUID, sign, verify } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { pipeline } from "stream/promises";
import unzipper from "unzipper";
import { z } from "zod";
import { getCloudPrivateKey, getCloudPublicKey, normalizePem } from "./licenseCryptoService";

export const COURSE_TRANSFER_PACKAGE_VERSION = "1.0.0";
export const PROTECTED_TRANSFER_DESCRIPTOR = "learnplay-course-transfer.json";
export const PROTECTED_TRANSFER_PAYLOAD = "payload.enc";
const PROTECTED_TRANSFER_FORMAT = "learnplay.course-transfer.protected.v1";
const PROTECTED_TRANSFER_KEY_WRAP = "cloud-license-ecdh-aes-256-gcm";
const PROTECTED_TRANSFER_AUTH_FORMAT = "learnplay.course-transfer.authorization.v1";
const TRANSFER_HKDF_SALT = "lp-course-transfer-ecdh-salt";
const TRANSFER_HKDF_INFO = "learnplay-course-transfer-v1";

export const INCLUDED_ENTITY_TABLES = [
  "courses",
  "courseFrameworks",
  "courseLessons",
  "lessons",
  "lessonSlides",
  "lessonPresentationVersions",
  "lessonContentVersions",
  "lessonVersions",
  "lessonQuizLinks",
  "courseSourceDocuments",
  "courseSourceAssets",
  "courseSourceAssetLinks",
  "quizCollections",
  "quizCards",
  "quizCollectionVersions",
  "quizCardVersions",
  "courseVersions",
  "courseTags",
] as const;

export const OPTIONAL_ENTITY_TABLES = [
  "courseSourceDocuments",
  "courseSourceAssets",
  "courseSourceAssetLinks",
] as const;

export const EXCLUDED_ENTITY_TABLES = [
  "assignments",
  "enrollments",
  "progress",
  "purchases",
  "refunds",
  "payments",
  "ratings",
  "reviews",
  "certificates",
  "gameplay",
  "results",
  "history",
  "creditLedgers",
  "usageLogs",
  "accessLogs",
  "auditTelemetry",
] as const;

export type IncludedEntityTable = typeof INCLUDED_ENTITY_TABLES[number];

const compatibilitySchema = z.object({
  minPackageVersion: z.string().default("1.0.0"),
  minAppVersion: z.string().optional(),
  maxAppVersion: z.string().optional(),
});

export const courseTransferManifestSchema = z.object({
  packageVersion: z.string().min(1),
  sourceAppVersion: z.string().min(1),
  exportedAt: z.string().min(1),
  sourceCourse: z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    language: z.string().optional().default("en"),
    contentGroupId: z.string().optional(),
    org: z.object({
      id: z.string().min(1),
      name: z.string().optional(),
    }),
  }),
  compatibility: compatibilitySchema,
  include: z.array(z.string()).default([]),
  exclude: z.array(z.string()).default([]),
  files: z.array(z.object({
    sourcePath: z.string().min(1),
    packagePath: z.string().min(1),
    sha256: z.string().min(1),
    sizeBytes: z.number().int().nonnegative(),
    sourceRootPath: z.string().optional(),
    relativeSourcePath: z.string().optional(),
    originalSourcePath: z.string().optional(),
    sourceStorageClass: z.string().optional(),
    artifactKind: z.string().optional(),
    targetStorageStrategy: z.string().optional(),
  })).default([]),
  checksums: z.record(z.string(), z.string()).default({}),
  familySummary: z.object({
    courseCount: z.number().int().nonnegative().default(0),
    versionCount: z.number().int().nonnegative().default(0),
    translationCount: z.number().int().nonnegative().default(0),
    languageCodes: z.array(z.string()).default([]),
    lessonCount: z.number().int().nonnegative().default(0),
    quizCount: z.number().int().nonnegative().default(0),
  }).optional(),
  clonePolicy: z.object({
    fullFamily: z.boolean().default(true),
    importDefaultMode: z.string().default("create_new"),
    importedCourseStatus: z.string().default("draft"),
    targetOrgResolution: z.string().default("authenticated_or_impersonated"),
  }).optional(),
  artifactPortability: z.object({
    packageContainsSelectedArtifacts: z.boolean().default(true),
    targetStorageStrategy: z.string().default("rewrite_to_target_upload_root"),
    originalPathsAreInformational: z.boolean().default(true),
  }).optional(),
});

export type CourseTransferManifest = z.infer<typeof courseTransferManifestSchema>;

export type CourseTransferDataBundle = Record<string, Array<Record<string, any>>>;

export type CourseTransferSourceContext = {
  variant: "cloud" | "onprem";
  organizationId: string;
  courseId?: string | null;
  organizationIdentity?: {
    businessName?: string | null;
    businessRegistrationNumber?: string | null;
    identityHash?: string | null;
  } | null;
  userId?: string | null;
  enterpriseCustomerId?: string | null;
  enterpriseSystemId?: string | null;
  systemType?: string | null;
};

export type SignedCourseTransferAuthorization = {
  format: typeof PROTECTED_TRANSFER_AUTH_FORMAT;
  payload: string;
  signature: string;
  keyId: string;
};

export type ProtectedTransferDescriptor = {
  format: string;
  packageVersion: string;
  algorithm: string;
  keyManagement?: {
    mode: "cloud-wrapped-dek";
    authority: "cloud-prd-license";
    wrapAlgorithm: typeof PROTECTED_TRANSFER_KEY_WRAP;
    wrappedKey: string;
    ephemeralPublicKey: string;
    iv: string;
    authTag: string;
    keyId: string;
  };
  iv: string;
  authTag: string;
  encryptedPayload: string;
  encryptedSha256: string;
  payloadSha256: string;
  createdAt: string;
  source?: CourseTransferSourceContext;
  exportAuthorization?: SignedCourseTransferAuthorization | null;
  manifestSummary?: Record<string, unknown>;
};

export type UnwrapTransferDataKeyParams = {
  descriptor: ProtectedTransferDescriptor;
  encryptedPayloadSha256: string;
};

export function sha256Buffer(input: Buffer | string): string {
  return createHash("sha256").update(input).digest("hex");
}

async function sha256File(filePath: string): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function zipDirectory(params: {
  sourceDir: string;
  outputZipPath: string;
}): Promise<void> {
  await fs.promises.mkdir(path.dirname(params.outputZipPath), { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const out = fs.createWriteStream(params.outputZipPath);
    const archive = archiver("zip", { zlib: { level: 9 } });
    out.on("close", resolve);
    out.on("error", reject);
    archive.on("error", reject);
    archive.pipe(out);
    archive.directory(params.sourceDir, false);
    archive.finalize().catch(reject);
  });
}

function cloudLicensePublicKeyId(): string {
  const der = getCloudPublicKey().export({ type: "spki", format: "der" });
  return createHash("sha256").update(der).digest("hex").substring(0, 16);
}

function readPemFromEnvOrPath(valueEnv: string, pathEnv: string): string | null {
  const direct = String(process.env[valueEnv] || "").trim();
  if (direct && direct !== "undefined" && direct !== "null") return direct;
  const filePath = String(process.env[pathEnv] || "").trim();
  if (!filePath || filePath === "undefined" || filePath === "null") return null;
  if (!fs.existsSync(filePath)) {
    throw new Error(`${pathEnv} is configured but the file does not exist: ${filePath}`);
  }
  return fs.readFileSync(filePath, "utf-8");
}

function normalizePublicPem(raw: string): string {
  let pem = raw.replace(/\\n/g, "\n").trim();
  if (pem.includes("-----BEGIN") && !pem.includes("\n")) {
    pem = pem
      .replace(/-----BEGIN ([A-Z ]+)-----\s*/, "-----BEGIN $1-----\n")
      .replace(/\s*-----END ([A-Z ]+)-----/, "\n-----END $1-----");
    const headerMatch = pem.match(/^(-----BEGIN [A-Z ]+-----)\n([\s\S]+)\n(-----END [A-Z ]+-----)$/);
    if (headerMatch) {
      const body = headerMatch[2].replace(/\s+/g, "");
      const lines = body.match(/.{1,64}/g) || [body];
      pem = `${headerMatch[1]}\n${lines.join("\n")}\n${headerMatch[3]}`;
    }
  }
  if (!pem.startsWith("-----BEGIN")) {
    const body = pem.replace(/\s+/g, "");
    const lines = body.match(/.{1,64}/g) || [body];
    pem = `-----BEGIN PUBLIC KEY-----\n${lines.join("\n")}\n-----END PUBLIC KEY-----`;
  }
  return pem;
}

function getCourseTransferPublicKey(rawOverride?: string | null) {
  const raw = rawOverride || readPemFromEnvOrPath("COURSE_TRANSFER_PUBLIC_KEY", "COURSE_TRANSFER_PUBLIC_KEY_PATH");
  if (raw) {
    return createPublicKey(normalizePublicPem(raw));
  }
  return getCloudPublicKey();
}

function getCourseTransferPrivateKey() {
  const raw = readPemFromEnvOrPath("COURSE_TRANSFER_PRIVATE_KEY", "COURSE_TRANSFER_PRIVATE_KEY_PATH");
  if (raw) {
    return getCloudPrivateKeyFromPem(raw);
  }
  return getCloudPrivateKey();
}

function getCloudPrivateKeyFromPem(raw: string) {
  return createPrivateKey(normalizePem(raw));
}

export function getCourseTransferPublicKeyPem(): string {
  return getCourseTransferPublicKey().export({ type: "spki", format: "pem" }).toString();
}

export function getCourseTransferPublicKeyId(rawOverride?: string | null): string {
  const der = getCourseTransferPublicKey(rawOverride).export({ type: "spki", format: "der" });
  return createHash("sha256").update(der).digest("hex").substring(0, 16);
}

export function wrapCourseTransferDataKey(dataKey: Buffer, transferPublicKeyPem?: string | null): {
  wrappedKey: string;
  ephemeralPublicKey: string;
  iv: string;
  authTag: string;
  keyId: string;
} {
  const { privateKey: ephemeralPrivateKey, publicKey: ephemeralPublicKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  const wrapKey = Buffer.from(hkdfSync(
    "sha256",
    diffieHellman({ privateKey: ephemeralPrivateKey, publicKey: getCourseTransferPublicKey(transferPublicKeyPem) }),
    TRANSFER_HKDF_SALT,
    TRANSFER_HKDF_INFO,
    32,
  ));
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", wrapKey, iv);
  const encrypted = Buffer.concat([cipher.update(dataKey), cipher.final()]);
  return {
    wrappedKey: encrypted.toString("base64"),
    ephemeralPublicKey: ephemeralPublicKey.export({ type: "spki", format: "pem" }).toString(),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    keyId: getCourseTransferPublicKeyId(transferPublicKeyPem),
  };
}

export function unwrapCourseTransferDataKeyFromDescriptor(descriptor: ProtectedTransferDescriptor): Buffer {
  if (descriptor?.keyManagement?.mode !== "cloud-wrapped-dek") {
    throw new Error("Protected package is missing Cloud PRD key wrapping metadata");
  }
  if (descriptor.keyManagement.wrapAlgorithm !== PROTECTED_TRANSFER_KEY_WRAP) {
    throw new Error("Unsupported protected course package key wrapping");
  }
  const ephemeralPublicKey = createPublicKey(String(descriptor.keyManagement.ephemeralPublicKey || ""));
  const wrapKey = Buffer.from(hkdfSync(
    "sha256",
    diffieHellman({ privateKey: getCourseTransferPrivateKey(), publicKey: ephemeralPublicKey }),
    TRANSFER_HKDF_SALT,
    TRANSFER_HKDF_INFO,
    32,
  ));
  const decipher = createDecipheriv(
    "aes-256-gcm",
    wrapKey,
    Buffer.from(String(descriptor.keyManagement.iv || ""), "base64"),
  );
  decipher.setAuthTag(Buffer.from(String(descriptor.keyManagement.authTag || ""), "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(String(descriptor.keyManagement.wrappedKey || ""), "base64")),
    decipher.final(),
  ]);
}

export function signCourseTransferAuthorization(payload: Record<string, unknown>): SignedCourseTransferAuthorization {
  const payloadWithFormat = {
    ...payload,
    format: PROTECTED_TRANSFER_AUTH_FORMAT,
  };
  const payloadJson = JSON.stringify(payloadWithFormat);
  const signature = sign("sha256", Buffer.from(payloadJson), getCloudPrivateKey());
  return {
    format: PROTECTED_TRANSFER_AUTH_FORMAT,
    payload: Buffer.from(payloadJson, "utf-8").toString("base64"),
    signature: signature.toString("base64"),
    keyId: cloudLicensePublicKeyId(),
  };
}

export function verifyCourseTransferAuthorization(auth: unknown): Record<string, any> {
  const signed = auth as Partial<SignedCourseTransferAuthorization>;
  if (!signed || signed.format !== PROTECTED_TRANSFER_AUTH_FORMAT || !signed.payload || !signed.signature) {
    throw new Error("Protected package is missing Cloud PRD export authorization");
  }
  const payloadRaw = Buffer.from(String(signed.payload), "base64");
  const valid = verify(
    "sha256",
    payloadRaw,
    getCloudPublicKey(),
    Buffer.from(String(signed.signature), "base64"),
  );
  if (!valid) {
    throw new Error("Protected package export authorization signature is invalid");
  }
  const payload = JSON.parse(payloadRaw.toString("utf-8"));
  if (payload?.format !== PROTECTED_TRANSFER_AUTH_FORMAT) {
    throw new Error("Protected package export authorization format is invalid");
  }
  const expiresAt = new Date(String(payload.expiresAt || ""));
  if (!Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() < Date.now()) {
    throw new Error("Protected package export authorization has expired");
  }
  return payload;
}

export async function writeProtectedTransferPackage(params: {
  rawZipPath: string;
  outputZipPath: string;
  manifestSummary?: Record<string, unknown>;
  sourceContext: CourseTransferSourceContext;
  exportAuthorization?: SignedCourseTransferAuthorization | null;
  transferPublicKeyPem?: string | null;
}): Promise<void> {
  const workDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "course-transfer-protected-"));
  const payloadPath = path.join(workDir, PROTECTED_TRANSFER_PAYLOAD);
  const descriptorPath = path.join(workDir, PROTECTED_TRANSFER_DESCRIPTOR);
  const dataKey = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", dataKey, iv);

  await pipeline(fs.createReadStream(params.rawZipPath), cipher, fs.createWriteStream(payloadPath));
  const wrapped = wrapCourseTransferDataKey(dataKey, params.transferPublicKeyPem);

  const descriptor: ProtectedTransferDescriptor = {
    format: PROTECTED_TRANSFER_FORMAT,
    packageVersion: COURSE_TRANSFER_PACKAGE_VERSION,
    algorithm: "aes-256-gcm",
    keyManagement: {
      mode: "cloud-wrapped-dek",
      authority: "cloud-prd-license",
      wrapAlgorithm: PROTECTED_TRANSFER_KEY_WRAP,
      wrappedKey: wrapped.wrappedKey,
      ephemeralPublicKey: wrapped.ephemeralPublicKey,
      iv: wrapped.iv,
      authTag: wrapped.authTag,
      keyId: wrapped.keyId,
    },
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    encryptedPayload: PROTECTED_TRANSFER_PAYLOAD,
    encryptedSha256: await sha256File(payloadPath),
    payloadSha256: await sha256File(params.rawZipPath),
    createdAt: new Date().toISOString(),
    source: params.sourceContext,
    exportAuthorization: params.exportAuthorization || null,
    manifestSummary: params.manifestSummary || {},
  };

  await fs.promises.writeFile(descriptorPath, JSON.stringify(descriptor, null, 2), "utf-8");
  await zipDirectory({ sourceDir: workDir, outputZipPath: params.outputZipPath });
}

export async function decryptProtectedTransferPackageIfNeeded(params: {
  zipPath: string;
  unwrapDataKey?: (params: UnwrapTransferDataKeyParams) => Promise<Buffer>;
}): Promise<{ zipPath: string; cleanupDir?: string; protectedPackage: boolean }> {
  const directory = await unzipper.Open.file(params.zipPath);
  const hasDescriptor = (directory.files as any[]).some(
    (entry) => String(entry.path || "") === PROTECTED_TRANSFER_DESCRIPTOR
  );
  const hasPayload = (directory.files as any[]).some(
    (entry) => String(entry.path || "") === PROTECTED_TRANSFER_PAYLOAD
  );

  if (!hasDescriptor && !hasPayload) {
    return { zipPath: params.zipPath, protectedPackage: false };
  }
  if (!hasDescriptor || !hasPayload) {
    throw new Error("Protected package is incomplete");
  }

  const protectedDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "course-transfer-protected-open-"));
  const { outputDir } = await extractZipSafely({
    zipPath: params.zipPath,
    destinationDir: protectedDir,
  });
  const descriptorPath = path.join(outputDir, PROTECTED_TRANSFER_DESCRIPTOR);
  const payloadPath = path.join(outputDir, PROTECTED_TRANSFER_PAYLOAD);
  const descriptor = JSON.parse(await fs.promises.readFile(descriptorPath, "utf-8")) as ProtectedTransferDescriptor;

  if (descriptor?.format !== PROTECTED_TRANSFER_FORMAT) {
    throw new Error("Unsupported protected course package format");
  }
  if (descriptor?.algorithm !== "aes-256-gcm") {
    throw new Error("Unsupported protected course package encryption");
  }
  if (descriptor?.keyManagement?.authority !== "cloud-prd-license") {
    throw new Error("Protected course package requires Cloud PRD transfer authorization");
  }
  if (String(descriptor.source?.variant || "").toLowerCase() === "onprem") {
    const authPayload = verifyCourseTransferAuthorization(descriptor.exportAuthorization);
    if (String(authPayload.action || "") !== "export") {
      throw new Error("Protected package export authorization is invalid");
    }
    if (String(authPayload.enterpriseSystemId || "") !== String(descriptor.source?.enterpriseSystemId || "")) {
      throw new Error("Protected package source system does not match its export authorization");
    }
  }

  const encryptedSha256 = await sha256File(payloadPath);
  if (descriptor.encryptedSha256 && descriptor.encryptedSha256 !== encryptedSha256) {
    throw new Error("Protected package integrity check failed");
  }

  let dataKey: Buffer;
  try {
    dataKey = params.unwrapDataKey
      ? await params.unwrapDataKey({ descriptor, encryptedPayloadSha256: encryptedSha256 })
      : unwrapCourseTransferDataKeyFromDescriptor(descriptor);
  } catch (error: any) {
    throw new Error(
      error?.message && !String(error.message).includes("unable to authenticate data")
        ? error.message
        : "Unable to open protected course package. The transfer key does not match this system or the package was tampered with."
    );
  }
  const iv = Buffer.from(String(descriptor.iv || ""), "base64");
  const authTag = Buffer.from(String(descriptor.authTag || ""), "base64");
  const decipher = createDecipheriv("aes-256-gcm", dataKey, iv);
  decipher.setAuthTag(authTag);

  const rawZipPath = path.join(outputDir, "payload.zip");
  try {
    await pipeline(fs.createReadStream(payloadPath), decipher, fs.createWriteStream(rawZipPath));
  } catch (error) {
    throw new Error("Unable to open protected course package. Cloud PRD transfer authorization failed or the package was tampered with.");
  }

  const payloadSha256 = await sha256File(rawZipPath);
  if (descriptor.payloadSha256 && descriptor.payloadSha256 !== payloadSha256) {
    throw new Error("Protected package payload integrity check failed");
  }

  return { zipPath: rawZipPath, cleanupDir: outputDir, protectedPackage: true };
}

export function filterIncludedTables(bundle: Record<string, any[]>): CourseTransferDataBundle {
  const next: CourseTransferDataBundle = {};
  for (const table of INCLUDED_ENTITY_TABLES) {
    const value = bundle[table];
    next[table] = Array.isArray(value) ? value : [];
  }
  return next;
}

export function validateManifestOrThrow(input: unknown): CourseTransferManifest {
  const manifest = courseTransferManifestSchema.parse(input);
  const includeSet = new Set(manifest.include);
  const optionalSet = new Set(OPTIONAL_ENTITY_TABLES as readonly string[]);
  for (const table of INCLUDED_ENTITY_TABLES) {
    if (optionalSet.has(table)) continue;
    if (!includeSet.has(table)) {
      throw new Error(`Manifest include declaration missing required table: ${table}`);
    }
  }

  const major = String(manifest.packageVersion || "").split(".")[0];
  if (major !== "1") {
    throw new Error(`Unsupported packageVersion: ${manifest.packageVersion}`);
  }

  return manifest;
}

export function sanitizeZipEntryPath(entryPath: string): string {
  const raw = String(entryPath || "").replace(/\\/g, "/").trim();
  if (!raw) {
    throw new Error("Zip entry path is empty");
  }
  if (path.posix.isAbsolute(raw)) {
    throw new Error(`Absolute zip entry path is not allowed: ${entryPath}`);
  }
  const rawSegments = raw.split("/").filter(Boolean);
  if (rawSegments.includes("..")) {
    throw new Error(`Unsafe zip entry path: ${entryPath}`);
  }

  const normalized = path.posix.normalize(`/${raw}`).replace(/^\/+/, "");
  if (!normalized || normalized === ".") {
    throw new Error("Zip entry path is empty");
  }
  if (normalized.startsWith("../") || normalized.includes("/../") || normalized.includes("..")) {
    throw new Error(`Unsafe zip entry path: ${entryPath}`);
  }
  return normalized;
}

export async function extractZipSafely(params: {
  zipPath: string;
  destinationDir?: string;
}): Promise<{ outputDir: string; extractedFiles: string[] }> {
  const destinationDir = params.destinationDir
    ? path.resolve(params.destinationDir)
    : await fs.promises.mkdtemp(path.join(os.tmpdir(), "course-transfer-"));

  await fs.promises.mkdir(destinationDir, { recursive: true });

  const extractedFiles: string[] = [];
  const directory = await unzipper.Open.file(params.zipPath);

  for (const entry of directory.files as any[]) {
    const raw = String(entry.path || "");
    const safeRel = sanitizeZipEntryPath(raw);
    const targetPath = path.resolve(destinationDir, safeRel);

    if (!targetPath.startsWith(`${destinationDir}${path.sep}`) && targetPath !== destinationDir) {
      entry.autodrain();
      throw new Error(`Zip extraction boundary violation: ${raw}`);
    }

    if (entry.type === "Directory") {
      await fs.promises.mkdir(targetPath, { recursive: true });
      continue;
    }

    await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
    await new Promise<void>((resolve, reject) => {
      const out = fs.createWriteStream(targetPath, { flags: "w" });
      const input = entry.stream();
      input.pipe(out);
      out.on("finish", resolve);
      out.on("error", reject);
      input.on("error", reject);
    });
    extractedFiles.push(safeRel);
  }

  return { outputDir: destinationDir, extractedFiles };
}

export async function computeChecksumsForDirectory(rootDir: string): Promise<Record<string, string>> {
  const checksums: Record<string, string> = {};

  async function walk(currentDir: string): Promise<void> {
    const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(abs);
        continue;
      }
      const rel = path.relative(rootDir, abs).replace(/\\/g, "/");
      const contents = await fs.promises.readFile(abs);
      checksums[rel] = sha256Buffer(contents);
    }
  }

  await walk(rootDir);
  return checksums;
}

export type TransferRewriteMaps = {
  idMap: Record<string, string>;
  filePathMap: Record<string, string>;
};

export function rewritePrimitiveValue(value: any, maps: TransferRewriteMaps): any {
  if (typeof value === "string") {
    if (maps.idMap[value]) return maps.idMap[value];
    if (maps.filePathMap[value]) return maps.filePathMap[value];
  }
  return value;
}

export function deepRewriteObject<T = any>(input: T, maps: TransferRewriteMaps): T {
  if (Array.isArray(input)) {
    return input.map((item) => deepRewriteObject(item, maps)) as T;
  }
  if (input && typeof input === "object") {
    const next: Record<string, any> = {};
    for (const [key, value] of Object.entries(input as any)) {
      next[key] = deepRewriteObject(value, maps);
    }
    return next as T;
  }
  return rewritePrimitiveValue(input, maps) as T;
}

export function remapIdsForBundle(bundle: CourseTransferDataBundle): {
  idMapByTable: Record<string, Record<string, string>>;
  allIdMap: Record<string, string>;
} {
  const idMapByTable: Record<string, Record<string, string>> = {};
  const allIdMap: Record<string, string> = {};

  for (const [table, rows] of Object.entries(bundle)) {
    idMapByTable[table] = {};
    for (const row of rows) {
      const oldId = String(row.id || "").trim();
      if (!oldId) continue;
      const nextId = randomUUID();
      idMapByTable[table][oldId] = nextId;
      allIdMap[oldId] = nextId;
    }
  }

  return { idMapByTable, allIdMap };
}

export function rewriteFileReferencesInRecord<T extends Record<string, any>>(
  record: T,
  filePathMap: Record<string, string>
): T {
  return deepRewriteObject(record, { idMap: {}, filePathMap });
}

export function assertChecksum(params: {
  expected: string;
  filePath: string;
  label: string;
}): void {
  const buffer = fs.readFileSync(params.filePath);
  const actual = sha256Buffer(buffer);
  if (actual !== params.expected) {
    throw new Error(`Checksum mismatch for ${params.label}: expected=${params.expected} actual=${actual}`);
  }
}

export function validateExtractedPackageLayout(params: {
  extractedDir: string;
  manifest: CourseTransferManifest;
  enforceChecksums?: boolean;
}): void {
  const { extractedDir, manifest } = params;

  const dataDir = path.join(extractedDir, "data");
  if (!fs.existsSync(dataDir)) {
    throw new Error("Package missing data directory");
  }

  const optionalSet = new Set(OPTIONAL_ENTITY_TABLES as readonly string[]);
  for (const table of INCLUDED_ENTITY_TABLES) {
    const abs = path.join(dataDir, `${table}.json`);
    if (!fs.existsSync(abs)) {
      if (optionalSet.has(table)) continue;
      throw new Error(`Package missing required data file: data/${table}.json`);
    }
  }

  for (const file of manifest.files || []) {
    const abs = path.join(extractedDir, file.packagePath);
    if (!fs.existsSync(abs)) {
      throw new Error(`Package missing referenced binary: ${file.packagePath}`);
    }
  }

  if (params.enforceChecksums) {
    for (const [relPath, expected] of Object.entries(manifest.checksums || {})) {
      const abs = path.join(extractedDir, relPath);
      if (!fs.existsSync(abs)) {
        throw new Error(`Package integrity check failed; missing file: ${relPath}`);
      }
      assertChecksum({ expected, filePath: abs, label: relPath });
    }
  }
}
