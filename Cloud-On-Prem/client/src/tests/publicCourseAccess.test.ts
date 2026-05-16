import { describe, expect, it } from "@jest/globals";
import { hasOpenPublicCourseAccess } from "../lib/publicCourseAccess";

describe("public course access helpers", () => {
  it("allows active free public courses to open lesson access", () => {
    expect(
      hasOpenPublicCourseAccess({
        isShowcaseCourse: false,
        visibility: "public",
        status: "active",
        isPaid: false,
        price: "0.00",
      })
    ).toBe(true);
  });

  it("allows showcase courses even when they have a price", () => {
    expect(
      hasOpenPublicCourseAccess({
        isShowcaseCourse: true,
        visibility: "public",
        status: "active",
        isPaid: true,
        price: "150.00",
      })
    ).toBe(true);
  });

  it("does not open paid non-showcase public courses", () => {
    expect(
      hasOpenPublicCourseAccess({
        isShowcaseCourse: false,
        visibility: "public",
        status: "active",
        isPaid: true,
        price: "150.00",
      })
    ).toBe(false);
  });
});
