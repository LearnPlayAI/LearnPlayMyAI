/**
 * Shared Resources for Route Modules
 * 
 * This module provides shared configurations, utilities, and service instances
 * that are reused across domain routers to prevent duplicate instantiation.
 */

import multer from "multer";
import { ObjectStorageService } from "../objectStorage";
import { storage, ADMIN_ROLES, INSTRUCTOR_ROLES, LEARNER_ROLES, ALL_STAFF_ROLES } from "../storage";
import { GammaService } from "../services/gammaService";
import { GammaThemeSyncService } from "../services/gammaThemeSyncService";
import { GammaImageStyleService } from "../services/gammaImageStyleService";
import { performanceMonitor } from "../monitoring/performanceMonitor";

// Shared multer configurations

/**
 * Memory storage multer for image uploads (gamma themes, avatars, etc.)
 * Max 5MB for images
 */
export const imageUploadMulter = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}. Only JPEG, PNG, GIF, and WebP are allowed.`));
    }
  },
});

/**
 * Memory storage multer for document uploads (PPTX, DOCX, PDF)
 * No shared hard size cap; individual routes apply their own limits where needed.
 */
export const documentUploadMulter = multer({
  storage: multer.memoryStorage(),
});

// Shared service instances (singletons)

/**
 * Object Storage Service instance - shared across routes
 */
export const objectStorageService = new ObjectStorageService();

/**
 * Gamma Theme Sync Service instance
 */
export const gammaThemeSyncService = new GammaThemeSyncService();

/**
 * Gamma Image Style Service instance
 */
export const gammaImageStyleService = new GammaImageStyleService();

// Re-export storage and role constants for convenience
export { storage, ADMIN_ROLES, INSTRUCTOR_ROLES, LEARNER_ROLES, ALL_STAFF_ROLES };

// Re-export performance monitor
export { performanceMonitor };

// Re-export commonly used middleware from shared.ts
export {
  configureSession,
  optionalAuth,
  getEffectiveOrganizationId,
  getEffectiveOrganization,
  isImpersonating,
  isAdmin,
  isAuthenticated,
  isSuperAdmin,
  isTeacherOrAdmin,
  validateJoinRequestAccess,
  checkQuizCreationLimit,
  checkAIExplanationLimit,
  checkConcurrentUserLimit,
  trackUserLogin,
  trackUserLogout,
  resetDailyLimitsForAllOrgs,
  resolveEffectiveOrganization,
  type SessionContext,
  type SessionOrganization,
  type SessionSubscription,
  type UserPreferences,
  type EffectiveOrganizationResult,
  type RequestWithEffectiveOrg,
} from "./shared";

// Re-export session auth middleware
export {
  withOrgContext,
  requireRole,
  requireSubscription,
  withSessionAuthMiddleware,
  type RequestWithOrgContext,
} from "../middleware/sessionAuthMiddleware";

// Re-export org isolation middleware
export {
  enforceOrgIsolation,
  enforceOrgIsolationWithSuperAdminBypass,
} from "../middleware/orgIsolationMiddleware";

// Utility functions

/**
 * Standard error response helper
 */
export function sendErrorResponse(res: any, status: number, message: string, details?: any) {
  const response: any = { error: message };
  if (details) {
    response.details = details;
  }
  return res.status(status).json(response);
}

/**
 * Async handler wrapper to catch errors
 */
export function asyncHandler(fn: Function) {
  return (req: any, res: any, next: any) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
