import { LessonPodcastService } from "../services/lessonPodcastService";
import { pool, sessionPool } from "../db";
import * as fs from "fs";
import * as path from "path";

type CliOptions = {
  live: boolean;
  force: boolean;
  lessonId?: string;
  organizationId?: string;
  maxLessons?: number;
  lockFile?: string;
  statusFile?: string;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    live: argv.includes("--live"),
    force: argv.includes("--force"),
  };

  for (const arg of argv) {
    if (arg.startsWith("--lessonId=")) {
      options.lessonId = arg.slice("--lessonId=".length).trim() || undefined;
    } else if (arg.startsWith("--organizationId=")) {
      options.organizationId = arg.slice("--organizationId=".length).trim() || undefined;
    } else if (arg.startsWith("--maxLessons=")) {
      const parsed = Number(arg.slice("--maxLessons=".length).trim());
      if (Number.isFinite(parsed) && parsed > 0) {
        options.maxLessons = Math.floor(parsed);
      }
    } else if (arg.startsWith("--lockFile=")) {
      const lockFile = arg.slice("--lockFile=".length).trim();
      options.lockFile = lockFile || undefined;
    } else if (arg.startsWith("--statusFile=")) {
      const statusFile = arg.slice("--statusFile=".length).trim();
      options.statusFile = statusFile || undefined;
    }
  }

  return options;
}

function writeStatus(
  statusFile: string | undefined,
  payload: Record<string, unknown>
): void {
  if (!statusFile) return;
  try {
    const target = path.resolve(statusFile);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, JSON.stringify(payload, null, 2), "utf8");
  } catch {
    // non-fatal
  }
}

function acquireExclusiveLock(lockFile: string): number {
  const target = path.resolve(lockFile);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const fd = fs.openSync(target, "wx");
  fs.writeFileSync(fd, JSON.stringify({
    pid: process.pid,
    startedAt: new Date().toISOString(),
  }) + "\n", "utf8");
  return fd;
}

function releaseExclusiveLock(lockFile: string, fd: number | null): void {
  if (fd === null) return;
  try {
    fs.closeSync(fd);
  } catch {
    // ignore
  }
  try {
    fs.unlinkSync(path.resolve(lockFile));
  } catch {
    // ignore
  }
}

async function shutdownDbPools(): Promise<void> {
  try {
    await pool.end();
  } catch {
    // non-fatal
  }
  if (sessionPool !== pool) {
    try {
      await sessionPool.end();
    } catch {
      // non-fatal
    }
  }
}

async function run(): Promise<number> {
  const options = parseArgs(process.argv.slice(2));
  const dryRun = !options.live;
  const startedAt = new Date().toISOString();
  const lockFile = options.lockFile || "/tmp/learnplay-podcast-hls-backfill.lock";
  let lockFd: number | null = null;

  writeStatus(options.statusFile, {
    status: "starting",
    pid: process.pid,
    startedAt,
    dryRun,
    force: options.force,
    lessonId: options.lessonId || null,
    organizationId: options.organizationId || null,
    maxLessons: options.maxLessons ?? null,
    lockFile,
  });

  try {
    lockFd = acquireExclusiveLock(lockFile);
  } catch (error: any) {
    const message = String(error?.message || error || "Backfill lock already held.");
    console.log(`[Podcast HLS Backfill] Skip: another backfill process appears to be running (lock: ${lockFile})`);
    writeStatus(options.statusFile, {
      status: "skipped_already_running",
      pid: process.pid,
      startedAt,
      finishedAt: new Date().toISOString(),
      message,
      lockFile,
    });
    return 0;
  }

  console.log(
    `[Podcast HLS Backfill] Starting (${dryRun ? "DRY RUN" : "LIVE"})` +
    `${options.force ? " with --force" : ""}` +
    `${options.lessonId ? ` lessonId=${options.lessonId}` : ""}` +
    `${options.organizationId ? ` organizationId=${options.organizationId}` : ""}` +
    `${options.maxLessons ? ` maxLessons=${options.maxLessons}` : ""}`
  );
  writeStatus(options.statusFile, {
    status: "running",
    pid: process.pid,
    startedAt,
    dryRun,
    force: options.force,
    lessonId: options.lessonId || null,
    organizationId: options.organizationId || null,
    maxLessons: options.maxLessons ?? null,
    lockFile,
  });

  try {
    const report = await LessonPodcastService.backfillHlsForCompletedVersions({
      lessonId: options.lessonId,
      organizationId: options.organizationId,
      force: options.force,
      dryRun,
      maxLessons: options.maxLessons,
    });

    console.log("[Podcast HLS Backfill] Report:");
    console.log(JSON.stringify(report, null, 2));

    const exitCode = !dryRun && report.failed > 0 ? 2 : 0;
    writeStatus(options.statusFile, {
      status: exitCode === 0 ? "completed" : "completed_with_failures",
      pid: process.pid,
      startedAt,
      finishedAt: new Date().toISOString(),
      exitCode,
      report,
      lockFile,
    });
    return exitCode;
  } catch (error: any) {
    const message = String((error as any)?.message || error || "Unknown backfill failure");
    console.error("[Podcast HLS Backfill] Failed:", message);
    writeStatus(options.statusFile, {
      status: "failed",
      pid: process.pid,
      startedAt,
      finishedAt: new Date().toISOString(),
      exitCode: 1,
      message,
      lockFile,
    });
    return 1;
  } finally {
    releaseExclusiveLock(lockFile, lockFd);
    await shutdownDbPools();
  }
}

run()
  .then((exitCode) => process.exit(exitCode))
  .catch(async (error) => {
    console.error("[Podcast HLS Backfill] Failed:", (error as any)?.message || error);
    await shutdownDbPools();
    process.exit(1);
  });
