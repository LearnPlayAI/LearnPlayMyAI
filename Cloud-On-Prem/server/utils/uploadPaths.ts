import path from "path";

function resolveUploadDir(rawValue: string): string {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return path.resolve(process.cwd(), "uploads");
  }
  return path.isAbsolute(trimmed) ? trimmed : path.resolve(process.cwd(), trimmed);
}

export function getUploadDir(): string {
  return resolveUploadDir(process.env.UPLOAD_DIR || "uploads");
}

export function getPublicUploadDir(): string {
  return path.join(getUploadDir(), "public");
}

export function getPrivateUploadDir(): string {
  return path.join(getUploadDir(), "private");
}

/**
 * Resolve storage paths (absolute or relative) into the current upload root.
 * Handles legacy absolute paths from previous deployments, e.g.:
 * - /opt/uploads/private/...
 * - /some/old/path/uploads/public/...
 * - /private/... or private/...
 */
export function resolveStoragePath(storagePath: string): string {
  if (!storagePath) {
    return storagePath;
  }

  const uploadDir = getUploadDir();
  const normalizedUploadDir = path.resolve(uploadDir);
  const normalizedInput = path.resolve(storagePath);

  // Already in current upload root
  if (
    normalizedInput === normalizedUploadDir ||
    normalizedInput.startsWith(`${normalizedUploadDir}${path.sep}`)
  ) {
    return normalizedInput;
  }

  const normalizedForMatch = storagePath.replace(/\\/g, "/");

  // Prefer preserving path under /private or /public, regardless of old root
  const privateIndex = normalizedForMatch.lastIndexOf("/private/");
  if (privateIndex >= 0) {
    const suffix = normalizedForMatch.slice(privateIndex + 1); // private/...
    return path.join(uploadDir, suffix);
  }

  const publicIndex = normalizedForMatch.lastIndexOf("/public/");
  if (publicIndex >= 0) {
    const suffix = normalizedForMatch.slice(publicIndex + 1); // public/...
    return path.join(uploadDir, suffix);
  }

  // Relative paths with or without leading slash
  const trimmed = normalizedForMatch.replace(/^\/+/, "");
  if (trimmed.startsWith("private/") || trimmed.startsWith("public/")) {
    return path.join(uploadDir, trimmed);
  }

  return path.isAbsolute(storagePath)
    ? storagePath
    : path.join(uploadDir, storagePath);
}
