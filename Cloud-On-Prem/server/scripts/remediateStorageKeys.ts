import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import pg from "pg";
const { Client } = pg;

type RunMode = "dry-run" | "live";

const args = new Set(process.argv.slice(2));
const mode: RunMode = args.has("--live") ? "live" : "dry-run";
const dbUrlArg = process.argv.find((a) => a.startsWith("--db-url="));
const dbUrl = dbUrlArg ? dbUrlArg.split("=").slice(1).join("=") : process.env.DATABASE_URL || "";
const uploadDirArg = process.argv.find((a) => a.startsWith("--upload-dir="));
const uploadDir = path.resolve(uploadDirArg ? uploadDirArg.split("=").slice(1).join("=") : process.env.UPLOAD_DIR || "uploads");
const maxFilenameArg = process.argv.find((a) => a.startsWith("--max-filename="));
const maxFilename = Number(maxFilenameArg ? maxFilenameArg.split("=")[1] : 64);
const maxPathArg = process.argv.find((a) => a.startsWith("--max-path="));
const maxPath = Number(maxPathArg ? maxPathArg.split("=")[1] : 180);
const mapInArg = process.argv.find((a) => a.startsWith("--map-in="));
const mapInPath = mapInArg ? path.resolve(mapInArg.split("=").slice(1).join("=")) : "";
const mapOutArg = process.argv.find((a) => a.startsWith("--map-out="));
const mapOutPath = mapOutArg ? path.resolve(mapOutArg.split("=").slice(1).join("=")) : "";
const skipDb = args.has("--skip-db");
const skipFiles = args.has("--skip-files");

if (!skipDb && !dbUrl) {
  throw new Error("DATABASE_URL not set. Pass --db-url=<url> or export DATABASE_URL.");
}

function now() {
  return new Date().toISOString();
}

function sha12(input: string): string {
  return createHash("sha1").update(input).digest("hex").slice(0, 12);
}

function normSlashes(input: string): string {
  return String(input || "").replace(/\\/g, "/");
}

function sanitizeSegment(input: string, fallback: string): string {
  const clean = String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 16);
  return clean || fallback;
}

function inferDomainFromRel(rel: string): string {
  const p = normSlashes(rel).replace(/^\/+/, "");
  const parts = p.split("/").filter(Boolean);
  const scope = parts[0] === "public" ? "pub" : "prv";
  const candidate = (parts[1] || "misc").toLowerCase();
  const map: Record<string, string> = {
    lessons: "lsn",
    courses: "crs",
    collection: "col",
    certificates: "crt",
    gamma: "gma",
    podcasts: "pod",
    "course-transfer-imports": "cti",
    "course-transfer-fixture": "ctf",
    "course-transfer-uploads": "ctu",
    branding: "brd",
    avatars: "ava",
    themes: "thm",
  };
  return `${scope}-${map[candidate] || sanitizeSegment(candidate, "misc")}`;
}

function canonicalFromAny(value: string, uploadRoot: string): string | null {
  const raw = normSlashes(String(value || "").trim());
  if (!raw) return null;
  const uploadNorm = normSlashes(path.resolve(uploadRoot));
  const absRaw = path.isAbsolute(raw) ? normSlashes(path.resolve(raw)) : raw;

  if (absRaw.startsWith(`${uploadNorm}/`)) {
    const rel = absRaw.slice(uploadNorm.length + 1);
    return `/${rel.replace(/^\/+/, "")}`;
  }

  const idxPriv = raw.lastIndexOf("/uploads/private/");
  if (idxPriv >= 0) return `/private/${raw.slice(idxPriv + "/uploads/private/".length).replace(/^\/+/, "")}`;
  const idxPub = raw.lastIndexOf("/uploads/public/");
  if (idxPub >= 0) return `/public/${raw.slice(idxPub + "/uploads/public/".length).replace(/^\/+/, "")}`;
  const idxUploads = raw.lastIndexOf("/uploads/");
  if (idxUploads >= 0) return `/${raw.slice(idxUploads + "/uploads/".length).replace(/^\/+/, "")}`;

  if (raw.startsWith("/private/") || raw.startsWith("/public/")) return raw;
  if (raw.startsWith("/uploads/")) return `/${raw.slice("/uploads/".length).replace(/^\/+/, "")}`;
  if (raw.startsWith("private/") || raw.startsWith("public/")) return `/${raw}`;
  return null;
}

function canonicalShortFromLegacyCanonical(input: string): string | null {
  const canonical = normSlashes(String(input || "").trim());
  if (!canonical) return null;
  const withoutLeading = canonical.replace(/^\/+/, "");
  const parts = withoutLeading.split("/").filter(Boolean);
  if (!parts.length) return null;
  const hasScope = parts[0] === "private" || parts[0] === "public";
  const rel = hasScope ? withoutLeading : `private/${withoutLeading}`;
  if (rel.includes("/k/")) return `/${rel}`;
  const ext = path.extname(rel).toLowerCase();
  const scope = rel.startsWith("public/") ? "public" : "private";
  const domain = inferDomainFromRel(rel);
  const token = sha12(rel);
  const leaf = `${domain}-${token}${ext || ""}`;
  return `/${scope}/k/${domain}/${token.slice(0, 2)}/${token.slice(2, 4)}/${leaf}`;
}

async function listFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string) {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(abs);
      } else {
        out.push(abs);
      }
    }
  }
  await walk(root);
  return out;
}

type FileMap = {
  oldAbs: string;
  oldRel: string;
  oldCanonical: string;
  newAbs: string;
  newRel: string;
  newCanonical: string;
  moved: boolean;
  reason?: string;
};

async function buildFilePlan(uploadRoot: string): Promise<FileMap[]> {
  const files = await listFiles(uploadRoot);
  const planned: FileMap[] = [];
  const canonicalRelPattern = /^(private|public)\/k\/[a-z0-9._-]+\/[a-f0-9]{2}\/[a-f0-9]{2}\/[a-z0-9._-]+(?:\.[a-z0-9]+)?$/i;
  for (const abs of files) {
    const rel = normSlashes(path.relative(uploadRoot, abs)).replace(/^\/+/, "");
    if (!rel) continue;
    const ext = path.extname(rel).toLowerCase();
    const canonical = `/${rel}`;
    let newRel = rel;
    if (!canonicalRelPattern.test(rel)) {
      const scope = rel.startsWith("public/") ? "public" : "private";
      const domain = inferDomainFromRel(rel);
      const token = sha12(rel);
      const leaf = `${domain}-${token}${ext || ""}`;
      newRel = `${scope}/k/${domain}/${token.slice(0, 2)}/${token.slice(2, 4)}/${leaf}`;
    }
    const newAbs = path.join(uploadRoot, newRel);
    planned.push({
      oldAbs: abs,
      oldRel: rel,
      oldCanonical: canonical,
      newAbs,
      newRel,
      newCanonical: `/${newRel}`,
      moved: false,
    });
  }
  return planned;
}

async function executeFileMoves(plan: FileMap[]) {
  const byNewAbs = new Set<string>();
  for (const item of plan) {
    if (byNewAbs.has(item.newAbs)) {
      item.reason = "collision_new_path";
      continue;
    }
    byNewAbs.add(item.newAbs);
    if (item.oldAbs === item.newAbs) {
      item.moved = true;
      continue;
    }
    if (mode === "dry-run") {
      item.moved = true;
      continue;
    }
    try {
      await fs.promises.mkdir(path.dirname(item.newAbs), { recursive: true });
      await fs.promises.copyFile(item.oldAbs, item.newAbs);
      const [oldStat, newStat] = await Promise.all([fs.promises.stat(item.oldAbs), fs.promises.stat(item.newAbs)]);
      if (oldStat.size !== newStat.size) {
        item.reason = "size_mismatch_after_copy";
        continue;
      }
      await fs.promises.unlink(item.oldAbs);
      item.moved = true;
    } catch (error: any) {
      item.reason = String(error?.message || error || "move_failed");
    }
  }
}

type RewriteSummary = {
  scannedRows: number;
  updatedRows: number;
  updatedCells: number;
};

function deepRewrite(value: any, keyMap: Map<string, string>, uploadRoot: string): { value: any; changed: boolean; changes: number } {
  let changed = false;
  let changes = 0;
  function rewriteNode(node: any): any {
    if (Array.isArray(node)) return node.map(rewriteNode);
    if (node && typeof node === "object") {
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(node)) out[k] = rewriteNode(v);
      return out;
    }
    if (typeof node === "string") {
      const canonical = canonicalFromAny(node, uploadRoot);
      if (canonical && keyMap.has(canonical)) {
        changed = true;
        changes += 1;
        return keyMap.get(canonical);
      }
      return node;
    }
    return node;
  }
  const next = rewriteNode(value);
  return { value: next, changed, changes };
}

async function rewriteDatabase(client: any, keyMap: Map<string, string>, uploadRoot: string): Promise<RewriteSummary> {
  const summary: RewriteSummary = { scannedRows: 0, updatedRows: 0, updatedCells: 0 };
  const columns = await client.query(
    `
      select table_name, column_name, data_type
      from information_schema.columns
      where table_schema='public'
        and data_type in ('text','character varying','json','jsonb')
      order by table_name, ordinal_position
    `
  );

  for (const row of columns.rows as Array<{ table_name: string; column_name: string; data_type: string }>) {
    const table = row.table_name;
    const column = row.column_name;
    const type = row.data_type;
    const selectSql = `select ctid::text as ctid, "${column}" as val from "${table}" where "${column}" is not null`;
    const rs = await client.query(selectSql);
    for (const r of rs.rows as Array<{ ctid: string; val: any }>) {
      summary.scannedRows += 1;
      if (type === "text" || type === "character varying") {
        const raw = String(r.val || "");
        const canonical = canonicalFromAny(raw, uploadRoot);
        if (canonical) {
          const next = keyMap.get(canonical) || canonicalShortFromLegacyCanonical(canonical);
          if (!next || next === canonical) {
            continue;
          }
          if (mode === "live") {
            await client.query(`update "${table}" set "${column}"=$1 where ctid=$2::tid`, [next, r.ctid]);
          }
          summary.updatedRows += 1;
          summary.updatedCells += 1;
        }
        continue;
      }
      // json/jsonb
      const parsed = r.val;
      const rew = deepRewrite(parsed, keyMap, uploadRoot);
      if (!rew.changed) {
        const rewriteWithFallback = (node: any): { value: any; changed: boolean; changes: number } => {
          let changed = false;
          let changes = 0;
          const walk = (value: any): any => {
            if (Array.isArray(value)) return value.map(walk);
            if (value && typeof value === "object") {
              const out: Record<string, any> = {};
              for (const [k, v] of Object.entries(value)) out[k] = walk(v);
              return out;
            }
            if (typeof value !== "string") return value;
            const canonical = canonicalFromAny(value, uploadRoot);
            if (!canonical) return value;
            const next = keyMap.get(canonical) || canonicalShortFromLegacyCanonical(canonical);
            if (!next || next === canonical) return value;
            changed = true;
            changes += 1;
            return next;
          };
          const next = walk(node);
          return { value: next, changed, changes };
        };
        const fallback = rewriteWithFallback(parsed);
        if (fallback.changed) {
          if (mode === "live") {
            await client.query(`update "${table}" set "${column}"=$1::jsonb where ctid=$2::tid`, [JSON.stringify(fallback.value), r.ctid]);
          }
          summary.updatedRows += 1;
          summary.updatedCells += fallback.changes;
        }
        continue;
      }
      if (rew.changed) {
        if (mode === "live") {
          await client.query(`update "${table}" set "${column}"=$1::jsonb where ctid=$2::tid`, [JSON.stringify(rew.value), r.ctid]);
        }
        summary.updatedRows += 1;
        summary.updatedCells += rew.changes;
      }
    }
  }
  return summary;
}

async function detectLongPatterns(uploadRoot: string, maxNameLen: number, maxFullPathLen: number) {
  const files = await listFiles(uploadRoot);
  let longFilenameCount = 0;
  let longPathCount = 0;
  let maxSeenFilename = 0;
  let maxSeenPath = 0;
  for (const abs of files) {
    const rel = normSlashes(path.relative(uploadRoot, abs));
    const base = path.basename(rel);
    const relLen = rel.length;
    const baseLen = base.length;
    maxSeenFilename = Math.max(maxSeenFilename, baseLen);
    maxSeenPath = Math.max(maxSeenPath, relLen);
    if (baseLen > maxNameLen) longFilenameCount += 1;
    if (relLen > maxFullPathLen) longPathCount += 1;
  }
  return {
    totalFiles: files.length,
    longFilenameCount,
    longPathCount,
    maxSeenFilename,
    maxSeenPath,
  };
}

async function main() {
  const start = Date.now();
  console.log(`[remediateStorageKeys] ${now()} starting mode=${mode} uploadDir=${uploadDir} skipFiles=${skipFiles} skipDb=${skipDb}`);
  await fs.promises.mkdir(uploadDir, { recursive: true });

  const before = await detectLongPatterns(uploadDir, maxFilename, maxPath);
  const plan = skipFiles ? [] : await buildFilePlan(uploadDir);
  if (!skipFiles) {
    await executeFileMoves(plan);
  }

  const successful = plan.filter((p) => p.moved && !p.reason);
  const failed = plan.filter((p) => !!p.reason);
  const keyMap = new Map<string, string>();
  for (const item of successful) {
    keyMap.set(item.oldCanonical, item.newCanonical);
    keyMap.set(item.oldAbs, item.newCanonical);
    keyMap.set(item.oldRel.startsWith("/") ? item.oldRel : `/${item.oldRel}`, item.newCanonical);
    keyMap.set(item.oldRel, item.newCanonical);
  }

  if (mapInPath) {
    const parsed = JSON.parse(await fs.promises.readFile(mapInPath, "utf-8")) as Array<{ old: string; next: string }>;
    for (const row of parsed) {
      if (row?.old && row?.next) keyMap.set(String(row.old), String(row.next));
    }
  }

  if (mapOutPath) {
    const serialized = Array.from(keyMap.entries()).map(([old, next]) => ({ old, next }));
    await fs.promises.mkdir(path.dirname(mapOutPath), { recursive: true });
    await fs.promises.writeFile(mapOutPath, JSON.stringify(serialized, null, 2), "utf-8");
  }

  let dbSummary: RewriteSummary = { scannedRows: 0, updatedRows: 0, updatedCells: 0 };
  if (!skipDb) {
    const client = new Client({ connectionString: dbUrl });
    await client.connect();
    try {
      dbSummary = await rewriteDatabase(client, keyMap, uploadDir);
    } finally {
      await client.end();
    }
  }

  const after = await detectLongPatterns(uploadDir, maxFilename, maxPath);
  const report = {
    mode,
    db: skipDb ? "skipped" : dbUrl.replace(/:[^:@/]+@/, ":***@"),
    uploadDir,
    durationMs: Date.now() - start,
    thresholds: { maxFilename, maxPath },
    filePlan: {
      total: plan.length,
      moved: successful.length,
      failed: failed.length,
      failedExamples: failed.slice(0, 20).map((f) => ({ old: f.oldRel, reason: f.reason })),
    },
    keyMapEntries: keyMap.size,
    dbRewrite: dbSummary,
    before,
    after,
    completion: after.longFilenameCount === 0 && after.longPathCount === 0 && failed.length === 0,
  };
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error("[remediateStorageKeys] failed", error);
  process.exit(1);
});
