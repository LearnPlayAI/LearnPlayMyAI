import { describe, expect, test } from "@jest/globals";
import { buildCanonicalStorageKey, requireNonEmptyStorageKey } from "../utils/storageKeyManager";

describe("storageKeyManager guardrails", () => {
  test("requireNonEmptyStorageKey throws for empty inputs", () => {
    expect(() => requireNonEmptyStorageKey("", "test")).toThrow("Missing required storage key");
    expect(() => requireNonEmptyStorageKey("   ", "test")).toThrow("Missing required storage key");
    expect(() => requireNonEmptyStorageKey(null, "test")).toThrow("Missing required storage key");
    expect(() => requireNonEmptyStorageKey(undefined, "test")).toThrow("Missing required storage key");
  });

  test("requireNonEmptyStorageKey returns trimmed non-empty keys", () => {
    const key = buildCanonicalStorageKey({
      scope: "private",
      domain: "prv-lsn",
      extension: ".pptx",
      seed: "unit-test",
    });
    expect(requireNonEmptyStorageKey(`  ${key}  `, "test")).toBe(key);
  });
});
