import fs from "fs";
import path from "path";

function parseEnvLine(line: string): { key: string; value: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) return null;
  const eq = trimmed.indexOf("=");
  if (eq <= 0) return null;

  const key = trimmed.slice(0, eq).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null;

  let value = trimmed.slice(eq + 1).trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  }
  // Support escaped newlines used in PEM-like values
  value = value.replace(/\\n/g, "\n");
  return { key, value };
}

function loadEnvFromWorkspace(): void {
  const configuredEnvPath = (process.env.LEARNPLAY_ENV_FILE || "").trim();
  const envPath = configuredEnvPath
    ? path.resolve(process.cwd(), configuredEnvPath)
    : path.resolve(process.cwd(), ".env");

  if (!fs.existsSync(envPath)) {
    if (configuredEnvPath) {
      throw new Error(`Configured env file does not exist: ${envPath}`);
    }
    return;
  }

  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const parsed = parseEnvLine(line);
    if (!parsed) continue;
    process.env[parsed.key] = parsed.value;
  }
  process.env.LEARNPLAY_ACTIVE_ENV_FILE = envPath;
}

function detectSystemTimezone(): string {
  const candidates = [
    process.env.LEARNPLAY_TIMEZONE,
    process.env.TZ,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  ];
  for (const candidate of candidates) {
    const value = (candidate || "").trim();
    if (value) return value;
  }
  return "Etc/UTC";
}

loadEnvFromWorkspace();

// Keep Node runtime date/time behavior aligned with deployment timezone.
process.env.TZ = detectSystemTimezone();
