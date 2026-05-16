import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { eq, and, sql } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { db } from '../db';
import { enterpriseCustomers, enterpriseKeyring, users } from '@shared/schema';
import { getBaseUrl } from '../config/base-url';
import { MailerSendService } from '../services/mailerSendService';
import { EmailVerificationService } from '../services/emailVerificationService';
import { buildProvisionBundle } from '../services/keyringService';
import { SessionContextService } from '../services/sessionContextService';
import { isFeatureEnabled } from '../featureFlags';

declare module 'express-session' {
  interface SessionData {
    enterpriseCustomerId?: string;
    isEnterprise?: boolean;
  }
}

const enterpriseRegisterSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  companyName: z.string().min(1, 'Company name is required'),
  contactPersonName: z.string().min(1, 'Contact person name is required'),
  contactEmail: z.string().email('Invalid contact email address'),
  contactMobile: z.string().optional(),
  companyAddress: z.string().optional(),
  country: z.string().optional(),
});

const enterpriseLoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const enterpriseForgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

const enterpriseResetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

function hashToken(token: string): string {
  const secret = process.env.EMAIL_VERIFICATION_SECRET || process.env.SESSION_SECRET || 'dev-only-insecure-secret';
  return crypto
    .createHmac('sha256', secret)
    .update(token)
    .digest('hex');
}

function generateVerificationToken(): { token: string; hashedToken: string; expiresAt: Date } {
  const token = crypto.randomBytes(32).toString('hex');
  const hashedToken = hashToken(token);
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 24);
  return { token, hashedToken, expiresAt };
}

function generatePasswordResetToken(): { token: string; hashedToken: string; expiresAt: Date } {
  const token = crypto.randomBytes(32).toString('hex');
  const hashedToken = hashToken(token);
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + 1);
  return { token, hashedToken, expiresAt };
}

function stripPasswordHash(customer: any) {
  const { passwordHash, ...rest } = customer;
  return rest;
}

async function checkSessionSuperAdmin(req: Request): Promise<boolean> {
  if ((req as any)._isSuperAdminChecked !== undefined) {
    return (req as any)._isSuperAdminChecked;
  }
  const userId = req.session?.userId;
  if (!userId) {
    (req as any)._isSuperAdminChecked = false;
    return false;
  }
  try {
    const [user] = await db.select({ isSuperAdmin: users.isSuperAdmin }).from(users).where(eq(users.id, userId)).limit(1);
    const result = !!user?.isSuperAdmin;
    (req as any)._isSuperAdminChecked = result;
    return result;
  } catch {
    (req as any)._isSuperAdminChecked = false;
    return false;
  }
}

export async function requireEnterpriseAuth(req: Request, res: Response, next: NextFunction) {
  if (req.session?.enterpriseCustomerId) {
    return next();
  }
  const superAdmin = await checkSessionSuperAdmin(req);
  if (superAdmin) {
    return next();
  }
  return res.status(401).json({ error: 'Enterprise authentication required' });
}

export function createEnterpriseAuthRouter(): Router {
  const router = Router();

  if (process.env.ONPREM_MODE === 'true') {
    return router;
  }

  router.post("/api/enterprise/auth/register", async (req: Request, res: Response) => {
    try {
      const validatedData = enterpriseRegisterSchema.parse(req.body);
      const normalizedEmail = validatedData.email.trim().toLowerCase();
      const normalizedCompanyName = validatedData.companyName.trim().toLowerCase();

      const [existing] = await db
        .select({ id: enterpriseCustomers.id })
        .from(enterpriseCustomers)
        .where(sql`lower(trim(${enterpriseCustomers.email})) = ${normalizedEmail}`)
        .limit(1);

      if (existing) {
        return res.status(409).json({
          error: 'An account with this email already exists. Please login or use a different email.',
          errorType: 'email_taken'
        });
      }

      const [duplicateCompany] = await db
        .select({ id: enterpriseCustomers.id, companyName: enterpriseCustomers.companyName })
        .from(enterpriseCustomers)
        .where(and(
          sql`lower(trim(${enterpriseCustomers.companyName})) = ${normalizedCompanyName}`,
          sql`${enterpriseCustomers.parentEnterpriseId} IS NULL`
        ))
        .limit(1);

      if (duplicateCompany) {
        return res.status(409).json({
          error: 'A customer with this company name already exists. Please contact support to link or merge accounts.',
          errorType: 'company_duplicate'
        });
      }

      const passwordHash = await bcrypt.hash(validatedData.password, 12);
      const { token, hashedToken, expiresAt } = generateVerificationToken();

      const [customer] = await db
        .insert(enterpriseCustomers)
        .values({
          email: normalizedEmail,
          passwordHash,
          companyName: validatedData.companyName.trim(),
          contactPersonName: validatedData.contactPersonName.trim(),
          contactEmail: validatedData.contactEmail.trim().toLowerCase(),
          contactMobile: validatedData.contactMobile?.trim() || null,
          companyAddress: validatedData.companyAddress?.trim() || null,
          country: validatedData.country?.trim() || null,
          status: 'pending',
          emailVerified: false,
          emailVerificationToken: hashedToken,
          emailVerificationExpiry: expiresAt,
        })
        .returning();

      let emailSent = false;
      try {
        const baseUrl = getBaseUrl();
        const verificationUrl = `${baseUrl}/enterprise/verify-email?token=${token}`;
        await MailerSendService.sendEmailVerificationEmail({
          to: validatedData.email,
          userName: validatedData.contactPersonName,
          verificationUrl,
          expiresIn: '24 hours'
        });
        emailSent = true;
        console.log(`[EnterpriseAuth] Verification email sent to ${validatedData.email}`);
      } catch (emailError) {
        console.error('[EnterpriseAuth] Failed to send verification email:', emailError);
      }

      res.status(201).json({
        message: emailSent
          ? 'Registration successful! Please check your email to verify your account.'
          : 'Registration successful! Please login to access your account. You can request a verification email later.',
        customer: { id: customer.id, email: customer.email, companyName: customer.companyName },
        emailVerificationSent: emailSent,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: error.errors[0].message,
          errorType: 'validation_error'
        });
      }
      console.error('[EnterpriseAuth] Registration error:', error);
      res.status(500).json({
        error: 'Registration failed. Please try again.',
        errorType: 'server_error'
      });
    }
  });

  router.post("/api/enterprise/auth/login", async (req: Request, res: Response) => {
    try {
      const { email, password } = enterpriseLoginSchema.parse(req.body);
      const normalizedEmail = email.trim().toLowerCase();

      const [customer] = await db
        .select()
        .from(enterpriseCustomers)
        .where(eq(enterpriseCustomers.email, normalizedEmail))
        .limit(1);

      if (customer) {
        if (!customer.emailVerified) {
          return res.status(403).json({
            error: 'Email not verified',
            message: 'Please verify your email address before logging in. Check your inbox for the verification link.',
            errorType: 'email_not_verified'
          });
        }

        if (customer.status === 'suspended') {
          return res.status(403).json({
            error: 'Account suspended',
            message: 'Your enterprise account has been suspended. Please contact support.',
            errorType: 'account_suspended'
          });
        }

        const isValidPassword = await bcrypt.compare(password, customer.passwordHash);
        if (isValidPassword) {
          req.session.enterpriseCustomerId = customer.id;
          req.session.isEnterprise = true;
          return req.session.save((saveError) => {
            if (saveError) {
              console.error('[EnterpriseAuth] Failed to persist enterprise session:', saveError);
              return res.status(500).json({ error: 'Login failed. Please try again.' });
            }
            return res.json({
              message: 'Login successful',
              customer: stripPasswordHash(customer),
              isSuperAdmin: false,
            });
          });
        }
      }

      // SuperAdmin fallback: allow platform SuperAdmin credentials directly in enterprise portal login.
      const [platformUser] = await db
        .select({
          id: users.id,
          gamerName: users.gamerName,
          email: users.email,
          password: users.password,
          isSuperAdmin: users.isSuperAdmin,
          isDisabled: users.isDisabled,
          isLocked: users.isLocked,
        })
        .from(users)
        .where(eq(users.email, normalizedEmail))
        .limit(1);

      if (
        platformUser &&
        platformUser.isSuperAdmin &&
        !platformUser.isDisabled &&
        !platformUser.isLocked &&
        await bcrypt.compare(password, platformUser.password)
      ) {
        req.session.userId = platformUser.id;
        req.session.user = {
          id: platformUser.id,
          gamerName: platformUser.gamerName,
          email: platformUser.email,
          role: 'superadmin',
          isSuperAdmin: true,
        };
        delete req.session.enterpriseCustomerId;
        delete req.session.isEnterprise;
        if (isFeatureEnabled('SESSION_AUTH_ENABLED')) {
          try {
            req.session.context = await SessionContextService.buildSessionContext(platformUser.id);
          } catch (ctxError) {
            console.error('[EnterpriseAuth] Failed to build session context for SuperAdmin enterprise login:', ctxError);
          }
        }

        return req.session.save((saveError) => {
          if (saveError) {
            console.error('[EnterpriseAuth] Failed to persist superadmin session:', saveError);
            return res.status(500).json({ error: 'Login failed. Please try again.' });
          }
          return res.json({
            message: 'Login successful',
            isSuperAdmin: true,
            customer: null,
          });
        });
      }

      return res.status(401).json({ error: 'Invalid credentials' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: error.errors[0].message,
          errorType: 'validation_error'
        });
      }
      console.error('[EnterpriseAuth] Login error:', error);
      res.status(500).json({
        error: 'Login failed. Please try again.',
        errorType: 'server_error'
      });
    }
  });

  router.post("/api/enterprise/auth/forgot-password", async (req: Request, res: Response) => {
    try {
      const { email } = enterpriseForgotPasswordSchema.parse(req.body);
      const normalizedEmail = email.trim().toLowerCase();

      const [customer] = await db
        .select()
        .from(enterpriseCustomers)
        .where(eq(enterpriseCustomers.email, normalizedEmail))
        .limit(1);

      if (customer && customer.emailVerified && customer.status !== 'suspended') {
        const { token, hashedToken, expiresAt } = generatePasswordResetToken();

        await db
          .update(enterpriseCustomers)
          .set({
            emailVerificationToken: hashedToken,
            emailVerificationExpiry: expiresAt,
            updatedAt: new Date(),
          })
          .where(eq(enterpriseCustomers.id, customer.id));

        try {
          const baseUrl = getBaseUrl();
          const resetUrl = `${baseUrl}/enterprise/reset-password?token=${token}`;
          await MailerSendService.sendPasswordResetEmail({
            to: customer.email,
            userName: customer.contactPersonName || 'Enterprise User',
            resetUrl,
            expiresIn: '1 hour',
          });
        } catch (emailError) {
          console.error('[EnterpriseAuth] Failed to send password reset email:', emailError);
        }
      }

      return res.json({
        message: 'If an account with that email exists, a password reset link has been sent.',
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: error.errors[0].message,
          errorType: 'validation_error'
        });
      }
      console.error('[EnterpriseAuth] Forgot password error:', error);
      return res.status(500).json({
        error: 'Failed to process forgot password request.',
        errorType: 'server_error'
      });
    }
  });

  router.post("/api/enterprise/auth/reset-password", async (req: Request, res: Response) => {
    try {
      const { token, password } = enterpriseResetPasswordSchema.parse(req.body);
      const normalizedToken = token.trim().replace(/\s+/g, '');
      const hashedToken = hashToken(normalizedToken);
      const now = new Date();

      const [customer] = await db
        .select()
        .from(enterpriseCustomers)
        .where(
          and(
            eq(enterpriseCustomers.emailVerificationToken, hashedToken),
            sql`${enterpriseCustomers.emailVerificationExpiry} > ${now}`
          )
        )
        .limit(1);

      if (!customer) {
        return res.status(400).json({
          error: 'Invalid or expired password reset token.',
          errorType: 'invalid_token'
        });
      }

      const passwordHash = await bcrypt.hash(password, 12);

      await db
        .update(enterpriseCustomers)
        .set({
          passwordHash,
          emailVerificationToken: null,
          emailVerificationExpiry: null,
          updatedAt: new Date(),
        })
        .where(eq(enterpriseCustomers.id, customer.id));

      try {
        await MailerSendService.sendPasswordResetConfirmation({
          to: customer.email,
          userName: customer.contactPersonName || 'Enterprise User',
        });
      } catch (emailError) {
        console.error('[EnterpriseAuth] Failed to send password reset confirmation:', emailError);
      }

      return res.json({ message: 'Password reset successful. Please sign in.' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: error.errors[0].message,
          errorType: 'validation_error'
        });
      }
      console.error('[EnterpriseAuth] Reset password error:', error);
      return res.status(500).json({
        error: 'Failed to reset password.',
        errorType: 'server_error'
      });
    }
  });

  router.post("/api/enterprise/auth/logout", async (req: Request, res: Response) => {
    try {
      const isSuperAdmin = await checkSessionSuperAdmin(req);
      if (isSuperAdmin) {
        delete req.session.enterpriseCustomerId;
        delete req.session.isEnterprise;
        return res.json({ message: 'Enterprise session ended. Returning to admin portal.', returnToAdmin: true });
      }
      
      req.session.destroy((err) => {
        if (err) {
          console.error('[EnterpriseAuth] Logout error:', err);
          return res.status(500).json({ error: 'Logout failed' });
        }
        res.json({ message: 'Logged out successfully' });
      });
    } catch (error) {
      console.error('[EnterpriseAuth] Logout error:', error);
      res.status(500).json({ error: 'Logout failed' });
    }
  });

  router.get("/api/enterprise/auth/verify-email", async (req: Request, res: Response) => {
    try {
      const { token } = req.query;

      if (!token || typeof token !== 'string') {
        return res.status(400).json({ error: 'Verification token is required' });
      }

      const hashedToken = hashToken(token);
      const now = new Date();

      const [customer] = await db
        .select()
        .from(enterpriseCustomers)
        .where(
          and(
            eq(enterpriseCustomers.emailVerificationToken, hashedToken),
            sql`${enterpriseCustomers.emailVerificationExpiry} > ${now}`
          )
        )
        .limit(1);

      if (!customer) {
        return res.status(400).json({
          error: 'Invalid or expired verification token',
          errorType: 'invalid_token'
        });
      }

      if (customer.emailVerified) {
        return res.json({
          message: 'Email has already been verified',
          alreadyVerified: true,
          redirectTo: '/enterprise/login'
        });
      }

      await db
        .update(enterpriseCustomers)
        .set({
          emailVerified: true,
          emailVerificationToken: null,
          emailVerificationExpiry: null,
          accountActivatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(enterpriseCustomers.id, customer.id));

      console.log(`[EnterpriseAuth] Email verified for enterprise customer ${customer.id}`);

      res.json({
        message: 'Email verified successfully! You can now log in.',
        verified: true,
        redirectTo: '/enterprise/login'
      });
    } catch (error) {
      console.error('[EnterpriseAuth] Email verification error:', error);
      res.status(500).json({
        error: 'Email verification failed. Please try again.',
        errorType: 'server_error'
      });
    }
  });

  router.post("/api/enterprise/auth/resend-verification", async (req: Request, res: Response) => {
    try {
      const { email } = z.object({ email: z.string().email() }).parse(req.body);

      const [customer] = await db
        .select()
        .from(enterpriseCustomers)
        .where(eq(enterpriseCustomers.email, email))
        .limit(1);

      if (!customer) {
        return res.json({ message: 'If an account with that email exists, a verification email has been sent.' });
      }

      if (customer.emailVerified) {
        return res.json({ message: 'Email is already verified. Please login.' });
      }

      const now = new Date();
      const hasValidToken =
        !!customer.emailVerificationToken &&
        !!customer.emailVerificationExpiry &&
        customer.emailVerificationExpiry > now;

      if (hasValidToken) {
        const recentlySent = await EmailVerificationService.hasRecentVerificationEmail(customer.email, 24);
        if (recentlySent) {
          return res.json({
            message: 'Verification email was already sent recently. Please check your inbox and spam folder before requesting another.',
          });
        }
      }

      const { token, hashedToken, expiresAt } = generateVerificationToken();

      await db
        .update(enterpriseCustomers)
        .set({
          emailVerificationToken: hashedToken,
          emailVerificationExpiry: expiresAt,
          updatedAt: new Date(),
        })
        .where(eq(enterpriseCustomers.id, customer.id));

      try {
        const baseUrl = getBaseUrl();
        const verificationUrl = `${baseUrl}/enterprise/verify-email?token=${token}`;
        await MailerSendService.sendEmailVerificationEmail({
          to: customer.email,
          userName: customer.contactPersonName || 'Enterprise User',
          verificationUrl,
          expiresIn: '24 hours'
        });
        console.log(`[EnterpriseAuth] Resent verification email to ${customer.email}`);
      } catch (emailError) {
        console.error('[EnterpriseAuth] Failed to resend verification email:', emailError);
      }

      res.json({ message: 'If an account with that email exists, a verification email has been sent.' });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: error.errors[0].message,
          errorType: 'validation_error'
        });
      }
      console.error('[EnterpriseAuth] Resend verification error:', error);
      res.status(500).json({
        error: 'Failed to resend verification email. Please try again.',
        errorType: 'server_error'
      });
    }
  });

  router.get("/api/enterprise/auth/me", async (req: Request, res: Response) => {
    try {
      const isSuperAdmin = await checkSessionSuperAdmin(req);

      if (req.session?.enterpriseCustomerId) {
        const [customer] = await db
          .select()
          .from(enterpriseCustomers)
          .where(eq(enterpriseCustomers.id, req.session.enterpriseCustomerId))
          .limit(1);

        if (!customer) {
          delete req.session.enterpriseCustomerId;
          delete req.session.isEnterprise;
          return res.status(401).json({ error: 'Enterprise authentication required' });
        }

        const { passwordHash, ...customerData } = customer;
        return res.json({
          customer: customerData,
          isSuperAdmin,
          isImpersonating: isSuperAdmin
        });
      }

      if (isSuperAdmin) {
        return res.json({
          customer: null,
          isSuperAdmin: true,
          isImpersonating: false,
          needsCustomerSelection: false
        });
      }

      return res.status(401).json({ error: 'Enterprise authentication required' });
    } catch (error) {
      console.error('[EnterpriseAuth] Get current user error:', error);
      res.status(500).json({
        error: 'Failed to get user information.',
        errorType: 'server_error'
      });
    }
  });

  router.get("/api/enterprise/keys", requireEnterpriseAuth, async (req: Request, res: Response) => {
    try {
      const [customer] = await db
        .select()
        .from(enterpriseCustomers)
        .where(eq(enterpriseCustomers.id, req.session.enterpriseCustomerId!))
        .limit(1);

      if (!customer) {
        return res.status(404).json({ error: 'Enterprise customer not found' });
      }

      const keys = await db
        .select({
          id: enterpriseKeyring.id,
          keyId: enterpriseKeyring.keyId,
          purpose: enterpriseKeyring.purpose,
          keyVersion: enterpriseKeyring.keyVersion,
          isActive: enterpriseKeyring.isActive,
          createdAt: enterpriseKeyring.createdAt,
          retiredAt: enterpriseKeyring.retiredAt,
        })
        .from(enterpriseKeyring)
        .where(eq(enterpriseKeyring.enterpriseCustomerId, req.session.enterpriseCustomerId!));

      res.json({ keys });
    } catch (error) {
      console.error('[Enterprise] Get keys error:', error);
      res.status(500).json({
        error: 'Failed to retrieve keys.',
        errorType: 'server_error'
      });
    }
  });

  router.get("/api/enterprise/keys/download", requireEnterpriseAuth, async (req: Request, res: Response) => {
    try {
      const [customer] = await db
        .select()
        .from(enterpriseCustomers)
        .where(eq(enterpriseCustomers.id, req.session.enterpriseCustomerId!))
        .limit(1);

      if (!customer) {
        return res.status(404).json({ error: 'Enterprise customer not found' });
      }

      const bundle = await buildProvisionBundle(req.session.enterpriseCustomerId!);

      res.setHeader('Content-Disposition', `attachment; filename="provision-bundle-${customer.id}.json"`);
      res.setHeader('Content-Type', 'application/json');
      res.json(bundle);
    } catch (error) {
      console.error('[Enterprise] Download provision bundle error:', error);
      res.status(500).json({
        error: 'Failed to download provision bundle.',
        errorType: 'server_error'
      });
    }
  });

  router.post("/api/enterprise/auth/impersonate", async (req: Request, res: Response) => {
    try {
      const isSuperAdmin = await checkSessionSuperAdmin(req);
      if (!isSuperAdmin) {
        return res.status(403).json({ error: 'SuperAdmin access required' });
      }

      const { enterpriseCustomerId } = req.body;
      if (!enterpriseCustomerId) {
        return res.status(400).json({ error: 'Enterprise customer ID required' });
      }

      const [customer] = await db
        .select()
        .from(enterpriseCustomers)
        .where(eq(enterpriseCustomers.id, enterpriseCustomerId))
        .limit(1);

      if (!customer) {
        return res.status(404).json({ error: 'Enterprise customer not found' });
      }

      req.session.enterpriseCustomerId = customer.id;
      req.session.isEnterprise = true;

      res.json({
        success: true,
        customer: {
          id: customer.id,
          companyName: customer.companyName,
          email: customer.email
        }
      });
    } catch (error) {
      console.error('[EnterpriseAuth] Impersonate error:', error);
      res.status(500).json({ error: 'Failed to impersonate customer' });
    }
  });

  router.post("/api/enterprise/auth/end-impersonation", async (req: Request, res: Response) => {
    try {
      const isSuperAdmin = await checkSessionSuperAdmin(req);
      if (!isSuperAdmin) {
        return res.status(403).json({ error: 'SuperAdmin access required' });
      }

      delete req.session.enterpriseCustomerId;
      delete req.session.isEnterprise;

      res.json({ success: true });
    } catch (error) {
      console.error('[EnterpriseAuth] End impersonation error:', error);
      res.status(500).json({ error: 'Failed to end impersonation' });
    }
  });

  router.get("/api/enterprise/auth/customers", async (req: Request, res: Response) => {
    try {
      const isSuperAdmin = await checkSessionSuperAdmin(req);
      if (!isSuperAdmin) {
        return res.status(403).json({ error: 'SuperAdmin access required' });
      }

      const customers = await db
        .select({
          id: enterpriseCustomers.id,
          companyName: enterpriseCustomers.companyName,
          email: enterpriseCustomers.email,
          status: enterpriseCustomers.status,
          emailVerified: enterpriseCustomers.emailVerified,
          contactPersonName: enterpriseCustomers.contactPersonName,
        })
        .from(enterpriseCustomers)
        .where(sql`${enterpriseCustomers.parentEnterpriseId} IS NULL`)
        .orderBy(enterpriseCustomers.companyName);

      res.json({ customers });
    } catch (error) {
      console.error('[EnterpriseAuth] List customers error:', error);
      res.status(500).json({ error: 'Failed to list customers' });
    }
  });

  return router;
}
