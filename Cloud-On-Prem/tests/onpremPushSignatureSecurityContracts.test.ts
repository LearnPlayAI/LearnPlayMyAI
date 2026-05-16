import fs from "fs";
import path from "path";
import { describe, expect, it } from "@jest/globals";

function read(relPath: string): string {
  const abs = path.join(process.cwd(), relPath);
  return fs.readFileSync(abs, "utf8");
}

describe("onprem push signature security contracts", () => {
  it("uses timing-safe signature verification for push-update endpoint", () => {
    const routes = read("server/routes/onpremLicenseRoutes.ts");

    expect(routes).toContain("function isValidPushSignature(expected: string, provided: string): boolean");
    expect(routes).toContain("crypto.timingSafeEqual");
    expect(routes).toContain("expectedBuf.length === providedBuf.length");
    expect(routes).toContain("if (!isValidPushSignature(expected, signature))");
  });
});
