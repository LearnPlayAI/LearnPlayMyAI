import fs from "fs";
import path from "path";
import { describe, it, expect } from "@jest/globals";

function read(relPath: string): string {
  const abs = path.join(process.cwd(), relPath);
  return fs.readFileSync(abs, "utf8");
}

describe("data safety contracts", () => {
  it("update flow does not auto-sync broad seed data", () => {
    const updateSh = read("cloud/update.sh");
    expect(updateSh).not.toMatch(/import-platform-data\.sh/);
    expect(updateSh).not.toMatch(/--auto-remediate\b/);
    expect(updateSh).not.toMatch(/ALLOW_JOURNAL_REPAIR=true node .*scripts\/migrate\.js/);
    expect(updateSh).toContain("ensure_required_supported_languages");
  });

  it("runtime startup does not run implicit data seeding/remediation writers", () => {
    const indexTs = read("server/index.ts");
    const blocked = [
      "ensureSupportedLanguages()",
      "backfillContentGroupIds()",
      "ensurePlatformPricingSchemaCompatibility()",
      "ThemeCatalogRolloutService.runIfDue()",
      "ensureGammaImageStyles()",
      "seedPlatformDefaults()",
      "recoverInterruptedJobs(",
      "recoverPendingJobs(",
      "repairMisclassifiedScopes()",
    ];
    for (const token of blocked) {
      expect(indexTs).not.toContain(token);
    }
  });

  it("route registration does not trigger default category seed at startup", () => {
    const routesFile = read("server/routes/courseFrameworkRoutes.ts");
    expect(routesFile).not.toContain("seedDefaultCategories().catch");
  });

  it("migration runner blocks unsafe FRESH_INSTALL override", () => {
    const migrate = read("server/migrate-onprem.ts");
    expect(migrate).toContain("FRESH_INSTALL override is disabled for data safety");
    expect(migrate).not.toContain("const forceFreshInstall");
  });

  it("seed importer enforces preflight and dry-run contract", () => {
    const importer = read("cloud/import-platform-data.sh");
    expect(importer).toContain("Refusing seed import: database is not empty");
    expect(importer).toContain("--dry-run");
    expect(importer).toContain("--allow-nonempty");
  });
});
