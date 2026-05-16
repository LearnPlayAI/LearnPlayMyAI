import fs from "fs";
import path from "path";
import { describe, expect, it } from "@jest/globals";

function read(relPath: string): string {
  const abs = path.join(process.cwd(), relPath);
  return fs.readFileSync(abs, "utf8");
}

describe("banking bridge contracts", () => {
  it("routes use the organization banking bridge service for admin banking endpoints", () => {
    const legacyRoutes = read("server/routes.ts");
    const adminRoutes = read("server/routes/adminRoutes.ts");

    for (const content of [legacyRoutes, adminRoutes]) {
      expect(content).toContain("OrganizationBankingBridgeService.getByOrganizationId(");
      expect(content).toContain("OrganizationBankingBridgeService.upsertForOrganization(");
      expect(content).toContain("OrganizationBankingBridgeService.verifyForOrganization(");
    }
  });
});

