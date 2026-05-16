import { db } from "../db";
import { certificates, users, organizations, playerStats, courses, brandingThemes } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import { getBaseUrl } from '../config/base-url';
import { resolveCertificateLogoFetchUrl, resolveSafeApiFilesPath } from "./brandingSecurityService";
import * as fs from "fs";

interface OrganizationBranding {
  orgName: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  allowEmailBranding: boolean;
}

function extractRequiredColorFromTokens(tokens: Record<string, string> | null, colorName: string): string {
  if (!tokens) {
    throw new Error(`[CertificateService] Missing branding tokens while resolving "${colorName}"`);
  }
  
  const possibleKeys = [
    `--${colorName}`,
    `--color-${colorName}`,
    `--${colorName}-color`,
    colorName,
  ];
  
  let value: string | undefined;
  for (const key of possibleKeys) {
    if (tokens[key] && typeof tokens[key] === 'string') {
      value = tokens[key];
      break;
    }
  }
  
  if (!value) {
    throw new Error(`[CertificateService] Required branding color "${colorName}" is not configured in theme tokens`);
  }
  
  if (value.startsWith('hsl(')) {
    const match = value.match(/hsl\(\s*([\d.]+)[\s,]+([\d.]+)%[\s,]+([\d.]+)%\s*\)/);
    if (match) {
      const [, h, s, l] = match;
      return hslToHex(parseFloat(h), parseFloat(s), parseFloat(l));
    }
  }
  if (value.startsWith('#')) {
    return value;
  }

  throw new Error(`[CertificateService] Unsupported value for branding color "${colorName}": ${value}`);
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Darken a hex color by keeping a percentage of brightness
 * @param hex - The hex color to darken
 * @param brightness - Brightness factor: 1.0 = original, 0.0 = black
 *                     e.g. 0.15 means keep 15% brightness (very dark)
 */
function darkenHexColor(hex: string, brightness: number): string {
  // Remove # if present and handle short hex
  let cleanHex = hex.replace('#', '');
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split('').map(c => c + c).join('');
  }
  if (cleanHex.length !== 6) {
    return '#0a0118'; // Fallback dark purple
  }
  
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  
  // Clamp brightness between 0 and 1
  const clampedBrightness = Math.max(0, Math.min(1, brightness));
  
  const newR = Math.round(r * clampedBrightness);
  const newG = Math.round(g * clampedBrightness);
  const newB = Math.round(b * clampedBrightness);
  
  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
}
import { ObjectStorageService } from "../objectStorage";
import { randomBytes } from "crypto";
import PDFDocument from "pdfkit";
import { MailerSendService } from "./mailerSendService";

const MAX_CERTIFICATE_LOGO_BYTES = 5 * 1024 * 1024;

function tryResolveApiFilesPathFromUrl(logoUrl: string): string | null {
  if (!logoUrl) return null;
  if (logoUrl.startsWith('/api/files/')) {
    return resolveSafeApiFilesPath(logoUrl);
  }

  try {
    const parsed = new URL(logoUrl);
    const baseOrigin = new URL(getBaseUrl()).origin;
    if (parsed.origin !== baseOrigin) return null;
    if (!parsed.pathname.startsWith('/api/files/')) return null;
    return resolveSafeApiFilesPath(parsed.pathname);
  } catch {
    return null;
  }
}

function parseHexColor(hex: string): { r: number; g: number; b: number } | null {
  const cleaned = String(hex || '').trim().replace('#', '');
  if (!cleaned) return null;
  const normalized = cleaned.length === 3
    ? cleaned.split('').map((char) => char + char).join('')
    : cleaned;
  if (normalized.length !== 6) return null;

  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  if ([r, g, b].some((value) => Number.isNaN(value))) return null;
  return { r, g, b };
}

function relativeLuminance(hex: string): number {
  const rgb = parseHexColor(hex);
  if (!rgb) return 0;
  const toLinear = (channel: number) => {
    const normalized = channel / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(rgb.r) + 0.7152 * toLinear(rgb.g) + 0.0722 * toLinear(rgb.b);
}

function ensureReadableOnDark(hex: string, fallback = '#f5f7ff'): string {
  const luminance = relativeLuminance(hex);
  if (luminance >= 0.32) {
    return hex;
  }
  return fallback;
}

async function fetchSafeLogoBuffer(logoUrl: string | null | undefined, contextLabel: string): Promise<Buffer | null> {
  if (!logoUrl) return null;

  const safeApiFilesPath = tryResolveApiFilesPathFromUrl(logoUrl);
  if (safeApiFilesPath) {
    try {
      const fileData = await fs.promises.readFile(safeApiFilesPath);
      if (fileData.length > MAX_CERTIFICATE_LOGO_BYTES) return null;
      return fileData;
    } catch (error) {
      console.warn(`[CertificateService] Failed to read ${contextLabel} logo from api/files path:`, error);
      return null;
    }
  }

  const safeFetchUrl = resolveCertificateLogoFetchUrl(logoUrl);
  if (!safeFetchUrl) {
    console.warn(`[CertificateService] Ignoring unsafe ${contextLabel} logo URL`);
    return null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(safeFetchUrl, { signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) return null;
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_CERTIFICATE_LOGO_BYTES) {
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length > MAX_CERTIFICATE_LOGO_BYTES) return null;
    return buffer;
  } catch (error) {
    console.warn(`[CertificateService] Failed to fetch ${contextLabel} logo:`, error);
    return null;
  }
}

function drawCircularLogo(
  doc: any,
  logoBuffer: Buffer,
  centerX: number,
  centerY: number,
  diameter: number
): void {
  const radius = diameter / 2;
  doc.save();
  doc.circle(centerX, centerY, radius).clip();
  doc.image(logoBuffer, centerX - radius, centerY - radius, {
    fit: [diameter, diameter],
    align: "center",
    valign: "center",
  });
  doc.restore();
}

export interface IssueCourseCompletionCertificateParams {
  courseId: string;
  userId: string;
  organizationId: string;
  xpEarned?: number; // Default is 500 XP for course completion
  instructorName?: string; // Course creator name (auto-fetched if not provided)
}

export interface GenerateSocialShareParams {
  certificateId: string;
  platforms: ("linkedin" | "twitter" | "facebook")[];
}

type Certificate = typeof certificates.$inferSelect;

/**
 * Certificate Service - Handles course completion certificates
 * Manages PDF generation, XP awards, and social sharing
 * Supports organization-specific branding with custom colors
 */
export class CertificateService {
  /**
   * Get organization branding settings for certificate generation
   * Returns full branding including colors from CSS tokens
   * Enforces white-label branding: no platform-default fallback in certificate generation
   */
  private static async getOrganizationBranding(organizationId: string): Promise<OrganizationBranding> {
    const [branding] = await db
      .select()
      .from(brandingThemes)
      .where(and(eq(brandingThemes.organizationId, organizationId), eq(brandingThemes.status, 'active')))
      .limit(1);

    if (!branding || !branding.orgName) {
      throw new Error(`[CertificateService] Active white-label branding is required for certificate generation (org: ${organizationId})`);
    }

    const tokens = (branding.tokens as Record<string, string>) || null;
    const allowEmailBranding = branding.allowEmailBranding ?? true;

    if (allowEmailBranding === false) {
      throw new Error(`[CertificateService] Certificate generation blocked: branding is disabled for org ${organizationId}`);
    }

    return {
      orgName: branding.orgName,
      logoUrl: branding.logoUrl,
      primaryColor: extractRequiredColorFromTokens(tokens, 'primary'),
      secondaryColor: extractRequiredColorFromTokens(tokens, 'secondary'),
      accentColor: extractRequiredColorFromTokens(tokens, 'accent'),
      allowEmailBranding,
    };
  }

  /**
   * Award XP to player and optionally increment certificatesEarned counter
   */
  private static async awardXPForCertificate(userId: string, xpEarned: number, incrementCertificateCount = true): Promise<void> {
    const [stats] = await db
      .select()
      .from(playerStats)
      .where(eq(playerStats.playerId, userId))
      .limit(1);

    if (!stats) {
      // Create playerStats if doesn't exist
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        throw new Error(`User ${userId} not found`);
      }

      await db.insert(playerStats).values({
        playerId: userId,
        gamerName: user.gamerName,
        currentXP: xpEarned,
        totalXPEarned: xpEarned,
        certificatesEarned: incrementCertificateCount ? 1 : 0,
      });

      console.log(`[CertificateService] Created playerStats for user ${userId} with XP ${xpEarned}`);
      return;
    }

    // Update existing stats
    const newXP = (stats.currentXP || 0) + xpEarned;
    const newTotalXP = (stats.totalXPEarned || 0) + xpEarned;
    const newCertCount = incrementCertificateCount ? (stats.certificatesEarned || 0) + 1 : (stats.certificatesEarned || 0);

    // Calculate new level (100 XP per level)
    const newLevel = Math.floor(newXP / 100) + 1;

    await db
      .update(playerStats)
      .set({
        currentXP: newXP,
        totalXPEarned: newTotalXP,
        certificatesEarned: newCertCount,
        currentLevel: newLevel,
        updatedAt: new Date(),
      })
      .where(eq(playerStats.playerId, userId));

    console.log(
      `[CertificateService] Awarded ${xpEarned} XP to user ${userId}. New XP: ${newXP}, Level: ${newLevel}`
    );
  }

  /**
   * Issue a course completion certificate
   * Awards 500 XP by default, generates premium PDF with gold/platinum design
   * Only issued after user passes ALL quizzes in the course
   * 
   * SECURITY: This method validates eligibility internally before issuing
   */
  static async issueCourseCompletionCertificate(
    params: IssueCourseCompletionCertificateParams
  ): Promise<Certificate> {
    const { courseId, userId, organizationId, xpEarned = 500 } = params;

    // Import CourseCompletionService for eligibility validation
    const { CourseCompletionService } = await import("./courseCompletionService");

    // Validate eligibility before issuing (security: internal validation)
    const eligibility = await CourseCompletionService.checkCertificateEligibility(courseId, userId);

    if (!eligibility.isEligible) {
      if (eligibility.existingCertificateId) {
        // Return existing certificate instead of throwing
        const [existing] = await db
          .select()
          .from(certificates)
          .where(
            and(
              eq(certificates.userId, userId),
              eq(certificates.courseId, courseId),
              eq(certificates.certificateType, "course")
            )
          )
          .limit(1);

        if (existing) {
          console.log(
            `[CertificateService] Course certificate already exists for user ${userId} and course ${courseId}`
          );
          return existing;
        }
      }
      throw new Error(eligibility.reason);
    }

    // Fetch course details
    const [course] = await db
      .select()
      .from(courses)
      .where(eq(courses.id, courseId))
      .limit(1);

    if (!course) {
      throw new Error(`Course ${courseId} not found`);
    }

    // Verify the course belongs to this organization or is accessible
    if (course.organizationId !== organizationId) {
      // Allow if user has purchased the course (cross-org access)
      console.log(
        `[CertificateService] Course ${courseId} belongs to org ${course.organizationId}, not ${organizationId}. Proceeding with course's org.`
      );
    }

    // Get quiz count from eligibility progress
    const quizCount = eligibility.progress?.totalQuizCount || 0;

    // Fetch course creator (instructor) details
    let instructorName = params.instructorName;
    if (!instructorName && course.createdBy) {
      const [courseCreator] = await db
        .select()
        .from(users)
        .where(eq(users.id, course.createdBy))
        .limit(1);
      
      if (courseCreator) {
        instructorName = courseCreator.firstName && courseCreator.lastName
          ? `${courseCreator.firstName} ${courseCreator.lastName}`
          : courseCreator.gamerName;
      }
    }

    // Fetch user details
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      throw new Error(`User ${userId} not found`);
    }

    // Fetch organization details - use course's organization (creator org)
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, course.organizationId))
      .limit(1);

    if (!org) {
      throw new Error(`Organization ${course.organizationId} not found`);
    }

    // For public courses, we'll include the creator organization name
    const isPublicCourse = course.visibility === 'public';
    let creatorOrganizationName: string | undefined;

    if (isPublicCourse) {
      creatorOrganizationName = org.name;
      console.log(`[CertificateService] Public course - including creator org name: ${creatorOrganizationName}`);
    }

    // Always use the certificate owner org's active white-label branding (no platform fallback)
    const branding = await this.getOrganizationBranding(course.organizationId);

    // Generate unique certificate ID
    const certificateId = `COURSE-${Date.now()}-${randomBytes(4).toString("hex").toUpperCase()}`;

    // Generate learner name
    const learnerName =
      user.firstName && user.lastName
        ? `${user.firstName} ${user.lastName}`
        : user.gamerName;

    // Generate premium PDF certificate with gold/platinum design and organization branding
    const pdfBuffer = await this.generateCourseMasteryPDF({
      certificateId,
      learnerName,
      organizationName: org.name,
      creatorOrganizationName,
      courseTitle: course.title,
      quizCount,
      completedAt: new Date(),
      xpEarned,
      branding,
      instructorName,
    });

    // Generate branded filename: {orgName}-Certificate.pdf
    const sanitizedOrgName = branding.orgName.replace(/[^a-zA-Z0-9]/g, '');
    const brandedFilename = `${sanitizedOrgName}-Certificate-${certificateId}`;

    // Upload to Object Storage with branded filename
    const objectStorageService = new ObjectStorageService();
    const pdfStoragePath = await objectStorageService.uploadCertificatePDF(
      course.organizationId,
      userId,
      courseId, // Use courseId instead of lessonId
      pdfBuffer,
      brandedFilename // Use branded filename
    );

    // Create certificate record
    const [certificate] = await db
      .insert(certificates)
      .values({
        certificateId,
        certificateType: "course",
        userId,
        organizationId: course.organizationId,
        courseId,
        courseTitle: course.title,
        learnerName,
        organizationName: org.name,
        pdfStoragePath,
        xpEarned,
        completedAt: new Date(),
      })
      .returning();

    // Award XP for course completion
    await this.awardXPForCertificate(userId, xpEarned);

    console.log(
      `[CertificateService] Issued COURSE certificate ${certificate.certificateId} for user ${userId} on course ${courseId} with ${xpEarned} XP`
    );

    // Send certificate email with PDF attachment (non-blocking)
    if (user.email) {
      MailerSendService.sendCertificateEmail({
        recipientEmail: user.email,
        recipientName: learnerName,
        certificateId: certificate.certificateId,
        certificateType: 'course',
        title: course.title,
        pdfBuffer,
        organizationId: course.organizationId,
      }).catch((error) => {
        console.error(`[CertificateService] Failed to send course certificate email for ${certificate.certificateId}:`, error);
      });
    } else {
      console.warn(`[CertificateService] Cannot send course certificate email - user ${userId} has no email address`);
    }

    return certificate;
  }

  /**
   * Generate Premium Course Mastery PDF Certificate
   * Gold/platinum prestigious design for course completion achievement
   * Uses organization branding when available
   * For public courses, displays the creator organization name
   */
  private static async generateCourseMasteryPDF(params: {
    certificateId: string;
    learnerName: string;
    organizationName: string;
    courseTitle: string;
    quizCount: number;
    completedAt: Date;
    xpEarned?: number;
    branding?: OrganizationBranding;
    instructorName?: string;
    creatorOrganizationName?: string; // For public courses: name of the org that created the course
  }): Promise<Buffer> {
    if (!params.branding) {
      throw new Error("[CertificateService] Missing required branding for course certificate generation");
    }

    const brandedOrgName = params.branding.orgName;
    const logoUrl = params.branding.logoUrl;
    const primaryColor = params.branding.primaryColor;
    const secondaryColor = params.branding.secondaryColor;
    const accentColor = params.branding.accentColor;
    const readablePrimary = ensureReadableOnDark(primaryColor, "#9ed4ff");
    const readableSecondary = ensureReadableOnDark(secondaryColor);
    const readableAccent = ensureReadableOnDark(accentColor, "#ffe9a6");
    const readableMuted = "#d9dfec";

    // Fetch logo image if available
    let logoBuffer: Buffer | null = null;
    logoBuffer = await fetchSafeLogoBuffer(logoUrl, "course certificate");
    if (logoBuffer) {
      console.log(`[CertificateService] Fetched org logo for course certificate (${logoBuffer.length} bytes)`);
    }

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        layout: "landscape",
        size: "A4",
        bufferPages: true, // Enable buffer to control page count
      });

      const chunks: Buffer[] = [];

      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const width = doc.page.width;
      const height = doc.page.height;

      // === PREMIUM GRADIENT BACKGROUND (uses branding-derived dark base) ===
      // Very dark base - 10% brightness
      const darkBase = darkenHexColor(primaryColor, 0.10);
      doc.rect(0, 0, width, height).fill(darkBase);

      // Premium gradient layers
      const centerX = width / 2;
      const centerY = height / 2;
      doc.circle(centerX, centerY, 450).fill(darkenHexColor(primaryColor, 0.14));
      doc.circle(centerX, centerY, 350).fill(darkenHexColor(primaryColor, 0.20));

      // === DOUBLE GOLD BORDER FRAME ===
      const margin = 20;

      // Outer platinum glow
      doc
        .lineWidth(10)
        .strokeOpacity(0.4)
        .strokeColor(secondaryColor)
        .rect(margin, margin, width - margin * 2, height - margin * 2)
        .stroke();

      // Main gold border
      doc
        .lineWidth(4)
        .strokeOpacity(0.9)
        .strokeColor(accentColor)
        .rect(
          margin + 8,
          margin + 8,
          width - (margin + 8) * 2,
          height - (margin + 8) * 2
        )
        .stroke();

      // Inner accent line
      doc
        .lineWidth(1)
        .strokeOpacity(0.6)
        .strokeColor("#ffffff")
        .rect(
          margin + 14,
          margin + 14,
          width - (margin + 14) * 2,
          height - (margin + 14) * 2
        )
        .stroke();

      // === DECORATIVE CORNER FLOURISHES ===
      const cornerSize = 50;
      const cornerOffset = margin + 20;

      doc.lineWidth(3).strokeColor(accentColor).strokeOpacity(0.8);

      // Top-left corner
      doc
        .moveTo(cornerOffset, cornerOffset + cornerSize)
        .lineTo(cornerOffset, cornerOffset)
        .lineTo(cornerOffset + cornerSize, cornerOffset)
        .stroke();

      // Top-right corner
      doc
        .moveTo(width - cornerOffset - cornerSize, cornerOffset)
        .lineTo(width - cornerOffset, cornerOffset)
        .lineTo(width - cornerOffset, cornerOffset + cornerSize)
        .stroke();

      // Bottom-left corner
      doc
        .moveTo(cornerOffset, height - cornerOffset - cornerSize)
        .lineTo(cornerOffset, height - cornerOffset)
        .lineTo(cornerOffset + cornerSize, height - cornerOffset)
        .stroke();

      // Bottom-right corner
      doc
        .moveTo(width - cornerOffset - cornerSize, height - cornerOffset)
        .lineTo(width - cornerOffset, height - cornerOffset)
        .lineTo(width - cornerOffset, height - cornerOffset - cornerSize)
        .stroke();

      // === ORG LOGO BADGE AT TOP ===
      doc.circle(centerX, 75, 55).fillAndStroke(primaryColor, "#ffffff");
      doc.circle(centerX, 75, 45).fillAndStroke(secondaryColor, primaryColor);
      doc.circle(centerX, 75, 38).fillAndStroke(darkenHexColor(primaryColor, 0.15), primaryColor); // 15% brightness for innermost

      // Embed org logo if available
      if (logoBuffer) {
        try {
          drawCircularLogo(doc, logoBuffer, centerX, 75, 62);
          doc.lineWidth(2).strokeColor("#ffffff").circle(centerX, 75, 31).stroke();
        } catch (imgError) {
          console.warn('[CertificateService] Failed to embed logo in course cert PDF:', imgError);
        }
      }

      // === HEADER - "COURSE MASTERY" ===
      doc.fillOpacity(1);
      
      // Organization branding name at top-right for stronger visual hierarchy
      doc
        .fontSize(30)
        .fillColor("#ffffff")
        .font("Helvetica-Bold")
        .text(brandedOrgName.toUpperCase(), width - 360, 46, {
          align: "right",
          width: 320,
          characterSpacing: 1.5,
        });

      doc
        .fontSize(18)
        .fillColor(readableAccent)
        .font("Helvetica-Bold")
        .text("★ PRESTIGIOUS ACHIEVEMENT ★", 0, 115, {
          align: "center",
          width: width,
          characterSpacing: 3,
        });

      doc
        .fontSize(48)
        .fillColor("#ffffff")
        .font("Helvetica-Bold")
        .text("COURSE COMPLETION", 0, 140, { align: "center", width: width });

      doc
        .fontSize(14)
        .fillColor(readableSecondary)
        .font("Helvetica")
        .text("CERTIFICATE OF COMPLETION", 0, 195, {
          align: "center",
          width: width,
          characterSpacing: 2,
        });

      // === CENTRAL AWARD PANEL ===
      const cardY = 225;
      const cardHeight = 110;
      const cardMargin = 120;

      // Card glow effect
      doc
        .roundedRect(
          cardMargin - 4,
          cardY - 4,
          width - cardMargin * 2 + 8,
          cardHeight + 8,
          10
        )
        .fillOpacity(0.25)
        .fill(accentColor);

      // Card background
      doc
        .roundedRect(
          cardMargin,
          cardY,
          width - cardMargin * 2,
          cardHeight,
          10
        )
        .fillOpacity(0.15)
        .fillAndStroke("#ffffff", accentColor);

      // "This certifies that" text
      doc
        .fontSize(13)
        .fillOpacity(1)
        .fillColor(readableMuted)
        .font("Helvetica")
        .text("This certifies that", 0, cardY + 18, {
          align: "center",
          width: width,
        });

      // Learner name (hero text)
      doc
        .fontSize(36)
        .fillColor("#ffffff")
        .font("Helvetica-Bold")
        .text(params.learnerName, 0, cardY + 42, {
          align: "center",
          width: width,
        });

      // Achievement subtitle
      doc
        .fontSize(13)
        .fillColor(readableAccent)
        .font("Helvetica")
        .text("has met all the requirements", 0, cardY + 85, {
          align: "center",
          width: width,
        });

      // === COURSE TITLE SECTION ===
      const courseY = 355;

      doc
        .fontSize(13)
        .fillColor(readableMuted)
        .font("Helvetica")
        .text("by successfully completing all assessments in", 0, courseY, {
          align: "center",
          width: width,
        });

      // Truncate course title if too long
      const maxCourseTitleLen = 55;
      const displayCourseTitle = params.courseTitle.length > maxCourseTitleLen
        ? params.courseTitle.substring(0, maxCourseTitleLen - 3) + '...'
        : params.courseTitle;

      doc
        .fontSize(20)
        .fillColor(readablePrimary)
        .font("Helvetica-Bold")
        .text(`"${displayCourseTitle}"`, 50, courseY + 20, {
          align: "center",
          width: width - 100,
          lineBreak: false, // Prevent wrapping
        });

      // === INSTRUCTOR & CREATOR SECTION (combined, compact) ===
      // Render instructor and creator org info on separate lines with proper spacing
      const instructorY = courseY + 50;
      let nextY = instructorY;

      // Combine instructor and creator org on separate lines
      if (params.instructorName && params.creatorOrganizationName) {
        // Both present - show on two separate lines
        doc
          .fontSize(11)
          .fillColor(readablePrimary)
          .font("Helvetica-Bold")
          .text(`Course Instructor: ${params.instructorName}`, 0, instructorY, {
            align: "center",
            width: width,
          });

        doc
          .fontSize(11)
          .fillColor(readableSecondary)
          .font("Helvetica-Bold")
          .text(`Created by: ${params.creatorOrganizationName}`, 0, instructorY + 16, {
            align: "center",
            width: width,
          });
        
        nextY = instructorY + 38;
      } else if (params.instructorName) {
        // Only instructor
        doc
          .fontSize(10)
          .fillColor(readableMuted)
          .font("Helvetica")
          .text("Course Instructor", 0, instructorY, {
            align: "center",
            width: width,
          });

        doc
          .fontSize(14)
          .fillColor(readablePrimary)
          .font("Helvetica-Bold")
          .text(params.instructorName, 0, instructorY + 14, {
            align: "center",
            width: width,
          });
        
        nextY = instructorY + 32;
      } else if (params.creatorOrganizationName) {
        // Only creator org
        doc
          .fontSize(10)
          .fillColor(readableMuted)
          .font("Helvetica")
          .text("Created by", 0, instructorY, {
            align: "center",
            width: width,
          });

        doc
          .fontSize(14)
          .fillColor(readableSecondary)
          .font("Helvetica-Bold")
          .text(params.creatorOrganizationName, 0, instructorY + 14, {
            align: "center",
            width: width,
          });
        
        nextY = instructorY + 32;
      }

      // === FOOTER SECTION (dynamic position based on content above) ===
      // A4 landscape height is 595.28, position footer with enough spacing
      const footerBaseY = Math.max(nextY + 25, 460); // Ensure minimum position with more spacing

      doc
        .fontSize(11)
        .fillColor(readableMuted)
        .font("Helvetica")
        .text(brandedOrgName, 0, footerBaseY, {
          align: "center",
          width: width,
        });

      doc
        .fontSize(10)
        .fillColor(readableMuted)
        .text(
          params.completedAt.toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          }),
          0,
          footerBaseY + 14,
          { align: "center", width: width }
        );

      // === CERTIFICATE ID (compact footer - no verification URL to keep single page) ===
      const certFooterY = footerBaseY + 28;
      
      doc
        .fontSize(10)
        .fillColor(readablePrimary)
        .font("Helvetica-Bold")
        .text(`Certificate ID: ${params.certificateId}`, 0, certFooterY, {
          align: "center",
          width: width,
        });

      // Finalize PDF - single page guaranteed
      doc.end();
    });
  }

  /**
   * Generate social sharing token and update shared platforms
   * SECURITY: Verifies ownership using display certificateId (CERT-...)
   */
  static async generateSocialShare(
    displayCertificateId: string,
    userId: string,
    platforms: ("linkedin" | "twitter" | "facebook")[]
  ): Promise<{
    shareToken: string;
    shareUrl: string;
  }> {
    // Find certificate and verify ownership using display certificateId
    const [cert] = await db
      .select()
      .from(certificates)
      .where(
        and(
          eq(certificates.certificateId, displayCertificateId), // SECURITY FIX: Use display ID
          eq(certificates.userId, userId) // SECURITY FIX: Verify ownership
        )
      )
      .limit(1);

    if (!cert) {
      // Return 403-style error to distinguish from 404
      const error = new Error(`Certificate not found or access denied`);
      (error as any).statusCode = 403;
      throw error;
    }

    // Generate share token if doesn't exist
    let shareToken = cert.shareToken;
    if (!shareToken) {
      shareToken = randomBytes(16).toString('hex');
    }

    // Update shared platforms (merge with existing)
    const existingPlatforms = (cert.sharedPlatforms as string[]) || [];
    const mergedPlatforms = Array.from(new Set([...existingPlatforms, ...platforms]));

    await db
      .update(certificates)
      .set({
        shareToken,
        sharedPlatforms: mergedPlatforms as any,
      })
      .where(eq(certificates.id, cert.id)); // FIX: Use cert.id not undefined certificateId

    const shareUrl = `${getBaseUrl()}/certificates/shared/${shareToken}`;

    console.log(`[CertificateService] Generated share token for certificate ${cert.certificateId}`);

    return { shareToken, shareUrl };
  }

  /**
   * Get certificate by display certificateId (for viewing/downloading)
   * @param displayCertificateId - The public certificate ID (e.g., CERT-123)
   * @param userId - User ID for ownership verification
   */
  static async getCertificateById(
    displayCertificateId: string,
    userId: string
  ): Promise<Certificate | null> {
    const [cert] = await db
      .select()
      .from(certificates)
      .where(
        and(
          eq(certificates.certificateId, displayCertificateId), // FIX: Query by display ID
          eq(certificates.userId, userId)
        )
      )
      .limit(1);

    return cert || null;
  }

  /**
   * List all course certificates for a user.
   */
  static async listCertificatesForUser(
    userId: string,
    limit = 50,
    offset = 0
  ): Promise<{ certificates: Certificate[]; total: number }> {
    // Simple query - show all certificates for the user
    // Certificate validity is verified at issuance time, not display time
    const result = await db.execute<Certificate & { total_count: string }>(sql`
      SELECT 
        c.*,
        COUNT(*) OVER() as total_count
      FROM certificates c
      WHERE c."userId" = ${userId}
        AND c."certificateType" = 'course'
      ORDER BY c."completedAt" DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `);

    const rows = result.rows as any[];
    
    if (rows.length === 0) {
      return { certificates: [], total: 0 };
    }

    const total = parseInt(rows[0].total_count);
    const certs: Certificate[] = rows.map(row => {
      const { total_count, ...cert } = row;
      return cert as Certificate;
    });

    return {
      certificates: certs,
      total,
    };
  }

  /**
   * Get certificate by share token (for public viewing)
   */
  static async getCertificateByShareToken(shareToken: string): Promise<Certificate | null> {
    const [cert] = await db
      .select()
      .from(certificates)
      .where(eq(certificates.shareToken, shareToken))
      .limit(1);

    return cert || null;
  }

  /**
   * Verify certificate by certificateId (public endpoint)
   */
  static async verifyCertificate(certificateId: string): Promise<Certificate | null> {
    const [cert] = await db
      .select()
      .from(certificates)
      .where(eq(certificates.certificateId, certificateId))
      .limit(1);

    return cert || null;
  }
}
