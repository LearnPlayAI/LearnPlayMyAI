#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.cwd(), "client/src");
const EXTENSIONS = new Set([".tsx", ".ts", ".jsx", ".js"]);
const TARGET_DIRS = [path.join(ROOT, "pages"), path.join(ROOT, "components")];

const REPLACEMENTS = [
  [/bg-\[var\(--btn-primary-bg\)\]/g, "bg-primary"],
  [/text-\[var\(--btn-primary-fg\)\]/g, "text-primary-foreground"],
  [/hover:bg-\[var\(--btn-primary-hover\)\]/g, "hover:bg-primary/90"],
  [/bg-\[var\(--action-primary\)\]/g, "bg-primary"],
  [/hover:bg-\[var\(--action-primary\)\]\/90/g, "hover:bg-primary/90"],
  [/border-\[var\(--action-primary\)\]/g, "border-primary"],
  [/text-\[var\(--action-primary\)\]/g, "text-primary"],
  [/bg-\[var\(--action-secondary\)\]/g, "bg-secondary"],
  [/hover:bg-\[var\(--action-secondary\)\]\/90/g, "hover:bg-secondary/90"],
  [/border-\[var\(--action-secondary\)\]/g, "border-secondary"],
  [/text-\[var\(--action-secondary\)\]/g, "text-secondary"],
  [/bg-\[var\(--action-accent\)\]/g, "bg-accent"],
  [/hover:bg-\[var\(--action-accent\)\]\/90/g, "hover:bg-accent/90"],
  [/border-\[var\(--action-accent\)\]/g, "border-accent"],
  [/text-\[var\(--action-accent\)\]/g, "text-accent"],
  [/bg-\[var\(--success\)\]/g, "bg-success"],
  [/hover:bg-\[var\(--success\)\]\/90/g, "hover:bg-success/90"],
  [/bg-\[var\(--warning\)\]/g, "bg-warning"],
  [/hover:bg-\[var\(--warning\)\]\/90/g, "hover:bg-warning/90"],
  [/bg-\[var\(--destructive\)\]/g, "bg-destructive"],
  [/hover:bg-\[var\(--destructive\)\]\/90/g, "hover:bg-destructive/90"],
  [/text-\[var\(--action-secondary-fg\)\]/g, "text-secondary-foreground"],
  [/text-\[var\(--action-primary-fg\)\]/g, "text-primary-foreground"],
  [/text-\[var\(--btn-gradient-fg\)\]/g, "text-primary-foreground"],
  [/fill-\[var\(--action-accent\)\]/g, "fill-warning"],
  [/bg-\[var\(--btn-warning-bg\)\]/g, "bg-warning"],
  [/hover:bg-\[var\(--btn-warning-hover\)\]/g, "hover:bg-warning/90"],
  [/active:bg-\[var\(--btn-warning-active\)\]/g, "active:bg-warning/80"],
  [/text-\[var\(--btn-warning-fg\)\]/g, "text-warning-foreground"],
  [/hover:bg-\[var\(--btn-success-hover\)\]/g, "hover:bg-success/90"],
  [/text-\[var\(--success-foreground\)\]/g, "text-success-foreground"],
  [/border-l-\[var\(--warning\)\]/g, "border-l-warning"],
  [/border-l-\[var\(--action-accent\)\]/g, "border-l-accent"],
  [/\[\&>div\]:from-\[var\(--action-accent\)\]/g, "[&>div]:from-warning"],
  [/\[\&>div\]:to-\[var\(--warning\)\]/g, "[&>div]:to-warning/80"],
  [/shadow-\[var\(--action-primary\)\]\/\d+/g, "shadow-elevated"],
  [/shadow-\[var\(--action-secondary\)\]\/\d+/g, "shadow-elevated"],
  [/ring-\[var\(--action-primary\)\]\/\d+/g, "ring-primary/30"],
  [/ring-\[var\(--action-secondary\)\]\/\d+/g, "ring-secondary/30"],
  [/border-\[var\(--action-primary\)\]\/\d+/g, "border-primary/30"],
  [/border-\[var\(--action-secondary\)\]\/\d+/g, "border-secondary/30"],
  [/border-\[var\(--btn-ghost-border\)\]/g, "border-border"],
  [/hover:bg-\[var\(--btn-ghost-hover\)\]/g, "hover:bg-muted"],
  [/\btext-btn-ghost-foreground\b/g, "text-foreground"],
];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (!EXTENSIONS.has(path.extname(entry.name))) continue;
    if (full.includes(".backup")) continue;
    out.push(full);
  }
  return out;
}

const files = TARGET_DIRS.flatMap((dir) => walk(dir));
let touched = 0;

for (const file of files) {
  const original = fs.readFileSync(file, "utf8");
  let next = original;
  for (const [from, to] of REPLACEMENTS) {
    next = next.replace(from, to);
  }
  if (next !== original) {
    fs.writeFileSync(file, next, "utf8");
    touched += 1;
  }
}

console.log(`[remediate-action-token-classes] touched files: ${touched}`);
