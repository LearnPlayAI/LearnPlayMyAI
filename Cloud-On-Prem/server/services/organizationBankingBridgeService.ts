import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db } from "../db";
import * as schema from "@shared/schema";
import {
  decryptBankAccountNumber,
  encryptBankAccountNumber,
} from "../utils/bankingDetailsCrypto";

type UpsertBankingInput = {
  organizationId: string;
  bankName: string;
  accountNumber: string;
  branchCode?: string | null;
  accountHolderName: string;
  updatedByUserId?: string | null;
};

export type UnifiedBankingDetails = {
  id: string;
  organizationId: string;
  bankName: string | null;
  accountNumber: string;
  branchCode: string | null;
  accountHolderName: string | null;
  isVerified: boolean;
  verifiedAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
};

export class OrganizationBankingBridgeService {
  static async getByOrganizationId(
    organizationId: string,
  ): Promise<UnifiedBankingDetails | null> {
    const [legacy, canonical] = await Promise.all([
      db.query.organizationBankDetails.findFirst({
        where: eq(schema.organizationBankDetails.organizationId, organizationId),
      }),
      db.query.organizationBankingDetails.findFirst({
        where: eq(schema.organizationBankingDetails.organizationId, organizationId),
      }),
    ]);

    const source = canonical || legacy;
    if (!source) return null;

    return {
      id: source.id,
      organizationId,
      bankName: canonical?.bankName ?? legacy?.bankName ?? null,
      accountNumber: decryptBankAccountNumber(
        canonical?.accountNumber ?? legacy?.accountNumber ?? "",
      ),
      branchCode: canonical?.branchCode ?? legacy?.branchCode ?? null,
      accountHolderName:
        canonical?.accountHolderName ?? legacy?.accountHolderName ?? null,
      isVerified: legacy?.isVerified ?? false,
      verifiedAt: legacy?.verifiedAt ?? null,
      createdAt: (source as any).createdAt ?? null,
      updatedAt: (source as any).updatedAt ?? null,
    };
  }

  static async upsertForOrganization(
    input: UpsertBankingInput,
  ): Promise<UnifiedBankingDetails> {
    const now = new Date();
    const encryptedAccountNumber = encryptBankAccountNumber(input.accountNumber);

    const [legacyExisting, canonicalExisting] = await Promise.all([
      db.query.organizationBankDetails.findFirst({
        where: eq(schema.organizationBankDetails.organizationId, input.organizationId),
      }),
      db.query.organizationBankingDetails.findFirst({
        where: eq(
          schema.organizationBankingDetails.organizationId,
          input.organizationId,
        ),
      }),
    ]);

    if (legacyExisting) {
      await db
        .update(schema.organizationBankDetails)
        .set({
          bankName: input.bankName,
          accountNumber: encryptedAccountNumber,
          branchCode: input.branchCode ?? null,
          accountHolderName: input.accountHolderName,
          updatedAt: now,
        })
        .where(eq(schema.organizationBankDetails.organizationId, input.organizationId));
    } else {
      await db.insert(schema.organizationBankDetails).values({
        id: crypto.randomUUID(),
        organizationId: input.organizationId,
        bankName: input.bankName,
        accountNumber: encryptedAccountNumber,
        branchCode: input.branchCode ?? null,
        accountHolderName: input.accountHolderName,
        isVerified: false,
        createdAt: now,
        updatedAt: now,
      });
    }

    if (canonicalExisting) {
      await db
        .update(schema.organizationBankingDetails)
        .set({
          bankName: input.bankName,
          accountNumber: encryptedAccountNumber,
          branchCode: input.branchCode ?? null,
          accountHolderName: input.accountHolderName,
          updatedAt: now,
          updatedBy: input.updatedByUserId ?? null,
        })
        .where(
          eq(schema.organizationBankingDetails.organizationId, input.organizationId),
        );
    } else {
      await db.insert(schema.organizationBankingDetails).values({
        id: crypto.randomUUID(),
        organizationId: input.organizationId,
        bankName: input.bankName,
        accountNumber: encryptedAccountNumber,
        branchCode: input.branchCode ?? null,
        accountHolderName: input.accountHolderName,
        createdAt: now,
        updatedAt: now,
        updatedBy: input.updatedByUserId ?? null,
      } as any);
    }

    const resolved = await this.getByOrganizationId(input.organizationId);
    if (!resolved) {
      throw new Error("Failed to persist banking details");
    }
    return resolved;
  }

  static async verifyForOrganization(
    organizationId: string,
  ): Promise<UnifiedBankingDetails | null> {
    const now = new Date();
    await db
      .update(schema.organizationBankDetails)
      .set({
        isVerified: true,
        verifiedAt: now,
        updatedAt: now,
      })
      .where(eq(schema.organizationBankDetails.organizationId, organizationId));

    await db
      .update(schema.organizationBankingDetails)
      .set({
        updatedAt: now,
      })
      .where(eq(schema.organizationBankingDetails.organizationId, organizationId));

    return this.getByOrganizationId(organizationId);
  }
}

