import { useState, useCallback, useRef, useMemo, createContext, useContext, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { RotateCcw, Save, Undo2, Loader2 } from 'lucide-react';
import { EDIT_KEY_TO_SECTION_MAP } from '@shared/tokenSectionMapping';
export { EDIT_KEY_TO_SECTION_MAP } from '@shared/tokenSectionMapping';

export interface BrandEditorTokens {
  [key: string]: string;
}

export type LocalizedString = string | Record<string, string>;

export interface CustomCopy {
  loginTitle?: LocalizedString;
  loginSubtitle?: LocalizedString;
  loginCta?: LocalizedString;
  loginHelper?: LocalizedString;
  signupTitle?: LocalizedString;
  signupSubtitle?: LocalizedString;
  signupCta?: LocalizedString;
  signupHelper?: LocalizedString;
  dashboardWelcome?: LocalizedString;
  footerText?: LocalizedString;
}

export interface BrandEditorState {
  tokens: BrandEditorTokens;
  themeModeIntent?: 'light' | 'dark';
  themeName: string;
  brandName: string;
  description: string;
  logoUrl: string;
  faviconUrl: string;
  headingFont: string;
  bodyFont: string;
  supportEmail: string;
  supportUrl: string;
  termsUrl: string;
  privacyUrl: string;
  allowEmailBranding: boolean;
  enableContrastCorrections?: boolean;
  presetId?: string | null;
  gradientEnabled?: boolean;
  gradientFrom?: string;
  gradientTo?: string;
  gradientAngle?: string;
  customCopy?: CustomCopy;
}

interface BrandEditorContextValue {
  state: BrandEditorState;
  updateToken: (key: string, value: string) => void;
  updateField: <K extends keyof BrandEditorState>(key: K, value: BrandEditorState[K]) => void;
  highlightedSection: string | null;
  setHighlightedSection: (section: string | null) => void;
  scrollToSection: (sectionKey: string) => void;
  registerSection: (key: string, ref: HTMLElement | null) => void;
  openSections: Set<string>;
  setOpenSection: (sectionId: string, open: boolean) => void;
  undo: () => void;
  canUndo: boolean;
  isSaving: boolean;
  isPlatform: boolean;
  hasChanges: boolean;
  pendingTokenChanges: number;
  save: () => Promise<boolean>;
  quickEditKey: string | null;
  openQuickEdit: (tokenKey: string) => void;
  closeQuickEdit: () => void;
}

const BrandEditorContext = createContext<BrandEditorContextValue | null>(null);

export function useBrandEditor() {
  const context = useContext(BrandEditorContext);
  if (!context) {
    throw new Error('useBrandEditor must be used within BrandEditorShell');
  }
  return context;
}

interface BrandEditorShellProps {
  initialState: BrandEditorState;
  onSave: (state: BrandEditorState) => Promise<void>;
  onRevert: () => void;
  onStateChange?: (state: BrandEditorState) => void;
  isSaving?: boolean;
  hasChanges?: boolean;
  children: React.ReactNode;
  className?: string;
  isPlatform?: boolean;
}

export function BrandEditorShell({
  initialState,
  onSave,
  onRevert,
  onStateChange,
  isSaving = false,
  hasChanges = false,
  children,
  className,
  isPlatform = false,
}: BrandEditorShellProps) {
  const { toast } = useToast();
  const [state, setState] = useState<BrandEditorState>(initialState);
  const [previousState, setPreviousState] = useState<BrandEditorState | null>(null);
  const [highlightedSection, setHighlightedSection] = useState<string | null>(null);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['brand-identity', 'base-colors']));
  const [quickEditKey, setQuickEditKey] = useState<string | null>(null);
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());
  const isInitialMount = useRef(true);
  const isSyncingFromInitialState = useRef(false);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    if (isSyncingFromInitialState.current) {
      isSyncingFromInitialState.current = false;
      return;
    }
    onStateChange?.(state);
  }, [state, onStateChange]);

  const canUndo = previousState !== null;

  useEffect(() => {
    isSyncingFromInitialState.current = true;
    setState(initialState);
    setPreviousState(null);
  }, [initialState]);

  const updateToken = useCallback((key: string, value: string) => {
    if (isSaving) return;
    setPreviousState(state);
    setState((prev) => ({
      ...prev,
      tokens: { ...prev.tokens, [key]: value },
    }));
  }, [state, isSaving]);

  const updateField = useCallback(<K extends keyof BrandEditorState>(key: K, value: BrandEditorState[K]) => {
    if (isSaving) return;
    setPreviousState(state);
    setState((prev) => ({ ...prev, [key]: value }));
  }, [state, isSaving]);

  const handleUndo = useCallback(() => {
    if (previousState) {
      setState(previousState);
      setPreviousState(null);
      toast({ title: 'Change undone' });
    }
  }, [previousState, toast]);

  const handleSave = useCallback(async (): Promise<boolean> => {
    try {
      await onSave(state);
      setPreviousState(null);
      return true;
    } catch (error) {
      toast({ 
        title: 'Failed to save theme', 
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive' 
      });
      return false;
    }
  }, [state, onSave, toast]);

  const handleRevert = useCallback(() => {
    setState(initialState);
    setPreviousState(null);
    onRevert();
    toast({ title: 'Changes reverted' });
  }, [initialState, onRevert, toast]);

  const registerSection = useCallback((key: string, ref: HTMLElement | null) => {
    if (ref) {
      sectionRefs.current.set(key, ref);
    } else {
      sectionRefs.current.delete(key);
    }
  }, []);

  const setOpenSection = useCallback((sectionId: string, open: boolean) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (open) {
        next.add(sectionId);
      } else {
        next.delete(sectionId);
      }
      return next;
    });
  }, []);

  const openQuickEdit = useCallback((tokenKey: string) => {
    setQuickEditKey(tokenKey);
  }, []);

  const closeQuickEdit = useCallback(() => {
    setQuickEditKey(null);
  }, []);

  const scrollToSection = useCallback((sectionKey: string) => {
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const behavior: ScrollBehavior = prefersReducedMotion ? 'auto' : 'smooth';
    const parentSection = EDIT_KEY_TO_SECTION_MAP[sectionKey] || sectionKey;
    
    if (parentSection !== sectionKey) {
      setOpenSection(parentSection, true);
    }
    
    setTimeout(() => {
      const element = sectionRefs.current.get(sectionKey);
      if (element) {
        element.scrollIntoView({ behavior, block: 'center' });
        setHighlightedSection(sectionKey);
        setTimeout(() => setHighlightedSection(null), 2000);
      } else {
        const parentRef = sectionRefs.current.get(parentSection);
        if (parentRef) {
          parentRef.scrollIntoView({ behavior, block: 'center' });
          setHighlightedSection(parentSection);
          setTimeout(() => setHighlightedSection(null), 2000);
        }
      }
    }, 100);
  }, [setOpenSection]);

  const contextValue = useMemo<BrandEditorContextValue>(() => ({
    ...(() => {
      let pendingTokenChanges = 0;
      const currentTokens = state.tokens || {};
      const baselineTokens = initialState.tokens || {};
      const keys = new Set([...Object.keys(currentTokens), ...Object.keys(baselineTokens)]);
      for (const key of keys) {
        if ((currentTokens[key] || '') !== (baselineTokens[key] || '')) {
          pendingTokenChanges++;
        }
      }
      return { pendingTokenChanges };
    })(),
    state,
    updateToken,
    updateField,
    highlightedSection,
    setHighlightedSection,
    scrollToSection,
    registerSection,
    openSections,
    setOpenSection,
    undo: handleUndo,
    canUndo,
    isSaving,
    isPlatform,
    hasChanges,
    save: handleSave,
    quickEditKey,
    openQuickEdit,
    closeQuickEdit,
  }), [state, initialState.tokens, updateToken, updateField, highlightedSection, scrollToSection, registerSection, openSections, setOpenSection, handleUndo, canUndo, isSaving, isPlatform, hasChanges, handleSave, quickEditKey, openQuickEdit, closeQuickEdit]);

  return (
    <BrandEditorContext.Provider value={contextValue}>
      <div className={cn("flex flex-col h-full min-h-0", isSaving && "pointer-events-none", className)} aria-busy={isSaving}>
        {children}
      </div>
    </BrandEditorContext.Provider>
  );
}

export default BrandEditorShell;
