import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

type RuntimeProduct = "cloud" | "onprem";

interface RuntimeIdentity {
  product: RuntimeProduct;
  runtimeRoot?: string;
  systemType?: string;
}

function readRuntimeIdentityFile(filePath: string): RuntimeIdentity | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as Partial<RuntimeIdentity>;
    if (parsed.product !== "cloud" && parsed.product !== "onprem") {
      throw new Error(`Invalid runtime marker product in ${filePath}`);
    }
    return parsed as RuntimeIdentity;
  } catch (error: any) {
    throw new Error(`Failed reading runtime marker ${filePath}: ${error?.message || error}`);
  }
}

function locateRuntimeIdentity(): RuntimeIdentity | null {
  let currentDir = process.cwd();
  try {
    currentDir = path.dirname(fileURLToPath(import.meta.url));
  } catch {
    // Keep cwd fallback.
  }

  const cwd = process.cwd();
  const inferredRuntimeRoot = cwd.includes("/opt/learnplay/onprem")
    ? "/opt/learnplay/onprem"
    : cwd.includes("/opt/learnplay/cloud")
      ? "/opt/learnplay/cloud"
      : null;

  const candidates = [
    process.env.RUNTIME_IDENTITY_FILE,
    path.join(process.cwd(), ".runtime-identity.json"),
    path.resolve(currentDir, "../.runtime-identity.json"),
    inferredRuntimeRoot ? path.join(inferredRuntimeRoot, ".runtime-identity.json") : null,
    "/opt/learnplay/.runtime-identity.json",
    "/opt/learnplay/cloud/.runtime-identity.json",
    "/opt/learnplay/onprem/.runtime-identity.json",
  ].filter((v): v is string => Boolean(v));

  for (const candidate of candidates) {
    const identity = readRuntimeIdentityFile(candidate);
    if (identity) {
      return identity;
    }
  }
  return null;
}

function enforceOnprem(): void {
  process.env.PLATFORM_ENV = "onprem";
  process.env.DEPLOYMENT_MODE = "onprem";
  process.env.ONPREM_MODE = "true";
  process.env.ONPREM_OWN_API_KEYS = "true";
  // On-prem license enforcement is mandatory and cannot be disabled.
  process.env.ONPREM_LICENSE_ENFORCEMENT = "true";
  if (process.env.PAYMENT_GATEWAY_ENABLED === undefined) {
    process.env.PAYMENT_GATEWAY_ENABLED = "false";
  }
}

function enforceCloud(): void {
  process.env.PLATFORM_ENV = "cloud";
  process.env.DEPLOYMENT_MODE = "cloud";
  process.env.ONPREM_MODE = "false";
  process.env.ONPREM_OWN_API_KEYS = "false";
  if (process.env.PAYMENT_GATEWAY_ENABLED === undefined) {
    process.env.PAYMENT_GATEWAY_ENABLED = "true";
  }
}

export function enforceRuntimeIdentityFailClosed(): void {
  const identity = locateRuntimeIdentity();
  if (!identity) {
    return;
  }

  const envMode = (process.env.DEPLOYMENT_MODE || "").trim().toLowerCase();
  if (identity.product === "onprem") {
    if (envMode === "cloud" || process.env.ONPREM_MODE === "false") {
      console.warn("⚠️ Runtime marker is onprem; ignoring cloud-mode environment overrides.");
    }
    enforceOnprem();
    if (identity.systemType && !process.env.SYSTEM_TYPE) {
      process.env.SYSTEM_TYPE = identity.systemType;
    }
    return;
  }

  if (envMode === "onprem" || process.env.ONPREM_MODE === "true") {
    console.warn("⚠️ Runtime marker is cloud; ignoring onprem-mode environment overrides.");
  }
  enforceCloud();
}
