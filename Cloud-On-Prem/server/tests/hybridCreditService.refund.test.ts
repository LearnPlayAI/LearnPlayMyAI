import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { db } from '../db';
import { HybridCreditService } from '../services/hybridCreditService';
import { UnifiedCreditService } from '../services/unifiedCreditService';
import { OrganizationCreditService } from '../services/organizationCreditService';

function mockSelectResult<T>(rows: T[]) {
  return {
    from: () => ({
      where: async () => rows,
    }),
  } as any;
}

describe('HybridCreditService.refundWithFallback', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
  });

  it('refunds user and org portions based on original split deductions', async () => {
    const selectSpy = jest.spyOn(db as any, 'select');
    selectSpy
      .mockImplementationOnce(() => mockSelectResult([
        { correlationId: 'translation-123_user', amount: -7 },
      ]))
      .mockImplementationOnce(() => mockSelectResult([
        { correlationId: 'translation-123_org', amount: -3 },
      ]));

    const userRefundSpy = jest.spyOn(UnifiedCreditService, 'refundCredits').mockResolvedValue({
      success: true,
      newBalance: 100,
      transactionId: 'u-refund',
    });
    const orgRefundSpy = jest.spyOn(OrganizationCreditService, 'refundCredits').mockResolvedValue({
      success: true,
      newBalance: 100,
      transactionId: 'o-refund',
    });

    const result = await HybridCreditService.refundWithFallback({
      userId: 'user-1',
      organizationId: 'org-1',
      originalCorrelationId: 'translation-123',
      refundCorrelationId: 'translation-123-refund',
      reason: 'translation failed',
    });

    expect(result.success).toBe(true);
    expect(result.userAmountRefunded).toBe(7);
    expect(result.orgAmountRefunded).toBe(3);
    expect(result.creditSource).toBe('split');

    expect(userRefundSpy).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      amount: 7,
    }));
    expect(orgRefundSpy).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-1',
      amount: 3,
    }));
  });

  it('returns none when no matching original deductions are found', async () => {
    const selectSpy = jest.spyOn(db as any, 'select');
    selectSpy
      .mockImplementationOnce(() => mockSelectResult([]))
      .mockImplementationOnce(() => mockSelectResult([]));

    const userRefundSpy = jest.spyOn(UnifiedCreditService, 'refundCredits').mockResolvedValue({
      success: true,
      newBalance: 100,
      transactionId: 'u-refund',
    });
    const orgRefundSpy = jest.spyOn(OrganizationCreditService, 'refundCredits').mockResolvedValue({
      success: true,
      newBalance: 100,
      transactionId: 'o-refund',
    });

    const result = await HybridCreditService.refundWithFallback({
      userId: 'user-1',
      organizationId: 'org-1',
      originalCorrelationId: 'missing-correlation',
      refundCorrelationId: 'missing-correlation-refund',
      reason: 'translation failed',
    });

    expect(result).toEqual({
      success: true,
      userAmountRefunded: 0,
      orgAmountRefunded: 0,
      creditSource: 'none',
    });
    expect(userRefundSpy).not.toHaveBeenCalled();
    expect(orgRefundSpy).not.toHaveBeenCalled();
  });
});
