import { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { eq, and } from 'drizzle-orm';
import * as schema from '@shared/schema';
import { seatPolicyService } from '../services/seatPolicyService';

export async function checkTrialLockout(req: Request, res: Response, next: NextFunction) {
  if (!req.session?.userId) {
    return next();
  }

  try {
    const userRoles = await db.select({
      organizationId: schema.userOrganizationRoles.organizationId,
      role: schema.userOrganizationRoles.role,
    })
      .from(schema.userOrganizationRoles)
      .where(eq(schema.userOrganizationRoles.userId, req.session.userId));

    for (const userRole of userRoles) {
      const limits = await seatPolicyService.getEffectiveSeatLimits(userRole.organizationId);
      
      if (limits.isUnlimited || limits.canLogin) {
        continue;
      }

      if (limits.reason === 'trial_expired') {
        if (['learner', 'student'].includes(userRole.role)) {
          return res.status(403).json({
            error: 'Trial expired',
            message: 'Your organization\'s trial has expired. Please contact your administrator to subscribe.',
            trialExpired: true,
            isLearner: true,
          });
        }
        (req as any).trialExpired = true;
      }
    }

    next();
  } catch (err) {
    console.error('[TrialLockout] Error:', err);
    next();
  }
}
