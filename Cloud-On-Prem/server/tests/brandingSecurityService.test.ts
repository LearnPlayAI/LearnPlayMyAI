import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import {
  normalizeOrganizationDomainInput,
  resolveCertificateLogoFetchUrl,
  resolveBrandingObjectPathFromUrl,
  resolveSafeApiFilesPath,
  resolveSafeBrandingAssetPath,
  shouldMarkThemeSyncRun,
} from "../services/brandingSecurityService";

describe("brandingSecurityService", () => {
  const previousBaseUrl = process.env.BASE_URL;

  beforeAll(() => {
    process.env.BASE_URL = process.env.BASE_URL || "http://localhost:5000";
  });

  afterAll(() => {
    if (previousBaseUrl === undefined) {
      delete process.env.BASE_URL;
    } else {
      process.env.BASE_URL = previousBaseUrl;
    }
  });

  it("allows safe branding asset route params", () => {
    expect(resolveSafeBrandingAssetPath("platform", "logo-1765016548696.png")).toBe(
      "branding/platform/logo-1765016548696.png"
    );
    expect(resolveSafeBrandingAssetPath("org-abc-123", "favicon-1765016548696.png")).toBe(
      "branding/org-abc-123/favicon-1765016548696.png"
    );
  });

  it("rejects unsafe branding asset route params", () => {
    expect(resolveSafeBrandingAssetPath("../etc", "logo-1.png")).toBeNull();
    expect(resolveSafeBrandingAssetPath("platform", "../../secret.txt")).toBeNull();
    expect(resolveSafeBrandingAssetPath("org-abc", "logo.png")).toBeNull();
  });

  it("only allows trusted branding URLs for certificate logo fetch", () => {
    expect(resolveCertificateLogoFetchUrl("/api/public/branding/platform/logo-1765016548696.png")).toMatch(
      /\/api\/public\/branding\/platform\/logo-1765016548696\.png$/
    );
    expect(resolveCertificateLogoFetchUrl("http://169.254.169.254/latest/meta-data")).toBeNull();
    expect(resolveCertificateLogoFetchUrl("https://example.com/logo.png")).toBeNull();
  });

  it("rejects unsafe api/files resolution", () => {
    const encodedTraversal = Buffer.from("../etc/passwd", "utf-8").toString("base64url");
    expect(resolveSafeApiFilesPath(`/api/files/${encodedTraversal}`)).toBeNull();
  });

  it("marks sync run only on success", () => {
    expect(shouldMarkThemeSyncRun(true)).toBe(true);
    expect(shouldMarkThemeSyncRun(false)).toBe(false);
  });

  it("normalizes valid custom domains and rejects unsafe forms", () => {
    expect(normalizeOrganizationDomainInput("School.Example.com.")).toEqual({ normalized: "school.example.com" });
    expect(normalizeOrganizationDomainInput("münich.example.com")).toEqual({ normalized: "xn--mnich-kva.example.com" });

    expect(normalizeOrganizationDomainInput("https://example.com").normalized).toBeNull();
    expect(normalizeOrganizationDomainInput("example.com/path").normalized).toBeNull();
    expect(normalizeOrganizationDomainInput("*.example.com").normalized).toBeNull();
    expect(normalizeOrganizationDomainInput("127.0.0.1").normalized).toBeNull();
  });

  it("resolves branding object paths from both legacy and public-objects URLs", () => {
    expect(
      resolveBrandingObjectPathFromUrl("/api/public/branding/platform/logo-1765016548696.png")
    ).toBe("branding/platform/logo-1765016548696.png");

    expect(
      resolveBrandingObjectPathFromUrl("/api/public-objects/branding%2Fplatform%2Flogo-1765016548696.png")
    ).toBe("branding/platform/logo-1765016548696.png");
  });
});
