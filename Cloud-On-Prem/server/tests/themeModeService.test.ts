import { describe, expect, it } from "@jest/globals";
import { resolveThemeModeIntent } from "../services/themeModeService";

describe("themeModeService", () => {
  it("prefers explicit mode intent when provided", () => {
    expect(resolveThemeModeIntent({ explicit: "dark" })).toBe("dark");
    expect(resolveThemeModeIntent({ explicit: "light" })).toBe("light");
  });

  it("falls back to available multi-mode token sets when explicit mode is missing", () => {
    expect(
      resolveThemeModeIntent({
        tokensLight: { "--background": "hsl(210 40% 98%)" },
        tokensDark: null,
      })
    ).toBe("light");

    expect(
      resolveThemeModeIntent({
        tokensLight: null,
        tokensDark: { "--background": "hsl(0 0% 8%)" },
      })
    ).toBe("dark");
  });

  it("infers dark mode from low-luminance active tokens", () => {
    expect(
      resolveThemeModeIntent({
        tokens: {
          "--background": "hsl(0 0% 8%)",
          "--foreground": "hsl(0 0% 95%)",
        },
      })
    ).toBe("dark");
  });
});

