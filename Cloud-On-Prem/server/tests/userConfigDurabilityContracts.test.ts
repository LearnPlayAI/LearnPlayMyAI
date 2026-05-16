import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { decideBootstrapEmailProvider } from '../services/configDurabilityPolicy';

describe('user config durability contracts', () => {
  it('does not override explicit email provider setting during bootstrap', () => {
    const result = decideBootstrapEmailProvider({
      hasExplicitProviderSetting: true,
      smtpHost: 'smtp.mail.local',
      mailerSendApiKey: 'ms-key',
    });
    expect(result).toBeNull();
  });

  it('selects provider only when explicit provider is missing', () => {
    expect(
      decideBootstrapEmailProvider({
        hasExplicitProviderSetting: false,
        smtpHost: 'smtp.mail.local',
        mailerSendApiKey: 'ms-key',
      }),
    ).toBe('smtp');

    expect(
      decideBootstrapEmailProvider({
        hasExplicitProviderSetting: false,
        smtpHost: '',
        mailerSendApiKey: 'ms-key',
      }),
    ).toBe('mailersend');
  });

  it('guards systemSettings import on non-empty DB in cloud and onprem scripts', () => {
    const cloudImport = fs.readFileSync(
      path.resolve(__dirname, '../../cloud/import-platform-data.sh'),
      'utf8',
    );
    const onpremImport = fs.readFileSync(
      path.resolve(__dirname, '../../onprem/import-platform-data.sh'),
      'utf8',
    );

    expect(cloudImport).toMatch(/Skipping .*systemSettings.*non-empty DB/);
    expect(cloudImport).toContain('LEARNPLAY_ALLOW_SYSTEM_SETTINGS_IMPORT_ON_NONEMPTY');
    expect(onpremImport).toMatch(/Skipping .*systemSettings.*non-empty DB/);
    expect(onpremImport).toContain('LEARNPLAY_ALLOW_SYSTEM_SETTINGS_IMPORT_ON_NONEMPTY');
  });
});
