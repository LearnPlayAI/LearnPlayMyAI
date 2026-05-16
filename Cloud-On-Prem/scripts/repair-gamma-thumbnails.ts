#!/usr/bin/env tsx
import fs from "fs";
import path from "path";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { gammaImageStyles } from "../shared/schema";
import { eq } from "drizzle-orm";

function loadEnv(): void {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx <= 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    value = value.replace(/\\n/g, "\n");
    process.env[key] = value;
  }
}

function resolveUploadDir(): string {
  const configured = process.env.UPLOAD_DIR || "./uploads";
  if (path.isAbsolute(configured)) return configured;
  return path.resolve(process.cwd(), configured);
}

function firstExistingStyleFile(uploadDir: string, styleKey: string): string | null {
  const exts = [".jpeg", ".jpg", ".png", ".webp"];
  for (const ext of exts) {
    const rel = `gamma/image-styles/${styleKey}${ext}`;
    const abs = path.join(uploadDir, "public", rel);
    if (fs.existsSync(abs)) return rel;
  }
  return null;
}

async function main() {
  loadEnv();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not configured");
    process.exit(1);
  }

  const uploadDir = resolveUploadDir();
  const db = drizzle(neon(databaseUrl));
  const styles = await db.select().from(gammaImageStyles);

  let updated = 0;
  let skipped = 0;
  let missing = 0;

  for (const style of styles) {
    const rel = firstExistingStyleFile(uploadDir, style.styleKey);
    if (!rel) {
      missing++;
      continue;
    }
    const publicUrl = `/api/public-objects/${rel}`;
    if (style.thumbnailUrl && style.thumbnailUrl.trim() !== "") {
      skipped++;
      continue;
    }
    await db
      .update(gammaImageStyles)
      .set({
        thumbnailUrl: publicUrl,
        updatedAt: new Date(),
      })
      .where(eq(gammaImageStyles.id, style.id));
    updated++;
  }

  console.log(
    `Gamma image-style thumbnails repaired: updated=${updated}, skipped=${skipped}, missing_files=${missing}, upload_dir=${uploadDir}`,
  );
}

main().catch((error) => {
  console.error("Failed to repair gamma thumbnails:", error);
  process.exit(1);
});

