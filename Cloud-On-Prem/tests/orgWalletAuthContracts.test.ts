import fs from "fs";
import path from "path";
import { describe, expect, it } from "@jest/globals";

function read(relPath: string): string {
  const abs = path.join(process.cwd(), relPath);
  return fs.readFileSync(abs, "utf8");
}

describe("org wallet auth contracts", () => {
  it("protects org wallet transaction and summary endpoints with session auth middleware", () => {
    const routes = read("server/routes/orgRoutes.ts");

    expect(routes).toMatch(
      /app\.get\("\/api\/org-wallet\/:organizationId\/transactions",\s*withSessionAuthMiddleware,\s*async/,
    );
    expect(routes).toMatch(
      /app\.get\("\/api\/org-wallet\/:organizationId\/summary",\s*withSessionAuthMiddleware,\s*async/,
    );
  });
});

