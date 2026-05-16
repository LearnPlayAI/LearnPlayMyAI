import { describe, expect, test } from '@jest/globals';
import {
  buildLicenseRequestIdentityTokens,
  compactLicenseRequestsToLatest,
  compactPendingLicenseRequestsToLatest,
  findLatestMatchingLicenseRequest,
  findLatestMatchingPendingRequest,
  requestsShareIdentity,
} from '../services/licenseRequestDedupe';

describe('licenseRequestDedupe', () => {
  test('matches identity across hostname and base URL variants', () => {
    const match = requestsShareIdentity(
      {
        systemType: 'qa',
        requestType: 'initial',
        status: 'pending',
        hostname: 'accop.learnplay.co.za',
      },
      {
        systemType: 'acc',
        requestType: 'initial',
        status: 'pending',
        serverBaseUrl: 'https://accop.learnplay.co.za',
      },
    );

    expect(match).toBe(true);
  });

  test('finds latest matching pending request from sorted list', () => {
    const requests = [
      {
        id: 'latest-match',
        systemType: 'qa',
        requestType: 'initial',
        status: 'pending',
        serverBaseUrl: 'https://accop.learnplay.co.za',
      },
      {
        id: 'older-other',
        systemType: 'qa',
        requestType: 'initial',
        status: 'pending',
        serverBaseUrl: 'https://different.learnplay.co.za',
      },
    ];

    const found = findLatestMatchingPendingRequest(requests, {
      systemType: 'qa',
      requestType: 'initial',
      status: 'pending',
      hostname: 'accop.learnplay.co.za',
    });

    expect(found?.id).toBe('latest-match');
  });

  test('compacts duplicate pending rows and removes pending rows superseded by resolved siblings', () => {
    const requests = [
      {
        id: 'newest',
        systemType: 'qa',
        requestType: 'initial',
        status: 'pending',
        serverBaseUrl: 'https://accop.learnplay.co.za',
      },
      {
        id: 'older-dup',
        systemType: 'qa',
        requestType: 'initial',
        status: 'pending',
        hostname: 'accop.learnplay.co.za',
      },
      {
        id: 'approved-keep',
        systemType: 'qa',
        requestType: 'initial',
        status: 'approved',
        hostname: 'accop.learnplay.co.za',
      },
      {
        id: 'replacement-keep',
        systemType: 'qa',
        requestType: 'replacement',
        status: 'pending',
        hostname: 'accop.learnplay.co.za',
      },
    ];

    const compacted = compactPendingLicenseRequestsToLatest(requests);

    expect(compacted.map((request) => request.id)).toEqual(['approved-keep', 'replacement-keep']);
  });

  test('builds stable identity tokens for key identity fields', () => {
    const tokens = buildLicenseRequestIdentityTokens({
      hardwareKey: 'ABC123',
      hostname: 'https://accop.learnplay.co.za',
      serverBaseUrl: 'https://accop.learnplay.co.za/some/path',
    });

    expect(tokens).toContain('hw:abc123');
    expect(tokens).toContain('host:accop.learnplay.co.za');
    expect(tokens).toContain('urlhost:accop.learnplay.co.za');
  });

  test('compacts approved and denied duplicates to latest per status and identity', () => {
    const requests = [
      {
        id: 'approved-new',
        systemType: 'qa',
        requestType: 'initial',
        status: 'approved',
        hostname: 'accop.learnplay.co.za',
      },
      {
        id: 'approved-old',
        systemType: 'qa',
        requestType: 'initial',
        status: 'approved',
        serverBaseUrl: 'https://accop.learnplay.co.za',
      },
      {
        id: 'denied-new',
        systemType: 'qa',
        requestType: 'initial',
        status: 'denied',
        hostname: 'accop.learnplay.co.za',
      },
      {
        id: 'denied-old',
        systemType: 'qa',
        requestType: 'initial',
        status: 'denied',
        serverBaseUrl: 'https://accop.learnplay.co.za',
      },
    ];

    const compacted = compactLicenseRequestsToLatest(requests);
    expect(compacted.map((request) => request.id)).toEqual(['approved-new', 'denied-new']);
  });

  test('keeps current actionable pending request when only resolved sibling has a different request type', () => {
    const requests = [
      {
        id: 'replacement-pending',
        systemType: 'qa',
        requestType: 'replacement',
        status: 'pending',
        hostname: 'accop.learnplay.co.za',
      },
      {
        id: 'initial-approved',
        systemType: 'qa',
        requestType: 'initial',
        status: 'approved',
        serverBaseUrl: 'https://accop.learnplay.co.za',
      },
    ];

    const compacted = compactLicenseRequestsToLatest(requests);
    expect(compacted.map((request) => request.id)).toEqual(['replacement-pending', 'initial-approved']);
  });

  test('finds latest matching request across statuses when target omits status', () => {
    const requests = [
      {
        id: 'latest-denied',
        systemType: 'qa',
        requestType: 'initial',
        status: 'denied',
        hostname: 'accop.learnplay.co.za',
      },
      {
        id: 'older-approved',
        systemType: 'qa',
        requestType: 'initial',
        status: 'approved',
        serverBaseUrl: 'https://accop.learnplay.co.za',
      },
    ];

    const found = findLatestMatchingLicenseRequest(requests, {
      systemType: 'qa',
      requestType: 'initial',
      hostname: 'accop.learnplay.co.za',
    });

    expect(found?.id).toBe('latest-denied');
  });
});
