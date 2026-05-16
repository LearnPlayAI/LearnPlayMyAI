import { describe, expect, it } from '@jest/globals';

import { sanitizePrimitiveClassName, sanitizePrimitiveClassNameStrict } from '../components/ui/primitiveClassGuard';

describe('sanitizePrimitiveClassName', () => {
  it('keeps layout and spacing classes', () => {
    expect(sanitizePrimitiveClassName('w-full px-4 py-2 flex items-center gap-2')).toBe(
      'w-full px-4 py-2 flex items-center gap-2'
    );
  });

  it('removes visual override utilities including variant-prefixed classes', () => {
    expect(
      sanitizePrimitiveClassName(
        'w-full hover:bg-red-500 text-red-600 border-blue-500 data-[state=open]:shadow-lg'
      )
    ).toBe('w-full');
  });

  it('preserves semantic text sizing and alignment utilities', () => {
    expect(sanitizePrimitiveClassName('text-sm text-center md:text-lg')).toBe(
      'text-sm text-center md:text-lg'
    );
  });

  it('removes arbitrary visual property classes', () => {
    expect(
      sanitizePrimitiveClassName('w-full [background:linear-gradient(to_right,#fff,#000)] [color:#fff]')
    ).toBe('w-full');
  });

  it('removes legacy semantic wrapper utilities and custom-property assignments', () => {
    expect(
      sanitizePrimitiveClassName(
        'w-full bg-[hsl(var(--success)/0.18)] ring-[rgba(var(--warning),0.4)] [--btn-outline-border:hsl(var(--primary))]'
      )
    ).toBe('w-full');
  });
});

describe('sanitizePrimitiveClassNameStrict', () => {
  it('matches base sanitizer behavior for layout and semantic typography classes', () => {
    expect(sanitizePrimitiveClassNameStrict('w-full px-4 py-2 text-sm text-center border border-2')).toBe(
      'w-full px-4 py-2 text-sm text-center border border-2'
    );
  });

  it('still removes visual override utilities', () => {
    expect(
      sanitizePrimitiveClassNameStrict(
        'hover:bg-red-500 text-red-600 border-blue-500 data-[state=open]:shadow-lg'
      )
    ).toBeUndefined();
  });

  it('removes legacy semantic wrapper overrides even when they are not standard visual utilities', () => {
    expect(
      sanitizePrimitiveClassNameStrict('[--card-border:rgba(var(--accent),0.35)] md:[--card-fg:hsl(var(--foreground))]')
    ).toBeUndefined();
  });
});
