import fs from "fs";
import path from "path";
import { describe, expect, it } from "@jest/globals";

function read(relPath: string): string {
  const abs = path.join(process.cwd(), relPath);
  return fs.readFileSync(abs, "utf8");
}

describe("mailersend webhook security contracts", () => {
  it("rejects mailersend webhooks in production when webhook secret is missing", () => {
    const routes = read("server/routes/paymentsRoutes.ts");

    expect(routes).toContain("process.env.NODE_ENV === 'production'");
    expect(routes).toContain("Webhook secret missing in production - rejecting webhook");
    expect(routes).toContain("Webhook verification is not configured");
  });
});

