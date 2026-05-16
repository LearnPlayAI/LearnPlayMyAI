import { describe, expect, it } from '@jest/globals';

import { invalidateOrgStructureCaches, queryClient } from '../lib/queryClient';

describe('query client freshness for mutable admin data', () => {
  it('does not keep report, publish, and assignment queries fresh forever by default', () => {
    const defaultOptions = queryClient.getDefaultOptions().queries;

    expect(defaultOptions?.staleTime).toBe(0);
    expect(defaultOptions?.refetchOnMount).toBe('always');
  });

  it('invalidates organization hierarchy data used by reports, publishing, and assignments', () => {
    const calls: any[] = [];
    const originalInvalidateQueries = queryClient.invalidateQueries;

    queryClient.invalidateQueries = ((options: any) => {
      calls.push(options);
      return Promise.resolve();
    }) as typeof queryClient.invalidateQueries;

    try {
      invalidateOrgStructureCaches({ organizationId: 'org-1' });
    } finally {
      queryClient.invalidateQueries = originalInvalidateQueries;
    }

    expect(calls).toEqual(
      expect.arrayContaining([
        { queryKey: ['/api/organization/hierarchy', 'org-1'] },
        { queryKey: ['/api/organization', 'org-1', 'hierarchy'] },
        { queryKey: ['/api/organizations', 'org-1', 'units'] },
        { queryKey: ['/api/organizations', 'org-1', 'sub-units'] },
        { queryKey: ['/api/admin/organizations', 'org-1', 'units'] },
        { queryKey: ['/api/admin/organizations', 'org-1', 'sub-units'] },
        { queryKey: ['/api/organization/units'], exact: false },
        { queryKey: ['/api/organization/sub-units'], exact: false },
        { queryKey: ['/api/organization/teams'], exact: false },
        { queryKey: ['/api/reports/learner-analytics'], exact: false },
        { queryKey: ['/api/course-assignments'], exact: false },
      ])
    );
  });
});
