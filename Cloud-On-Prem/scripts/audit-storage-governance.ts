import fs from "fs";
import path from "path";

type Rule = {
  id: string;
  pattern: RegExp;
  allowFiles?: RegExp[];
  message: string;
};

const repoRoot = process.cwd();
const serverRoot = path.join(repoRoot, "server");

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop()!;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules") continue;
        stack.push(abs);
        continue;
      }
      if (!/\.(ts|tsx|mts|cts)$/.test(entry.name)) continue;
      out.push(abs);
    }
  }
  return out;
}

function rel(absPath: string): string {
  return path.relative(repoRoot, absPath).replace(/\\/g, "/");
}

function lineOf(content: string, index: number): number {
  return content.slice(0, index).split("\n").length;
}

const rules: Rule[] = [
  {
    id: "legacy-uploads-literal",
    pattern: /\/uploads\/(?:private|public)\//g,
    allowFiles: [
      /^server\/utils\/uploadPaths\.ts$/,
      /^server\/scripts\/.+\.ts$/,
      /^server\/services\/courseTransferService\.ts$/,
      /^server\/objectStorage-onprem\.ts$/,
      /^server\/tests\/.+\.ts$/,
    ],
    message:
      "Legacy /uploads path literal found. Use canonical storage keys via storageKeyManager/ObjectStorageService.",
  },
  {
    id: "direct-upload-root-join",
    pattern: /path\.join\(\s*getUploadDir\(\)\s*,\s*['"`](private|public)['"`]/g,
    allowFiles: [/^server\/utils\/uploadPaths\.ts$/],
    message:
      "Direct path.join(getUploadDir(), 'private|public') found. Route writes through canonical key manager instead.",
  },
  {
    id: "parse-object-path-usage",
    pattern: /\bparseObjectPath\s*\(/g,
    allowFiles: [
      /^server\/objectStorage-onprem\.ts$/,
      /^server\/tests\/.+\.ts$/,
    ],
    message:
      "parseObjectPath() usage detected outside storage layer/tests. Use ObjectStorageService operations instead.",
  },
  {
    id: "empty-storage-key-assignment",
    pattern: /\bstorageKey\s*:\s*["']{2}/g,
    allowFiles: [/^server\/tests\/.+\.ts$/],
    message:
      "Empty storageKey assignment found. storageKey must be non-empty (or omitted when optional metadata only).",
  },
];

function isAllowed(file: string, allowFiles?: RegExp[]): boolean {
  if (!allowFiles || !allowFiles.length) return false;
  return allowFiles.some((rule) => rule.test(file));
}

function main() {
  const files = listTsFiles(serverRoot);
  const findings: Array<{ file: string; line: number; rule: string; snippet: string; message: string }> = [];

  for (const absFile of files) {
    const file = rel(absFile);
    const content = fs.readFileSync(absFile, "utf8");
    const lines = content.split("\n");

    for (const rule of rules) {
      rule.pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = rule.pattern.exec(content)) !== null) {
        if (isAllowed(file, rule.allowFiles)) continue;
        const ln = lineOf(content, match.index);
        findings.push({
          file,
          line: ln,
          rule: rule.id,
          snippet: (lines[ln - 1] || "").trim().slice(0, 220),
          message: rule.message,
        });
      }
    }
  }

  if (!findings.length) {
    console.log("[audit-storage-governance] OK: no prohibited storage patterns found.");
    return;
  }

  console.error(`[audit-storage-governance] FAIL: ${findings.length} issue(s) found.`);
  for (const finding of findings.slice(0, 200)) {
    console.error(
      `${finding.file}:${finding.line} [${finding.rule}] ${finding.message}\n  ${finding.snippet}`
    );
  }
  process.exit(1);
}

main();
