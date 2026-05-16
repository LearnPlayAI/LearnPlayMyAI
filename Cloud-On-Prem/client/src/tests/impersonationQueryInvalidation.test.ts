import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { invalidateOrgContextCaches, queryClient } from '../lib/queryClient';

describe('superadmin impersonation cache invalidation', () => {
  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('refreshes auth and invalidates admin, billing, and theme domains after an org switch', () => {
    const refetchSpy = jest.spyOn(queryClient, 'refetchQueries').mockImplementation(() => Promise.resolve([] as any));
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries').mockImplementation(() => Promise.resolve() as any);

    invalidateOrgContextCaches();

    expect(refetchSpy).toHaveBeenCalledWith({ queryKey: ['/api/auth/user'], type: 'active' });
    expect(refetchSpy).toHaveBeenCalledWith({ queryKey: ['/api/theme/resolved'], type: 'active' });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['/api/admin/check'], exact: false });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['/api/billing'], exact: false });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['/api/invoices'], exact: false });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['/api/theme'], exact: false });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['/api/theme/resolved'], exact: false });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['/api/superadmin/subscriptions'], exact: false });
  });
});
