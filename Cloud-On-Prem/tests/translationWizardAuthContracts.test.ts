import fs from "fs";
import path from "path";
import { describe, expect, it } from "@jest/globals";

function read(relPath: string): string {
  const abs = path.join(process.cwd(), relPath);
  return fs.readFileSync(abs, "utf8");
}

describe("translation wizard auth contracts", () => {
  it("protects translation wizard state endpoints with session auth middleware", () => {
    const routes = read("server/routes/courseRoutes.ts");

    expect(routes).toMatch(
      /app\.get\("\/api\/lessons\/:sourceLessonId\/translation-wizard-state",\s*withSessionAuthMiddleware,\s*async/,
    );
    expect(routes).toMatch(
      /app\.post\("\/api\/lessons\/:sourceLessonId\/translation-wizard-state",\s*withSessionAuthMiddleware,\s*async/,
    );
  });
});

