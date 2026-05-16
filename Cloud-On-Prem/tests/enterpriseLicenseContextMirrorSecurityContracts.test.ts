import fs from "fs";
import path from "path";
import { describe, expect, it } from "@jest/globals";

function read(relPath: string): string {
  const abs = path.join(process.cwd(), relPath);
  return fs.readFileSync(abs, "utf8");
}

describe("enterprise license context mirror security contracts", () => {
  it("fails closed when mirror key is missing or weak", () => {
    const portalRoutes = read("server/routes/enterprisePortalRoutes.ts");
    const superAdminRoutes = read("server/routes/enterpriseSuperAdminRoutes.ts");

    expect(portalRoutes).toContain("License context mirror key is not configured");
    expect(portalRoutes).toContain("isValidMirrorKeyConfig");
    expect(superAdminRoutes).toContain("ENTERPRISE_LICENSE_CONTEXT_MIRROR_KEY missing or too short.");
    expect(superAdminRoutes).toContain("isValidMirrorKeyConfig");
  });

  it("uses timing-safe comparison for mirror header verification", () => {
    const portalRoutes = read("server/routes/enterprisePortalRoutes.ts");

    expect(portalRoutes).toContain("constantTimeMirrorKeyMatch");
    expect(portalRoutes).toContain("crypto.timingSafeEqual");
    expect(portalRoutes).toContain("expectedBuf.length === providedBuf.length");
  });

  it("does not include an embedded fallback mirror secret", () => {
    const portalRoutes = read("server/routes/enterprisePortalRoutes.ts");
    const superAdminRoutes = read("server/routes/enterpriseSuperAdminRoutes.ts");

    expect(portalRoutes).not.toContain("lp-enterprise-license-context-mirror-20260323");
    expect(superAdminRoutes).not.toContain("lp-enterprise-license-context-mirror-20260323");
  });
});
