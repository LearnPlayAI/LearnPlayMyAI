import { describe, expect, it } from "@jest/globals";
import { validateTopicName } from "../services/courseFrameworkTopicValidation";

describe("course framework topic validation", () => {
  it("rejects plain meta labels from AI topic analysis", () => {
    expect(validateTopicName("Overview").valid).toBe(false);
    expect(validateTopicName("Key Takeaways").valid).toBe(false);
  });

  it("allows specific Word outline labels when explicit outline nodes are selected", () => {
    expect(validateTopicName("Overview: LearnPlay at a Glance", { allowDocumentOutlineLabels: true })).toEqual({
      valid: true,
      sanitized: "Overview: LearnPlay at a Glance",
    });
    expect(validateTopicName("Key Takeaways: Why Organisations Choose LearnPlay", { allowDocumentOutlineLabels: true })).toEqual({
      valid: true,
      sanitized: "Key Takeaways: Why Organisations Choose LearnPlay",
    });
  });

  it("allows selected topic labels that include structural words as part of a fuller title", () => {
    expect(validateTopicName("Overview Lesson").valid).toBe(true);
    expect(validateTopicName("Lesson 1: iGaming Operator Models")).toEqual({
      valid: true,
      sanitized: "iGaming Operator Models",
    });
    expect(validateTopicName("Key Takeaways Lesson").valid).toBe(true);
  });
});
