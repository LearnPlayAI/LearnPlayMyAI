import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import {
  enterpriseLicenseOrderIndex,
  sortEnterpriseLicenseRecords,
} from '../shared/enterpriseLicenseOrdering';

const ROOT = process.cwd();

describe('Enterprise license management contracts', () => {
  it('sorts license records in PRD, ACC, DEV order', () => {
    const sorted = sortEnterpriseLicenseRecords([
      { systemType: 'development', name: 'DEV learnplay-stack-dev' },
      { systemType: 'production', name: 'PRODUCTION prdophost' },
      { systemType: 'acceptance', name: 'ACCEPTANCE acc-host' },
      { systemType: 'unknown', name: 'OTHER host' },
    ]);

    expect(sorted.map((record) => record.systemType)).toEqual([
      'production',
      'acceptance',
      'development',
      'unknown',
    ]);
    expect(enterpriseLicenseOrderIndex('prd')).toBeLessThan(enterpriseLicenseOrderIndex('acc'));
    expect(enterpriseLicenseOrderIndex('acc')).toBeLessThan(enterpriseLicenseOrderIndex('dev'));
  });

  it('keeps license authority management cloud-only while preserving onprem check-in routes', () => {
    const superAdminRoutes = fs.readFileSync(
      path.join(ROOT, 'server/routes/enterpriseSuperAdminRoutes.ts'),
      'utf8',
    );
    const onpremRoutes = fs.readFileSync(
      path.join(ROOT, 'server/routes/onpremLicenseRoutes.ts'),
      'utf8',
    );

    expect(superAdminRoutes).toContain("import { isOnPremMode } from '../featureFlags';");
    expect(superAdminRoutes).toContain('if (isOnPremMode())');
    expect(superAdminRoutes).toContain("app.use('/api/admin/enterprise', router)");

    expect(onpremRoutes).toContain("app.post('/api/onprem/license/check-in'");
    expect(onpremRoutes).toContain("app.post('/api/onprem/license/request-reissue'");
    expect(onpremRoutes).toContain('if (!isOnPremMode())');
  });

  it('uses an inline delete confirmation instead of native browser prompts', () => {
    const customerDetails = fs.readFileSync(
      path.join(ROOT, 'client/src/pages/admin/EnterpriseCustomerDetails.tsx'),
      'utf8',
    );

    expect(customerDetails).toContain('Confirm license deletion');
    expect(customerDetails).toContain('Confirm Delete');
    expect(customerDetails).not.toContain("window.prompt('Reason for deleting this system license");
    expect(customerDetails).not.toContain("window.confirm('Delete this system license");
    expect(customerDetails).not.toContain('AlertDialog');
  });

  it('uses enterprise systems as the active license authority in customer detail UI', () => {
    const customerDetails = fs.readFileSync(
      path.join(ROOT, 'client/src/pages/admin/EnterpriseCustomerDetails.tsx'),
      'utf8',
    );
    const superAdminRoutes = fs.readFileSync(
      path.join(ROOT, 'server/routes/enterpriseSuperAdminRoutes.ts'),
      'utf8',
    );

    expect(customerDetails).toContain('const activeLicenseSystems = sortedSystems.filter');
    expect(customerDetails).toContain('activeLicenseSystems.map((system: any)');
    expect(customerDetails).not.toContain('approvedLicenseRequests.map((req: any)');
    expect(superAdminRoutes).toContain('archivedSystems: systemsWithRoyalty.filter');
    expect(superAdminRoutes).toContain("String(s.status || '').toLowerCase() !== 'archived'");
  });

  it('archives deleted system licenses instead of returning them to active policy lists', () => {
    const superAdminRoutes = fs.readFileSync(
      path.join(ROOT, 'server/routes/enterpriseSuperAdminRoutes.ts'),
      'utf8',
    );

    expect(superAdminRoutes).toContain("status: 'archived'");
    expect(superAdminRoutes).toContain("licenseStatus: 'revoked'");
    expect(superAdminRoutes).toContain('await revokeAllSystemLicenseKeys');
    expect(superAdminRoutes).toContain('await retireActiveSystemLicenseRequest');
  });

  it('refreshes enterprise system display names when identity fields change', () => {
    const superAdminRoutes = fs.readFileSync(
      path.join(ROOT, 'server/routes/enterpriseSuperAdminRoutes.ts'),
      'utf8',
    );
    const portalRoutes = fs.readFileSync(
      path.join(ROOT, 'server/routes/enterprisePortalRoutes.ts'),
      'utf8',
    );

    expect(superAdminRoutes).toContain('buildEnterpriseSystemDisplayName');
    expect(superAdminRoutes).toContain('name: systemName.slice(0, 100)');
    expect(portalRoutes).toContain('buildEnterpriseSystemDisplayName');
    expect(portalRoutes).toContain('name: systemName.slice(0, 100)');
  });

  it('self-heals stale onprem enterprise system ids when the active system credential matches request identity', () => {
    const portalRoutes = fs.readFileSync(
      path.join(ROOT, 'server/routes/enterprisePortalRoutes.ts'),
      'utf8',
    );

    expect(portalRoutes).toContain('findActiveSystemByOnpremIdentity');
    expect(portalRoutes).toContain('recoverSystemModeByIdentity');
    expect(portalRoutes).toContain("matchedSystem.id === requestedSystemId");
    expect(portalRoutes).toContain('resolvedEnterpriseSystemId = matchedSystem.id');
    expect(portalRoutes).toContain('credentialProvisioned = true');
    expect(portalRoutes).toContain('verified.enterpriseSystemId && verified.enterpriseSystemId !== requestedEnterpriseSystemId');
  });

  it('keeps onprem license status reports observed-only so cloud policy stays authoritative', () => {
    const portalRoutes = fs.readFileSync(
      path.join(ROOT, 'server/routes/enterprisePortalRoutes.ts'),
      'utf8',
    );

    expect(portalRoutes).toContain('upsertObservedSystemLicenseStatus');
    expect(portalRoutes).toContain('observedStatus: status');
    expect(portalRoutes).toContain('authoritativeStatus: targetSystem.licenseStatus');
    expect(portalRoutes).not.toContain('licenseStatus: status,\n          status: nextStatus');
    expect(portalRoutes).not.toContain('await setEnterpriseSystemLicenseReason(updatedSystem.id, status, reason)');
  });

  it('recovers revoked local keys from the cloud-authorized enterprise system binding', () => {
    const portalRoutes = fs.readFileSync(
      path.join(ROOT, 'server/routes/enterprisePortalRoutes.ts'),
      'utf8',
    );

    expect(portalRoutes).toContain('findActiveReplacementLicenseForVerifiedSystem');
    expect(portalRoutes).toContain('verified.enterpriseSystemId');
    expect(portalRoutes).toContain('system.activeLicenseKeyId');
    expect(portalRoutes).toContain('replacementSystem.id');
    expect(portalRoutes).toContain('syncAuth');
    expect(portalRoutes).toContain('enterpriseSystemId: replacementSystem?.id || null');
  });

  it('supersedes older active keys when cloud SuperAdmin activates a replacement license', () => {
    const superAdminRoutes = fs.readFileSync(
      path.join(ROOT, 'server/routes/enterpriseSuperAdminRoutes.ts'),
      'utf8',
    );

    expect(superAdminRoutes).toContain('supersedePriorSystemLicenseKeys');
    expect(superAdminRoutes).toContain("revokedReason: 'Superseded by replacement license'");
    expect(superAdminRoutes).toContain('sql`${enterpriseLicenseKeys.id} <> ${activeLicenseKeyId}`');
  });
});
