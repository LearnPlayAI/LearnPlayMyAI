import fs from "fs";
import path from "path";

function readEnvValue(raw: string, key: string): string | null {
  const line = raw
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith(`${key}=`));
  if (!line) return null;
  const value = line.slice(line.indexOf("=") + 1).trim();
  if (!value) return null;
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

if (!process.env.DATABASE_URL) {
  try {
    const envPath = path.join(process.cwd(), ".env");
    if (fs.existsSync(envPath)) {
      const rawEnv = fs.readFileSync(envPath, "utf8");
      const databaseUrl = readEnvValue(rawEnv, "DATABASE_URL");
      if (databaseUrl) {
        process.env.DATABASE_URL = databaseUrl;
      }
    }
  } catch {
    // Best-effort setup only. Individual tests may still provide a fallback.
  }
}

