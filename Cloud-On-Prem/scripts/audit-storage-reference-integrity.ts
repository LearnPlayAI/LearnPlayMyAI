import fs from "fs";
import path from "path";
import pg from "pg";

const { Client } = pg;

const dbUrlArg = process.argv.find((a) => a.startsWith("--db-url="));
const dbUrl = dbUrlArg ? dbUrlArg.split("=").slice(1).join("=") : process.env.DATABASE_URL || "";
const uploadDirArg = process.argv.find((a) => a.startsWith("--upload-dir="));
const deploymentMode = String(process.env.DEPLOYMENT_MODE || "").trim().toLowerCase();
const defaultUploadDir =
  deploymentMode === "cloud"
    ? "/opt/learnplay/cloud/uploads"
    : deploymentMode === "onprem"
      ? "/opt/learnplay/onprem/uploads"
      : "uploads";
const uploadDir = path.resolve(uploadDirArg ? uploadDirArg.split("=").slice(1).join("=") : process.env.UPLOAD_DIR || defaultUploadDir);
const strict = process.argv.includes("--strict");

if (!dbUrl) {
  throw new Error("DATABASE_URL not set. Pass --db-url=<url>.");
}

type RefRow = { source: string; key: string };

function toAbsolute(uploadRoot: string, key: string): string {
  const rel = String(key || "").replace(/^\/+/, "");
  return path.join(uploadRoot, rel);
}

async function queryReferences(client: any): Promise<RefRow[]> {
  const sql = `
    with refs as (
      select 'lessons.storageKey' as source, "storageKey" as key from "lessons" where "storageKey" is not null
      union all select 'lessons.sourceDocumentPath', "sourceDocumentPath" from "lessons" where "sourceDocumentPath" is not null
      union all select 'lessons.transcriptKey', "transcriptKey" from "lessons" where "transcriptKey" is not null
      union all select 'lessons.videoStorageKey', "videoStorageKey" from "lessons" where "videoStorageKey" is not null
      union all select 'lessonVersions.storageKey', "storageKey" from "lessonVersions" where "storageKey" is not null
      union all select 'lessonPresentationVersions.storageKey', "storageKey" from "lessonPresentationVersions" where "storageKey" is not null
      union all select 'courses.thumbnailUrl', "thumbnailUrl" from "courses" where "thumbnailUrl" is not null
      union all select 'courseVersions.thumbnailUrl', "thumbnailUrl" from "courseVersions" where "thumbnailUrl" is not null
      union all select 'certificates.pdfStoragePath', "pdfStoragePath" from "certificates" where "pdfStoragePath" is not null
    )
    select distinct source, key
    from refs
    where key like '/private/%' or key like '/public/%'
    order by source, key
  `;
  const rs = await client.query(sql);
  return rs.rows as RefRow[];
}

async function main() {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    const refs = await queryReferences(client);
    const missing: Array<{ source: string; key: string; abs: string }> = [];
    const bySource = new Map<string, { total: number; missing: number }>();

    for (const row of refs) {
      const abs = toAbsolute(uploadDir, row.key);
      const exists = fs.existsSync(abs);
      const source = row.source;
      const current = bySource.get(source) || { total: 0, missing: 0 };
      current.total += 1;
      if (!exists) {
        current.missing += 1;
        missing.push({ source, key: row.key, abs });
      }
      bySource.set(source, current);
    }

    const summary = {
      db: dbUrl.replace(/:[^:@/]+@/, ":***@"),
      uploadDir,
      refsTotal: refs.length,
      missingTotal: missing.length,
      completion: missing.length === 0,
      bySource: Object.fromEntries(
        Array.from(bySource.entries()).sort((a, b) => a[0].localeCompare(b[0])),
      ),
      missingExamples: missing.slice(0, 50),
    };

    console.log(JSON.stringify(summary, null, 2));
    if (strict && missing.length > 0) {
      process.exit(1);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("[audit-storage-reference-integrity] failed", error);
  process.exit(1);
});
