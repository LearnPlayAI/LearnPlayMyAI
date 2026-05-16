import fs from "fs";
import path from "path";
import { createHash } from "crypto";

type Mode = "dry-run" | "live";

const args = new Set(process.argv.slice(2));
const mode: Mode = args.has("--live") ? "live" : "dry-run";
const uploadDirArg = process.argv.find((a) => a.startsWith("--upload-dir="));
const uploadDir = path.resolve(uploadDirArg ? uploadDirArg.split("=").slice(1).join("=") : process.env.UPLOAD_DIR || "uploads");
const thresholdArg = process.argv.find((a) => a.startsWith("--threshold="));
const threshold = Number(thresholdArg ? thresholdArg.split("=")[1] : 180);
const reportArg = process.argv.find((a) => a.startsWith("--report="));
const reportPath = reportArg ? path.resolve(reportArg.split("=").slice(1).join("=")) : "";

function hash12(input: string): string {
  return createHash("sha1").update(input).digest("hex").slice(0, 12);
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

async function main() {
  const files = await listFiles(uploadDir);
  const plan: Array<{ oldAbs: string; newAbs: string; oldLen: number; moved: boolean; error?: string }> = [];

  for (const oldAbs of files) {
    const oldLen = oldAbs.length;
    if (oldLen <= threshold) continue;
    const rel = path.relative(uploadDir, oldAbs).replace(/\\/g, "/");
    const ext = path.extname(rel).toLowerCase();
    const token = hash12(rel);
    const leaf = `prv-arc-${token}${ext}`;
    const newRel = `private/k/prv-arc/${token.slice(0, 2)}/${token.slice(2, 4)}/${leaf}`;
    const newAbs = path.join(uploadDir, newRel);
    plan.push({ oldAbs, newAbs, oldLen, moved: false });
  }

  for (const row of plan) {
    try {
      if (mode === "live") {
        await fs.promises.mkdir(path.dirname(row.newAbs), { recursive: true });
        await fs.promises.copyFile(row.oldAbs, row.newAbs);
        const [oldStat, newStat] = await Promise.all([fs.promises.stat(row.oldAbs), fs.promises.stat(row.newAbs)]);
        if (oldStat.size !== newStat.size) {
          throw new Error("copied file size mismatch");
        }
        await fs.promises.unlink(row.oldAbs);
      }
      row.moved = true;
    } catch (error: any) {
      row.error = String(error?.message || error || "move_failed");
    }
  }

  const summary = {
    mode,
    uploadDir,
    threshold,
    candidates: plan.length,
    moved: plan.filter((p) => p.moved).length,
    failed: plan.filter((p) => !p.moved).length,
    failedExamples: plan.filter((p) => !p.moved).slice(0, 20),
  };

  if (reportPath) {
    await fs.promises.mkdir(path.dirname(reportPath), { recursive: true });
    await fs.promises.writeFile(reportPath, JSON.stringify({ summary, plan }, null, 2), "utf8");
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error("[compactLongUploadPaths] failed", error);
  process.exit(1);
});
