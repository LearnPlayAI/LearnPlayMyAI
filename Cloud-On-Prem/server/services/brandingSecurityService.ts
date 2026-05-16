import path from "path";
import { isIP } from "node:net";
import { domainToASCII } from "node:url";
import { getBaseUrl } from "../config/base-url";
import { getUploadDir } from "../utils/uploadPaths";

const BRANDING_FOLDER_PATTERN = /^(platform|org-[a-zA-Z0-9-]+)$/;
const BRANDING_FILE_PATTERN = /^(logo|favicon)-[0-9]{10,}\.png$/;
const BRANDING_PUBLIC_PREFIX = "/api/public/branding/";
const PUBLIC_OBJECTS_PREFIX = "/api/public-objects/";
const API_FILES_PREFIX = "/api/files/";

export function resolveSafeBrandingAssetPath(folder: string, filename: string): string | null {
  const safeFolder = String(folder || "").trim();
  const safeFilename = String(filename || "").trim();

  if (!BRANDING_FOLDER_PATTERN.test(safeFolder)) return null;
  if (!BRANDING_FILE_PATTERN.test(safeFilename)) return null;

  return `branding/${safeFolder}/${safeFilename}`;
}

export function shouldMarkThemeSyncRun(success: boolean): boolean {
  return success;
}

export function resolveBrandingObjectPathFromUrl(assetUrl: string | null | undefined): string | null {
  if (!assetUrl) return null;
  const raw = String(assetUrl).trim();
  if (!raw) return null;

  let pathname = raw;
  try {
    pathname = new URL(raw).pathname;
  } catch {
    // Keep raw value for relative URL handling.
  }

  if (pathname.startsWith(PUBLIC_OBJECTS_PREFIX)) {
    const encodedPath = pathname.slice(PUBLIC_OBJECTS_PREFIX.length);
    if (!encodedPath) return null;
    try {
      return decodeURIComponent(encodedPath).replace(/^\/+/, "");
    } catch {
      return encodedPath.replace(/^\/+/, "");
    }
  }

  if (pathname.startsWith(BRANDING_PUBLIC_PREFIX)) {
    return pathname.replace("/api/public/", "").replace(/^\/+/, "");
  }

  return null;
}

export function normalizeOrganizationDomainInput(domainInput: string): { normalized: string | null; error?: string } {
  const raw = String(domainInput || "").trim();
  if (!raw) {
    return { normalized: null, error: "Domain is required" };
  }

  const lowered = raw.toLowerCase().replace(/\.$/, "");
  if (!lowered) {
    return { normalized: null, error: "Domain is required" };
  }
  if (lowered.includes("://")) {
    return { normalized: null, error: "Domain must not include protocol (http/https)" };
  }
  if (lowered.includes("/") || lowered.includes("?") || lowered.includes("#")) {
    return { normalized: null, error: "Domain must not include path, query, or fragment" };
  }
  if (lowered.includes(":")) {
    return { normalized: null, error: "Domain must not include a port" };
  }
  if (lowered.startsWith("*.")) {
    return { normalized: null, error: "Wildcard domains are not supported" };
  }

  const ascii = domainToASCII(lowered);
  if (!ascii) {
    return { normalized: null, error: "Invalid domain format" };
  }
  if (ascii.length > 253) {
    return { normalized: null, error: "Domain is too long" };
  }
  if (isIP(ascii) !== 0) {
    return { normalized: null, error: "IP addresses are not allowed for custom domains" };
  }

  const labels = ascii.split(".");
  if (labels.length < 2) {
    return { normalized: null, error: "Domain must be a valid FQDN (for example: learn.example.com)" };
  }
  for (const label of labels) {
    if (!label) {
      return { normalized: null, error: "Invalid domain format" };
    }
    if (label.length > 63) {
      return { normalized: null, error: "Domain label is too long" };
    }
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) {
      return { normalized: null, error: "Domain contains invalid characters" };
    }
  }

  return { normalized: ascii.toLowerCase() };
}

export function resolveCertificateLogoFetchUrl(logoUrl: string | null | undefined): string | null {
  if (!logoUrl) return null;
  const trimmed = String(logoUrl).trim();
  if (!trimmed) return null;

  let baseOrigin: string | null = null;
  try {
    baseOrigin = new URL(getBaseUrl()).origin;
  } catch {
    // Fail closed when base URL configuration is unavailable.
    return null;
  }

  if (trimmed.startsWith(BRANDING_PUBLIC_PREFIX)) {
    return `${baseOrigin}${trimmed}`;
  }
  if (trimmed.startsWith(PUBLIC_OBJECTS_PREFIX)) {
    return `${baseOrigin}${trimmed}`;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.origin !== baseOrigin) return null;
    if (!parsed.pathname.startsWith(BRANDING_PUBLIC_PREFIX) && !parsed.pathname.startsWith(PUBLIC_OBJECTS_PREFIX)) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function resolveSafeApiFilesPath(apiFilesUrl: string): string | null {
  if (!apiFilesUrl.startsWith(API_FILES_PREFIX)) return null;
  const encoded = apiFilesUrl.replace(API_FILES_PREFIX, "");
  if (!encoded) return null;

  try {
    const relativePath = Buffer.from(encoded, "base64url").toString("utf-8");
    if (!relativePath || relativePath.includes("\0")) return null;
    const uploadRoot = path.resolve(getUploadDir());
    const candidate = path.resolve(uploadRoot, relativePath);
    if (!candidate.startsWith(`${uploadRoot}${path.sep}`) && candidate !== uploadRoot) {
      return null;
    }
    return candidate;
  } catch {
    return null;
  }
}
