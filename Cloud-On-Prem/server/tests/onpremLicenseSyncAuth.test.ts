import crypto from 'crypto';
import { afterAll, beforeEach, describe, expect, test } from '@jest/globals';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://learnplay:learnplay@localhost:5432/learnplay_test';
import { buildSignedOnpremHeaders } from '../services/onpremLicenseSyncService';

describe('onprem cloud sync request signing', () => {
  const prevPrdSecret = process.env.ONPREM_CLOUD_SYNC_SHARED_SECRET_PRD;
  const prevLegacySecret = process.env.ONPREM_CLOUD_SYNC_SHARED_SECRET;
  const prevSystemSecret = process.env.ONPREM_CLOUD_SYNC_SYSTEM_SECRET;
  const prevSystemId = process.env.ONPREM_ENTERPRISE_SYSTEM_ID;

  beforeEach(() => {
    process.env.ONPREM_CLOUD_SYNC_SHARED_SECRET_PRD = 'test-shared-secret';
    delete process.env.ONPREM_CLOUD_SYNC_SHARED_SECRET;
    delete process.env.ONPREM_CLOUD_SYNC_SYSTEM_SECRET;
    delete process.env.ONPREM_ENTERPRISE_SYSTEM_ID;
  });

  afterAll(() => {
    process.env.ONPREM_CLOUD_SYNC_SHARED_SECRET_PRD = prevPrdSecret;
    process.env.ONPREM_CLOUD_SYNC_SHARED_SECRET = prevLegacySecret;
    process.env.ONPREM_CLOUD_SYNC_SYSTEM_SECRET = prevSystemSecret;
    process.env.ONPREM_ENTERPRISE_SYSTEM_ID = prevSystemId;
  });

  test('buildSignedOnpremHeaders signs body with timestamp and nonce', () => {
    const payload = { hello: 'world', count: 3 };
    const bodyRaw = JSON.stringify(payload);
    const headers = buildSignedOnpremHeaders(payload);

    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['x-lp-onprem-ts']).toBeTruthy();
    expect(headers['x-lp-onprem-nonce']).toMatch(/^[a-f0-9]{32}$/);
    expect(headers['x-lp-onprem-signature']).toMatch(/^[a-f0-9]{64}$/);
    expect(headers['x-lp-onprem-auth-mode']).toBe('shared');

    const ts = Number(headers['x-lp-onprem-ts']);
    const nonce = headers['x-lp-onprem-nonce'];
    const expected = crypto
      .createHmac('sha256', 'test-shared-secret')
      .update(`${ts}.${nonce}.${bodyRaw}`)
      .digest('hex');

    expect(headers['x-lp-onprem-signature']).toBe(expected);
  });

  test('buildSignedOnpremHeaders uses per-system credential when available', () => {
    process.env.ONPREM_CLOUD_SYNC_SYSTEM_SECRET = 'system-secret-abc';
    process.env.ONPREM_ENTERPRISE_SYSTEM_ID = 'sys-123';
    process.env.ONPREM_CLOUD_SYNC_SYSTEM_VERSION = '7';

    const payload = { hello: 'world', count: 3 };
    const bodyRaw = JSON.stringify(payload);
    const headers = buildSignedOnpremHeaders(payload);

    expect(headers['x-lp-onprem-auth-mode']).toBe('system');
    expect(headers['x-lp-onprem-system-id']).toBe('sys-123');
    expect(headers['x-lp-onprem-auth-version']).toBe('7');

    const ts = Number(headers['x-lp-onprem-ts']);
    const nonce = headers['x-lp-onprem-nonce'];
    const expected = crypto
      .createHmac('sha256', 'system-secret-abc')
      .update(`${ts}.${nonce}.${bodyRaw}`)
      .digest('hex');
    expect(headers['x-lp-onprem-signature']).toBe(expected);
  });
});
