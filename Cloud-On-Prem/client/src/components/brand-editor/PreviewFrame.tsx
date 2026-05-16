import { useMemo } from 'react';
import { useBrandEditor } from './BrandEditorShell';
import { cn } from '@/lib/utils';

interface PreviewFrameProps {
  children: React.ReactNode;
  className?: string;
  scale?: number;
}

export function PreviewFrame({ children, className, scale = 1 }: PreviewFrameProps) {
  const { state, openQuickEdit } = useBrandEditor();

  const cssVars = useMemo(() => {
    const vars: Record<string, string> = {};
    Object.entries(state.tokens || {}).forEach(([key, value]) => {
      vars[key] = value;
    });

    if (state.headingFont) {
      vars['--font-heading'] = state.headingFont;
    }
    if (state.bodyFont) {
      vars['--font-body'] = state.bodyFont;
    }

    return vars;
  }, [state.tokens, state.headingFont, state.bodyFont]);

  return (
    <div 
      className={cn(
        "preview-frame-isolation relative overflow-hidden rounded-lg border shadow-sm",
        className
      )}
      style={{
        ...cssVars,
        transform: scale !== 1 ? `scale(${scale})` : undefined,
        transformOrigin: 'top left',
      }}
    >
      <div 
        className="w-full h-full"
        style={{
          backgroundColor: 'var(--surface-primary)',
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-body, inherit)',
        }}
        onClick={(event) => {
          if (event.target !== event.currentTarget) return;
          openQuickEdit('--background');
        }}
        data-testid="preview-background-click-target"
      >
        {children}
      </div>
    </div>
  );
}

interface ClickableElementProps {
  editKey: string;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  as?: keyof JSX.IntrinsicElements;
  interactive?: boolean;
  keyboardAccessible?: boolean;
  onActivate?: () => void;
  'data-testid'?: string;
  'aria-label'?: string;
}

export function ClickableElement({ 
  editKey, 
  children, 
  className, 
  style,
  as: Component = 'div',
  interactive = true,
  keyboardAccessible = true,
  onActivate,
  'data-testid': testId,
  'aria-label': ariaLabel
}: ClickableElementProps) {
  const { highlightedSection, openQuickEdit } = useBrandEditor();

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (editKey.startsWith('--')) {
      openQuickEdit(editKey);
    }
    onActivate?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (editKey.startsWith('--')) {
        openQuickEdit(editKey);
      }
      onActivate?.();
    }
  };

  const isHighlighted = highlightedSection === editKey;

  return (
    <Component
      data-edit-key={editKey}
      tabIndex={interactive ? (keyboardAccessible ? 0 : -1) : undefined}
      role={interactive && keyboardAccessible ? "button" : undefined}
      onClick={interactive ? handleClick : undefined}
      onKeyDown={interactive && keyboardAccessible ? handleKeyDown : undefined}
      className={cn(
        interactive ? "cursor-pointer transition-all duration-200 outline-none" : undefined,
        interactive ? "hover:ring-2 hover:ring-primary/50 hover:ring-offset-1" : undefined,
        interactive ? "focus:ring-2 focus:ring-primary focus:ring-offset-1" : undefined,
        isHighlighted && "ring-2 ring-primary ring-offset-2 motion-safe:animate-pulse",
        className
      )}
      style={style}
      data-testid={testId || `clickable-${editKey}`}
      aria-label={ariaLabel}
    >
      {children}
    </Component>
  );
}

export default PreviewFrame;
