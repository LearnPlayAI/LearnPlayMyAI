/**
 * Feature Flags Configuration Module (Hybrid Architecture)
 * 
 * Centralized control for license system with hierarchical flag management.
 * Master kill switch overrides all specific flags for safe emergency disablement.
 * 
 * Exclusion Model (Blacklist Approach):
 * - All organizations have license features ENABLED by default
 * - Only organizations explicitly added to the exclusion list are disabled
 * - This inverts the traditional rollout/whitelist approach
 * 
 * Architecture:
 * 1. Database Overrides: SuperAdmin runtime controls (highest priority)
 * 2. Environment Variables: Production baseline / fallback defaults
 * 3. Audit Logging: Complete change history
 * 
 * Environment Variables (fallback when no DB override):
 * - ENABLE_LICENSE_SYSTEM: Master kill switch (default: false)
 * - ENABLE_LICENSE_MIDDLEWARE: License enforcement middleware (default: false)
 * - ENABLE_LICENSE_UI: License management pages (default: false)
 * - ENABLE_LICENSE_PAYMENTS: License purchase flows (default: false)
 * - LICENSE_EXCLUDED_ORG_IDS: Comma-separated org IDs to EXCLUDE (default: empty = all enabled)
 * - LICENSE_BETA_USERS: Comma-separated user IDs for beta testing (default: empty)
 */

import { db } from '../db.js';
import { licenseFlagOverrides, licenseRolloutOrganizations, licenseRolloutBetaUsers } from '@shared/schema.js';
import { eq, gt, and, lt, isNotNull } from 'drizzle-orm';

export interface FeatureFlags {
  // Master kill switch - disables entire license system
  licenseSystemEnabled: boolean;
  
  // Individual feature toggles
  licenseMiddlewareEnabled: boolean;
  licenseUIEnabled: boolean;
  licensePaymentsEnabled: boolean;
  
  // Exclusion controls (blacklist approach - all orgs enabled by default, explicit exclusions only)
  excludedOrgIds: Set<string>;
  betaUserIds: Set<string>;
  
  // Source tracking (for operational visibility)
  _sources: {
    licenseSystemEnabled: 'env' | 'db';
    licenseMiddlewareEnabled: 'env' | 'db';
    licenseUIEnabled: 'env' | 'db';
    licensePaymentsEnabled: 'env' | 'db';
  };
}

export class FeatureFlagConfig {
  private static instance: FeatureFlagConfig | null = null;
  private static initPromise: Promise<FeatureFlagConfig> | null = null;
  private flags: FeatureFlags;
  private initialized: boolean = false;

  private constructor() {
    this.flags = this.getDefaultFlags();
  }

  /**
   * Async initialization - load flags from DB and env
   */
  static async getInstance(): Promise<FeatureFlagConfig> {
    if (!FeatureFlagConfig.instance) {
      if (!FeatureFlagConfig.initPromise) {
        FeatureFlagConfig.initPromise = (async () => {
          const config = new FeatureFlagConfig();
          await config.initialize();
          FeatureFlagConfig.instance = config;
          return config;
        })();
      }
      return FeatureFlagConfig.initPromise;
    }
    return FeatureFlagConfig.instance;
  }

  /**
   * Sync method for backwards compatibility (returns cached instance if available)
   */
  static getInstanceSync(): FeatureFlagConfig {
    if (!FeatureFlagConfig.instance) {
      throw new Error('FeatureFlagConfig not initialized. Call getInstance() first.');
    }
    return FeatureFlagConfig.instance;
  }

  /**
   * Initialize flags from database and environment
   */
  private async initialize(): Promise<void> {
    this.flags = await this.loadFlags();
    this.validateFlags();
    this.logFlags();
    this.initialized = true;
  }

  /**
   * Get default flags (used during initialization)
   */
  private getDefaultFlags(): FeatureFlags {
    return {
      licenseSystemEnabled: false,
      licenseMiddlewareEnabled: false,
      licenseUIEnabled: false,
      licensePaymentsEnabled: false,
      excludedOrgIds: new Set(),
      betaUserIds: new Set(),
      _sources: {
        licenseSystemEnabled: 'env',
        licenseMiddlewareEnabled: 'env',
        licenseUIEnabled: 'env',
        licensePaymentsEnabled: 'env',
      },
    };
  }

  /**
   * Load feature flags from database (priority) and environment variables (fallback)
   */
  private async loadFlags(): Promise<FeatureFlags> {
    // Clean up expired overrides BEFORE loading (prevents stale data)
    await this.cleanupExpiredOverrides();

    // Parse boolean flags with safe defaults
    const parseBool = (value: string | undefined, defaultValue: boolean = false): boolean => {
      if (value === undefined || value === '') return defaultValue;
      return value.toLowerCase() === 'true';
    };

    // Parse comma-separated ID lists
    const parseIdList = (value: string | undefined): Set<string> => {
      if (!value || value.trim() === '') return new Set();
      return new Set(value.split(',').map(id => id.trim()).filter(id => id.length > 0));
    };

    // Fetch database overrides (now guaranteed fresh after cleanup)
    const dbOverrides = await db.query.licenseFlagOverrides.findMany().catch((error) => {
      console.error('[FeatureFlags] Failed to load database overrides:', error);
      return []; // Fall back to env vars on DB error
    });

    // Build override map
    const overrideMap = new Map<string, boolean>();
    dbOverrides.forEach(override => {
      overrideMap.set(override.flagKey, override.value);
    });

    // Fetch excluded organizations from database (blacklist approach)
    const dbExcludedOrgs = await db.query.licenseRolloutOrganizations.findMany().catch(() => []);
    const dbExcludedOrgIds = new Set(dbExcludedOrgs.map(org => org.organizationId));

    // Fetch beta user list from database
    const dbBetaUsers = await db.query.licenseRolloutBetaUsers.findMany().catch(() => []);
    const dbUserIds = new Set(dbBetaUsers.map(user => user.userId));

    // Helper to get flag value (DB override > env var)
    const getFlag = (
      dbKey: string,
      envVar: string | undefined,
      defaultValue: boolean = false
    ): { value: boolean; source: 'env' | 'db' } => {
      if (overrideMap.has(dbKey)) {
        return { value: overrideMap.get(dbKey)!, source: 'db' };
      }
      return { value: parseBool(envVar, defaultValue), source: 'env' };
    };

    // Load flags with source tracking
    const masterFlag = getFlag('licenseSystemEnabled', process.env.ENABLE_LICENSE_SYSTEM, false);
    const middlewareFlag = getFlag('licenseMiddlewareEnabled', process.env.ENABLE_LICENSE_MIDDLEWARE, false);
    const uiFlag = getFlag('licenseUIEnabled', process.env.ENABLE_LICENSE_UI, false);
    const paymentsFlag = getFlag('licensePaymentsEnabled', process.env.ENABLE_LICENSE_PAYMENTS, false);

    // Merge database and environment exclusion controls (blacklist approach)
    const envExcludedOrgIds = parseIdList(process.env.LICENSE_EXCLUDED_ORG_IDS);
    const envUserIds = parseIdList(process.env.LICENSE_BETA_USERS);
    
    const excludedOrgIds = new Set([...Array.from(dbExcludedOrgIds), ...Array.from(envExcludedOrgIds)]);
    const betaUserIds = new Set([...Array.from(dbUserIds), ...Array.from(envUserIds)]);

    return {
      licenseSystemEnabled: masterFlag.value,
      // Hierarchical control: specific flags only active if master is enabled
      licenseMiddlewareEnabled: masterFlag.value && middlewareFlag.value,
      licenseUIEnabled: masterFlag.value && uiFlag.value,
      licensePaymentsEnabled: masterFlag.value && paymentsFlag.value,
      excludedOrgIds,
      betaUserIds,
      _sources: {
        licenseSystemEnabled: masterFlag.source,
        licenseMiddlewareEnabled: middlewareFlag.source,
        licenseUIEnabled: uiFlag.source,
        licensePaymentsEnabled: paymentsFlag.source,
      },
    };
  }

  /**
   * Validate feature flag configuration
   */
  private validateFlags(): void {
    const warnings: string[] = [];

    // Warn if specific flags enabled without master switch
    if (!this.flags.licenseSystemEnabled) {
      if (process.env.ENABLE_LICENSE_MIDDLEWARE === 'true') {
        warnings.push('ENABLE_LICENSE_MIDDLEWARE is true but master switch ENABLE_LICENSE_SYSTEM is false');
      }
      if (process.env.ENABLE_LICENSE_UI === 'true') {
        warnings.push('ENABLE_LICENSE_UI is true but master switch ENABLE_LICENSE_SYSTEM is false');
      }
      if (process.env.ENABLE_LICENSE_PAYMENTS === 'true') {
        warnings.push('ENABLE_LICENSE_PAYMENTS is true but master switch ENABLE_LICENSE_SYSTEM is false');
      }
    }

    // Warn if excluded IDs specified but system disabled
    if (!this.flags.licenseSystemEnabled && this.flags.excludedOrgIds.size > 0) {
      warnings.push(`LICENSE_EXCLUDED_ORG_IDS has ${this.flags.excludedOrgIds.size} orgs but license system is disabled`);
    }

    // Log warnings
    if (warnings.length > 0) {
      console.warn('[FeatureFlags] Configuration warnings:');
      warnings.forEach(w => console.warn(`  ⚠️  ${w}`));
    }
  }

  /**
   * Log current feature flag state for operational visibility
   */
  private logFlags(): void {
    const formatFlag = (enabled: boolean, source: 'env' | 'db'): string => {
      const status = enabled ? '✅ ENABLED' : '❌ DISABLED';
      const sourceLabel = source === 'db' ? ' [DB Override]' : ' [Env Var]';
      return `${status}${sourceLabel}`;
    };

    console.log('[FeatureFlags] License System Configuration (Hybrid Mode):');
    console.log(`  Master Switch: ${formatFlag(this.flags.licenseSystemEnabled, this.flags._sources.licenseSystemEnabled)}`);
    console.log(`  Middleware Enforcement: ${formatFlag(this.flags.licenseMiddlewareEnabled, this.flags._sources.licenseMiddlewareEnabled)}`);
    console.log(`  UI Pages: ${formatFlag(this.flags.licenseUIEnabled, this.flags._sources.licenseUIEnabled)}`);
    console.log(`  Payment Flows: ${formatFlag(this.flags.licensePaymentsEnabled, this.flags._sources.licensePaymentsEnabled)}`);
    
    if (this.flags.excludedOrgIds.size > 0) {
      console.log(`  Excluded Orgs: ${this.flags.excludedOrgIds.size} organizations`);
    }
    
    if (this.flags.betaUserIds.size > 0) {
      console.log(`  Beta Users: ${this.flags.betaUserIds.size} users`);
    }

    if (!this.flags.licenseSystemEnabled) {
      console.log('  ℹ️  License system is DISABLED - all license features are inactive');
    }
  }

  /**
   * Get current feature flags
   */
  getFlags(): Readonly<FeatureFlags> {
    return this.flags;
  }

  /**
   * Check if license system is enabled for a specific organization
   * Uses blacklist approach: all orgs enabled by default, explicit exclusions only
   */
  isEnabledForOrg(organizationId: string | null | undefined): boolean {
    if (!this.flags.licenseSystemEnabled) return false;
    
    // If no org specified, default to enabled
    if (!organizationId) return true;
    
    // Blacklist: enabled UNLESS org is in the excluded list
    return !this.flags.excludedOrgIds.has(organizationId);
  }

  /**
   * Check if license system is enabled for a specific user
   */
  isEnabledForUser(userId: string | null | undefined): boolean {
    if (!this.flags.licenseSystemEnabled) return false;
    
    // If no beta list specified, skip user-level filtering
    if (this.flags.betaUserIds.size === 0) return true;
    
    // Otherwise, check if user is in beta list
    if (!userId) return false;
    return this.flags.betaUserIds.has(userId);
  }

  /**
   * Check if middleware enforcement is active
   */
  isMiddlewareEnabled(): boolean {
    return this.flags.licenseMiddlewareEnabled;
  }

  /**
   * Check if license UI pages are enabled
   */
  isUIEnabled(): boolean {
    return this.flags.licenseUIEnabled;
  }

  /**
   * Check if license payment flows are enabled
   */
  arePaymentsEnabled(): boolean {
    return this.flags.licensePaymentsEnabled;
  }

  /**
   * Clean up expired database overrides and rollout entries
   */
  private async cleanupExpiredOverrides(): Promise<void> {
    try {
      const now = new Date();
      
      // Cleanup expired flag overrides
      await db.delete(licenseFlagOverrides).where(
        and(
          isNotNull(licenseFlagOverrides.expiresAt),
          lt(licenseFlagOverrides.expiresAt, now)
        )
      );
      
      // Cleanup expired rollout organizations
      await db.delete(licenseRolloutOrganizations).where(
        and(
          isNotNull(licenseRolloutOrganizations.expiresAt),
          lt(licenseRolloutOrganizations.expiresAt, now)
        )
      );
      
      // Cleanup expired beta users
      await db.delete(licenseRolloutBetaUsers).where(
        and(
          isNotNull(licenseRolloutBetaUsers.expiresAt),
          lt(licenseRolloutBetaUsers.expiresAt, now)
        )
      );
    } catch (error) {
      console.error('[FeatureFlags] Failed to cleanup expired overrides:', error);
      // Non-fatal - continue with load
    }
  }

  /**
   * Reload flags from database and environment (for runtime updates)
   */
  async reload(): Promise<void> {
    this.flags = await this.loadFlags();
    this.validateFlags();
    this.logFlags();
    console.log('[FeatureFlags] Configuration reloaded from database and environment');
  }

  /**
   * Get human-readable status summary
   */
  getStatusSummary(): string {
    if (!this.flags.licenseSystemEnabled) {
      return 'License system is completely disabled';
    }

    const enabledFeatures: string[] = [];
    if (this.flags.licenseMiddlewareEnabled) enabledFeatures.push('middleware');
    if (this.flags.licenseUIEnabled) enabledFeatures.push('UI');
    if (this.flags.licensePaymentsEnabled) enabledFeatures.push('payments');

    if (enabledFeatures.length === 0) {
      return 'License system enabled but no features active';
    }

    let summary = `License system active: ${enabledFeatures.join(', ')}`;
    
    if (this.flags.excludedOrgIds.size > 0) {
      summary += ` (${this.flags.excludedOrgIds.size} orgs excluded)`;
    }

    return summary;
  }
}

/**
 * Initialize feature flags asynchronously
 * MUST be called during server startup
 */
export async function initializeFeatureFlags(): Promise<void> {
  await FeatureFlagConfig.getInstance();
}

/**
 * Get initialized feature flags singleton
 * Throws if called before initializeFeatureFlags()
 */
export function getFeatureFlags(): FeatureFlagConfig {
  return FeatureFlagConfig.getInstanceSync();
}
