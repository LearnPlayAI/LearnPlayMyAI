import pg from "pg";

const { Client } = pg;
const dbUrlArg = process.argv.find((a) => a.startsWith("--db-url="));
const dbUrl = dbUrlArg ? dbUrlArg.split("=").slice(1).join("=") : process.env.DATABASE_URL || "";
const maxFilenameArg = process.argv.find((a) => a.startsWith("--max-filename="));
const maxFilename = Number(maxFilenameArg ? maxFilenameArg.split("=")[1] : 64);
const maxPathArg = process.argv.find((a) => a.startsWith("--max-path="));
const maxPath = Number(maxPathArg ? maxPathArg.split("=")[1] : 180);

if (!dbUrl) {
  throw new Error("DATABASE_URL not set. Pass --db-url=<url>.");
}

function norm(value: string): string {
  return String(value || "").replace(/\\/g, "/");
}

function basenameLen(value: string): number {
  const n = norm(value).trim();
  if (!n) return 0;
  const parts = n.split("/").filter(Boolean);
  return (parts[parts.length - 1] || "").length;
}

function deepCollectStrings(input: any, out: string[]) {
  if (Array.isArray(input)) {
    for (const item of input) deepCollectStrings(item, out);
    return;
  }
  if (input && typeof input === "object") {
    for (const value of Object.values(input)) deepCollectStrings(value, out);
    return;
  }
  if (typeof input === "string") out.push(input);
}

function looksLikePath(value: string): boolean {
  const v = norm(value).trim().toLowerCase();
  if (!v) return false;
  return (
    v.includes("/private/") ||
    v.includes("/public/") ||
    v.includes("/uploads/") ||
    v.startsWith("private/") ||
    v.startsWith("public/") ||
    v.endsWith(".pptx") ||
    v.endsWith(".docx") ||
    v.endsWith(".pdf") ||
    v.endsWith(".mp4") ||
    v.endsWith(".mp3") ||
    v.endsWith(".m3u8") ||
    v.endsWith(".m4s") ||
    v.endsWith(".json")
  );
}

async function main() {
  const client = new Client({ connectionString: dbUrl });
  await client.connect();
  try {
    const columns = await client.query(`
      select table_name, column_name, data_type
      from information_schema.columns
      where table_schema='public'
        and data_type in ('text','character varying','json','jsonb')
      order by table_name, ordinal_position
    `);

    let pathLikeCount = 0;
    let longPathCount = 0;
    let longFilenameCount = 0;
    let maxObservedPath = 0;
    let maxObservedFilename = 0;
    const examples: Array<{ table: string; column: string; value: string; pathLen: number; nameLen: number }> = [];

    for (const col of columns.rows as Array<{ table_name: string; column_name: string; data_type: string }>) {
      const table = col.table_name;
      const column = col.column_name;
      const rs = await client.query(`select "${column}" as val from "${table}" where "${column}" is not null`);
      for (const row of rs.rows as Array<{ val: any }>) {
        const values: string[] = [];
        if (col.data_type === "json" || col.data_type === "jsonb") {
          deepCollectStrings(row.val, values);
        } else {
          values.push(String(row.val || ""));
        }
        for (const raw of values) {
          if (!looksLikePath(raw)) continue;
          const normalized = norm(raw);
          const pathLen = normalized.length;
          const nameLen = basenameLen(normalized);
          pathLikeCount += 1;
          maxObservedPath = Math.max(maxObservedPath, pathLen);
          maxObservedFilename = Math.max(maxObservedFilename, nameLen);
          const isLongPath = pathLen > maxPath;
          const isLongName = nameLen > maxFilename;
          if (isLongPath) longPathCount += 1;
          if (isLongName) longFilenameCount += 1;
          if ((isLongPath || isLongName) && examples.length < 30) {
            examples.push({ table, column, value: normalized.slice(0, 220), pathLen, nameLen });
          }
        }
      }
    }

    console.log(JSON.stringify({
      db: dbUrl.replace(/:[^:@/]+@/, ":***@"),
      thresholds: { maxFilename, maxPath },
      stats: {
        pathLikeCount,
        longPathCount,
        longFilenameCount,
        maxObservedPath,
        maxObservedFilename,
      },
      completion: longPathCount === 0 && longFilenameCount === 0,
      examples,
    }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("[auditStoragePatterns] failed", error);
  process.exit(1);
});

