import fs from "fs";
import path from "path";
import { describe, expect, it } from "@jest/globals";

function read(relPath: string): string {
  const abs = path.join(process.cwd(), relPath);
  return fs.readFileSync(abs, "utf8");
}

describe("mailersend webhook verifier contracts", () => {
  it("implements hmac + timing-safe verification in MailerSendService", () => {
    const service = read("server/services/mailerSendService.ts");
    expect(service).toContain("static verifyWebhookSignature(signature: string, payload: string, webhookSecret: string): boolean");
    expect(service).toContain("createHmac(\"sha256\", secret)");
    expect(service).toContain("timingSafeEqual");
  });

  it("uses MailerSendService verifier from payments webhook route", () => {
    const routes = read("server/routes/paymentsRoutes.ts");
    expect(routes).toContain("MailerSendService.verifyWebhookSignature(");
  });
});

