import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('organization registration education availability', () => {
  const source = readFileSync(
    join(process.cwd(), 'client/src/pages/OrgRegistrationWizard.tsx'),
    'utf8'
  );
  const educationOption = source.slice(
    source.lastIndexOf('<div', source.indexOf('data-testid="radio-org-type-education"')),
    source.indexOf('data-testid="radio-org-type-business"')
  );

  it('makes Education selectable for organization registration', () => {
    expect(educationOption).toContain("field.onChange('education')");
  });

  it('does not present Education as a coming-soon disabled option', () => {
    expect(educationOption).not.toContain('Coming Soon');
    expect(educationOption).not.toContain('cursor-not-allowed');
  });
});
