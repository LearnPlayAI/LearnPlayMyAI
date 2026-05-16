import { db } from '../db';
import { eq, and, desc, asc, sql, or } from 'drizzle-orm';
import {
  businessPackages,
  businessPackagePrices,
  packageChangeEvents,
  userOrganizationRoles,
  lessonCreditPricingSettings,
  organizationPackageOverrides,
  organizationPackageAssignments,
  BusinessPackage,
  InsertBusinessPackage,
  BusinessPackagePrice,
  InsertBusinessPackagePrice,
  OrganizationPackageOverride,
} from '@shared/schema';

export class BusinessPackageService {
  // === PACKAGE CRUD ===

  async getAllPackages(includeInactive = false): Promise<BusinessPackage[]> {
    try {
      if (includeInactive) {
        return await db
          .select()
          .from(businessPackages)
          .orderBy(asc(businessPackages.displayOrder));
      }
      return await db
        .select()
        .from(businessPackages)
        .where(eq(businessPackages.isActive, true))
        .orderBy(asc(businessPackages.displayOrder));
    } catch (error) {
      console.error('[BusinessPackageService] Error getting all packages:', error);
      throw error;
    }
  }

  async getPackageById(packageId: string): Promise<BusinessPackage | null> {
    try {
      const [pkg] = await db
        .select()
        .from(businessPackages)
        .where(eq(businessPackages.id, packageId))
        .limit(1);
      return pkg || null;
    } catch (error) {
      console.error('[BusinessPackageService] Error getting package by ID:', error);
      throw error;
    }
  }

  async getPackageByTier(tier: string): Promise<BusinessPackage | null> {
    try {
      const [pkg] = await db
        .select()
        .from(businessPackages)
        .where(eq(businessPackages.tier, tier))
        .limit(1);
      return pkg || null;
    } catch (error) {
      console.error('[BusinessPackageService] Error getting package by tier:', error);
      throw error;
    }
  }

  async createPackage(data: InsertBusinessPackage, userId: string): Promise<BusinessPackage> {
    try {
      const [pkg] = await db
        .insert(businessPackages)
        .values({
          ...data,
          createdBy: userId,
          updatedBy: userId,
        })
        .returning();

      await this.logPackageChange(
        'package_created',
        pkg.id,
        null,
        null,
        pkg,
        userId
      );

      return pkg;
    } catch (error) {
      console.error('[BusinessPackageService] Error creating package:', error);
      throw error;
    }
  }

  async updatePackage(
    packageId: string,
    data: Partial<InsertBusinessPackage>,
    userId: string
  ): Promise<BusinessPackage> {
    try {
      const previousPkg = await this.getPackageById(packageId);
      
      const [pkg] = await db
        .update(businessPackages)
        .set({
          ...data,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(businessPackages.id, packageId))
        .returning();

      await this.logPackageChange(
        'package_updated',
        packageId,
        null,
        previousPkg,
        pkg,
        userId
      );

      return pkg;
    } catch (error) {
      console.error('[BusinessPackageService] Error updating package:', error);
      throw error;
    }
  }

  async deletePackage(packageId: string, userId: string): Promise<void> {
    try {
      const previousPkg = await this.getPackageById(packageId);

      await db
        .update(businessPackages)
        .set({
          isActive: false,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(businessPackages.id, packageId));

      await this.logPackageChange(
        'package_deleted',
        packageId,
        null,
        previousPkg,
        { isActive: false },
        userId
      );
    } catch (error) {
      console.error('[BusinessPackageService] Error deleting package:', error);
      throw error;
    }
  }

  // === PRICING CRUD ===

  async getPackagePrices(packageId: string): Promise<BusinessPackagePrice[]> {
    try {
      return await db
        .select()
        .from(businessPackagePrices)
        .where(eq(businessPackagePrices.packageId, packageId));
    } catch (error) {
      console.error('[BusinessPackageService] Error getting package prices:', error);
      throw error;
    }
  }

  async getPackagePrice(packageId: string, currency: string): Promise<BusinessPackagePrice | null> {
    try {
      const [price] = await db
        .select()
        .from(businessPackagePrices)
        .where(
          and(
            eq(businessPackagePrices.packageId, packageId),
            eq(businessPackagePrices.currency, currency as any)
          )
        )
        .limit(1);
      return price || null;
    } catch (error) {
      console.error('[BusinessPackageService] Error getting package price:', error);
      throw error;
    }
  }

  async upsertPackagePrice(data: InsertBusinessPackagePrice, userId: string): Promise<BusinessPackagePrice> {
    try {
      const existingPrice = await this.getPackagePrice(data.packageId, data.currency);

      if (existingPrice) {
        const [price] = await db
          .update(businessPackagePrices)
          .set({
            ...data,
            updatedBy: userId,
            updatedAt: new Date(),
          })
          .where(eq(businessPackagePrices.id, existingPrice.id))
          .returning();

        await this.logPackageChange(
          'price_updated',
          data.packageId,
          null,
          existingPrice,
          price,
          userId
        );

        return price;
      } else {
        const [price] = await db
          .insert(businessPackagePrices)
          .values({
            ...data,
            createdBy: userId,
            updatedBy: userId,
          })
          .returning();

        await this.logPackageChange(
          'price_created',
          data.packageId,
          null,
          null,
          price,
          userId
        );

        return price;
      }
    } catch (error) {
      console.error('[BusinessPackageService] Error upserting package price:', error);
      throw error;
    }
  }

  async updatePackagePriceById(
    priceId: string, 
    packageId: string,
    data: Partial<InsertBusinessPackagePrice>, 
    userId: string
  ): Promise<BusinessPackagePrice> {
    try {
      const [existingPrice] = await db
        .select()
        .from(businessPackagePrices)
        .where(eq(businessPackagePrices.id, priceId))
        .limit(1);

      if (!existingPrice) {
        throw new Error('Price not found');
      }

      if (existingPrice.packageId !== packageId) {
        throw new Error('Price does not belong to this package');
      }

      const [updatedPrice] = await db
        .update(businessPackagePrices)
        .set({
          pricePerLearner: data.pricePerLearner ?? existingPrice.pricePerLearner,
          pricePerTeacher: data.pricePerTeacher ?? existingPrice.pricePerTeacher,
          pricePerOrgAdmin: data.pricePerOrgAdmin ?? existingPrice.pricePerOrgAdmin,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(businessPackagePrices.id, priceId))
        .returning();

      await this.logPackageChange(
        'price_updated',
        packageId,
        null,
        { priceId, currency: existingPrice.currency },
        { priceId, ...data },
        userId
      );

      return updatedPrice;
    } catch (error) {
      console.error('[BusinessPackageService] Error updating package price by ID:', error);
      throw error;
    }
  }

  async deletePackagePrice(priceId: string): Promise<void> {
    try {
      await db
        .delete(businessPackagePrices)
        .where(eq(businessPackagePrices.id, priceId));
    } catch (error) {
      console.error('[BusinessPackageService] Error deleting package price:', error);
      throw error;
    }
  }

  // === ELIGIBILITY & SEAT VALIDATION ===

  async getOrganizationUserCounts(organizationId: string): Promise<{
    learners: number;
    teachers: number;
    orgAdmins: number;
  }> {
    try {
      // Use DISTINCT userId to prevent double-counting users with multiple role entries
      const roleResults = await db
        .select({
          role: userOrganizationRoles.role,
          count: sql<number>`count(DISTINCT ${userOrganizationRoles.userId})::int`,
        })
        .from(userOrganizationRoles)
        .where(eq(userOrganizationRoles.organizationId, organizationId))
        .groupBy(userOrganizationRoles.role);

      let learners = 0;
      let teachers = 0;
      let orgAdmins = 0;

      for (const result of roleResults) {
        if (result.role === 'learner' || result.role === 'student') {
          learners += result.count;
        } else if (result.role === 'teacher') {
          teachers += result.count;
        } else if (result.role === 'org_admin') {
          orgAdmins += result.count;
        }
      }

      return { learners, teachers, orgAdmins };
    } catch (error) {
      console.error('[BusinessPackageService] Error getting organization user counts:', error);
      throw error;
    }
  }

  async checkPackageEligibility(
    organizationId: string,
    packageId: string
  ): Promise<{
    eligible: boolean;
    currentLearners: number;
    currentTeachers: number;
    currentOrgAdmins: number;
    packageLimits: { maxLearners: number; maxTeachers: number; maxOrgAdmins: number };
    issues: string[];
  }> {
    try {
      const [pkg, userCounts] = await Promise.all([
        this.getPackageById(packageId),
        this.getOrganizationUserCounts(organizationId),
      ]);

      if (!pkg) {
        return {
          eligible: false,
          currentLearners: userCounts.learners,
          currentTeachers: userCounts.teachers,
          currentOrgAdmins: userCounts.orgAdmins,
          packageLimits: { maxLearners: 0, maxTeachers: 0, maxOrgAdmins: 0 },
          issues: ['Package not found'],
        };
      }

      const issues: string[] = [];

      if (userCounts.learners > pkg.maxLearners) {
        issues.push(
          `Current learner count (${userCounts.learners}) exceeds package limit (${pkg.maxLearners})`
        );
      }

      if (userCounts.teachers > pkg.maxTeachers) {
        issues.push(
          `Current teacher count (${userCounts.teachers}) exceeds package limit (${pkg.maxTeachers})`
        );
      }

      if (userCounts.orgAdmins > pkg.maxOrgAdmins) {
        issues.push(
          `Current org admin count (${userCounts.orgAdmins}) exceeds package limit (${pkg.maxOrgAdmins})`
        );
      }

      return {
        eligible: issues.length === 0,
        currentLearners: userCounts.learners,
        currentTeachers: userCounts.teachers,
        currentOrgAdmins: userCounts.orgAdmins,
        packageLimits: {
          maxLearners: pkg.maxLearners,
          maxTeachers: pkg.maxTeachers,
          maxOrgAdmins: pkg.maxOrgAdmins,
        },
        issues,
      };
    } catch (error) {
      console.error('[BusinessPackageService] Error checking package eligibility:', error);
      throw error;
    }
  }

  async getEligiblePackagesForOrg(
    organizationId: string,
    currency?: string
  ): Promise<Array<BusinessPackage & { prices: BusinessPackagePrice[] }>> {
    try {
      const [packages, userCounts] = await Promise.all([
        this.getAllPackages(false),
        this.getOrganizationUserCounts(organizationId),
      ]);

      const eligiblePackages: Array<BusinessPackage & { prices: BusinessPackagePrice[] }> = [];

      for (const pkg of packages) {
        const isEligible =
          userCounts.learners <= pkg.maxLearners &&
          userCounts.teachers <= pkg.maxTeachers &&
          userCounts.orgAdmins <= pkg.maxOrgAdmins;

        if (isEligible) {
          let prices: BusinessPackagePrice[];
          if (currency) {
            const price = await this.getPackagePrice(pkg.id, currency);
            prices = price ? [price] : [];
          } else {
            prices = await this.getPackagePrices(pkg.id);
          }

          eligiblePackages.push({
            ...pkg,
            prices,
          });
        }
      }

      return eligiblePackages;
    } catch (error) {
      console.error('[BusinessPackageService] Error getting eligible packages for org:', error);
      throw error;
    }
  }

  // === COURSE ESTIMATE CALCULATION ===

  async calculateCourseEstimate(monthlyCredits: number): Promise<{
    withImages: { min: number; max: number };
    withoutImages: { min: number; max: number };
  }> {
    try {
      const [settings] = await db
        .select()
        .from(lessonCreditPricingSettings)
        .limit(1);

      const lessonsPerCourse = 6;

      const textOnlyMin = settings?.creditsPerLessonTextOnlyMin ?? 40;
      const textOnlyMax = settings?.creditsPerLessonTextOnlyMax ?? 90;
      const withImagesMin = settings?.creditsPerLessonWithImagesMin ?? 140;
      const withImagesMax = settings?.creditsPerLessonWithImagesMax ?? 290;

      const coursesWithoutImagesMax = Math.floor(monthlyCredits / (lessonsPerCourse * textOnlyMin));
      const coursesWithoutImagesMin = Math.floor(monthlyCredits / (lessonsPerCourse * textOnlyMax));

      const coursesWithImagesMax = Math.floor(monthlyCredits / (lessonsPerCourse * withImagesMin));
      const coursesWithImagesMin = Math.floor(monthlyCredits / (lessonsPerCourse * withImagesMax));

      return {
        withImages: {
          min: coursesWithImagesMin,
          max: coursesWithImagesMax,
        },
        withoutImages: {
          min: coursesWithoutImagesMin,
          max: coursesWithoutImagesMax,
        },
      };
    } catch (error) {
      console.error('[BusinessPackageService] Error calculating course estimate:', error);
      throw error;
    }
  }

  // === EFFECTIVE PACKAGE RESOLUTION ===

  /**
   * Get the effective package for an organization, considering any active overrides.
   * Returns a merged package where override values take precedence over base package values.
   */
  async getEffectivePackageForOrg(organizationId: string): Promise<{
    package: BusinessPackage | null;
    override: OrganizationPackageOverride | null;
    effectiveLimits: {
      maxLearners: number;
      maxTeachers: number;
      maxOrgAdmins: number;
      monthlyCredits: number;
    };
    effectivePricing: {
      ZAR: { learner: number; teacher: number; orgAdmin: number } | null;
      USD: { learner: number; teacher: number; orgAdmin: number } | null;
      EUR: { learner: number; teacher: number; orgAdmin: number } | null;
    };
    discountPercentage: number;
    source: 'override' | 'package' | 'default';
  }> {
    try {
      // 1. Get the org's active override
      const [override] = await db
        .select()
        .from(organizationPackageOverrides)
        .where(and(
          eq(organizationPackageOverrides.organizationId, organizationId),
          eq(organizationPackageOverrides.isActive, true),
          or(
            sql`${organizationPackageOverrides.validUntil} IS NULL`,
            sql`${organizationPackageOverrides.validUntil} > NOW()`
          )
        ))
        .limit(1);

      // 2. Get the org's assigned package
      const [assignment] = await db
        .select()
        .from(organizationPackageAssignments)
        .where(and(
          eq(organizationPackageAssignments.organizationId, organizationId),
          eq(organizationPackageAssignments.status, 'active')
        ))
        .limit(1);

      const pkg = assignment ? await this.getPackageById(assignment.packageId) : null;

      // 3. Merge override values with package values
      // Override values take precedence, then package values, then defaults
      const effectiveLimits = {
        maxLearners: override?.maxLearners ?? pkg?.maxLearners ?? 5,
        maxTeachers: override?.maxTeachers ?? pkg?.maxTeachers ?? 2,
        maxOrgAdmins: override?.maxOrgAdmins ?? pkg?.maxOrgAdmins ?? 1,
        monthlyCredits: override?.monthlyCredits ?? pkg?.monthlyCredits ?? 100,
      };

      // Get discount percentage from override (0 if not set)
      const discountPercentage = override?.discountPercentage ?? 0;

      // Helper to parse decimal string to number
      const parseDecimal = (value: string | null | undefined): number | null => {
        if (value === null || value === undefined) return null;
        const parsed = parseFloat(value);
        return isNaN(parsed) ? null : parsed;
      };

      // Helper to apply discount percentage
      const applyDiscount = (price: number): number => {
        if (discountPercentage === 0) return price;
        return price * (1 - discountPercentage / 100);
      };

      // 4. Build effective pricing for each currency
      // Priority: override custom pricing > package pricing with discount applied
      const buildEffectivePricing = async (currency: 'ZAR' | 'USD' | 'EUR'): Promise<{ learner: number; teacher: number; orgAdmin: number } | null> => {
        // Check for override custom pricing first
        const overrideLearner = currency === 'ZAR' ? override?.pricePerLearnerZAR :
                                currency === 'USD' ? override?.pricePerLearnerUSD :
                                override?.pricePerLearnerEUR;
        const overrideTeacher = currency === 'ZAR' ? override?.pricePerTeacherZAR :
                                currency === 'USD' ? override?.pricePerTeacherUSD :
                                override?.pricePerTeacherEUR;
        const overrideOrgAdmin = currency === 'ZAR' ? override?.pricePerOrgAdminZAR :
                                 currency === 'USD' ? override?.pricePerOrgAdminUSD :
                                 override?.pricePerOrgAdminEUR;

        const parsedOverrideLearner = parseDecimal(overrideLearner);
        const parsedOverrideTeacher = parseDecimal(overrideTeacher);
        const parsedOverrideOrgAdmin = parseDecimal(overrideOrgAdmin);

        // If override has all prices for this currency, use them (no discount applied to override pricing)
        if (parsedOverrideLearner !== null && parsedOverrideTeacher !== null && parsedOverrideOrgAdmin !== null) {
          return {
            learner: parsedOverrideLearner,
            teacher: parsedOverrideTeacher,
            orgAdmin: parsedOverrideOrgAdmin,
          };
        }

        // Otherwise, get package pricing and apply discount
        if (pkg) {
          const packagePrice = await this.getPackagePrice(pkg.id, currency);
          if (packagePrice) {
            const baseLearner = parseDecimal(packagePrice.pricePerLearner);
            const baseTeacher = parseDecimal(packagePrice.pricePerTeacher);
            const baseOrgAdmin = parseDecimal(packagePrice.pricePerOrgAdmin);

            if (baseLearner !== null && baseTeacher !== null && baseOrgAdmin !== null) {
              return {
                learner: parsedOverrideLearner ?? applyDiscount(baseLearner),
                teacher: parsedOverrideTeacher ?? applyDiscount(baseTeacher),
                orgAdmin: parsedOverrideOrgAdmin ?? applyDiscount(baseOrgAdmin),
              };
            }
          }
        }

        return null;
      };

      // Build pricing for all currencies
      const [zarPricing, usdPricing, eurPricing] = await Promise.all([
        buildEffectivePricing('ZAR'),
        buildEffectivePricing('USD'),
        buildEffectivePricing('EUR'),
      ]);

      const effectivePricing = {
        ZAR: zarPricing,
        USD: usdPricing,
        EUR: eurPricing,
      };

      // Determine source
      const source: 'override' | 'package' | 'default' = override ? 'override' : (pkg ? 'package' : 'default');

      return {
        package: pkg,
        override: override || null,
        effectiveLimits,
        effectivePricing,
        discountPercentage,
        source,
      };
    } catch (error) {
      console.error('[BusinessPackageService] Error getting effective package for org:', error);
      throw error;
    }
  }

  // === AUDIT LOGGING ===

  async logPackageChange(
    changeType: string,
    packageId: string | null,
    organizationId: string | null,
    previousValues: any,
    newValues: any,
    userId: string,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    try {
      await db.insert(packageChangeEvents).values({
        packageId,
        organizationId,
        changeType: changeType as any,
        previousValues,
        newValues,
        changedBy: userId,
        ipAddress,
        userAgent,
      });
    } catch (error) {
      console.error('[BusinessPackageService] Error logging package change:', error);
    }
  }
}

export const businessPackageService = new BusinessPackageService();
