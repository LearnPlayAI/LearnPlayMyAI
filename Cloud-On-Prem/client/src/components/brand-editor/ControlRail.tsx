import { useRef, useEffect, useCallback, useState } from 'react';
import { useBrandEditor } from './BrandEditorShell';
import { ColorPicker } from './ColorPicker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { cn } from '@/lib/utils';
import { getContractRequiredTokens } from '@shared/themeComponentContracts';
import { 
  ChevronDown, 
  Building2, 
  Palette, 
  Layers, 
  Type, 
  Sparkles, 
  Gamepad2, 
  FileText, 
  LifeBuoy,
  Image as ImageIcon,
  Settings,
  Upload,
  Loader2,
  X,
  Globe
} from 'lucide-react';
import type { LocalizedString } from './BrandEditorShell';

const FONT_OPTIONS = [
  { value: 'Inter, system-ui, sans-serif', label: 'Inter (Default)' },
  { value: 'system-ui, -apple-system, sans-serif', label: 'System UI' },
  { value: 'Georgia, serif', label: 'Georgia (Serif)' },
  { value: 'Roboto, sans-serif', label: 'Roboto' },
  { value: 'Open Sans, sans-serif', label: 'Open Sans' },
  { value: 'Lato, sans-serif', label: 'Lato' },
  { value: 'Poppins, sans-serif', label: 'Poppins' },
  { value: 'Montserrat, sans-serif', label: 'Montserrat' },
  { value: 'Playfair Display, serif', label: 'Playfair Display (Serif)' },
  { value: 'Merriweather, serif', label: 'Merriweather (Serif)' },
  { value: 'Source Code Pro, monospace', label: 'Source Code Pro (Mono)' },
];

interface SectionProps {
  id: string;
  title: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function Section({ id, title, icon, defaultOpen = false, children }: SectionProps) {
  const { registerSection, highlightedSection, openSections, setOpenSection } = useBrandEditor();
  const ref = useRef<HTMLDivElement>(null);
  const initializedDefaultOpen = useRef(false);

  useEffect(() => {
    registerSection(id, ref.current);
    return () => registerSection(id, null);
  }, [id, registerSection]);

  useEffect(() => {
    if (initializedDefaultOpen.current) return;
    initializedDefaultOpen.current = true;
    if (defaultOpen && !openSections.has(id)) {
      setOpenSection(id, true);
    }
  }, [defaultOpen, id, openSections, setOpenSection]);

  const isHighlighted = highlightedSection === id;
  const isOpen = openSections.has(id);

  const handleOpenChange = useCallback((open: boolean) => {
    setOpenSection(id, open);
  }, [id, setOpenSection]);

  return (
    <Collapsible open={isOpen} onOpenChange={handleOpenChange}>
      <div 
        ref={ref}
        className={cn(
          "border-b transition-all duration-300",
          isHighlighted && "bg-primary/5 ring-2 ring-primary ring-inset"
        )}
      >
        <CollapsibleTrigger 
          className="flex items-center gap-3 w-full p-4 hover:bg-muted/50 transition-colors"
          data-testid={`section-${id}`}
        >
          <div className="text-muted-foreground">{icon}</div>
          <span className="font-medium text-sm flex-1 text-left">{title}</span>
          <ChevronDown className={cn(
            "h-4 w-4 text-muted-foreground transition-transform duration-200",
            isOpen && "rotate-180"
          )} />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-4 pb-4 space-y-4">
            {children}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function InputField({ 
  label, 
  value, 
  onChange, 
  placeholder,
  type = 'text',
  id
}: { 
  label: string; 
  value: string; 
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  id?: string;
}) {
  const fieldId = id || label.toLowerCase().replace(/\s+/g, '-');
  return (
    <div className="space-y-2">
      <Label className="text-sm" htmlFor={fieldId}>{label}</Label>
      <Input
        id={fieldId}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="min-h-[44px] h-11 sm:h-9 touch-manipulation"
        data-testid={`input-${fieldId}`}
      />
    </div>
  );
}

const COPY_LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'af', label: 'Afrikaans' },
  { code: 'zu', label: 'Zulu' },
  { code: 'xh', label: 'Xhosa' },
  { code: 'st', label: 'Sotho' },
  { code: 'fr', label: 'French' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'es', label: 'Spanish' },
  { code: 'de', label: 'German' },
];

function getLocalizedValue(value: LocalizedString | undefined, lang: string): string {
  if (!value) return '';
  if (typeof value === 'string') {
    return lang === 'en' ? value : '';
  }
  return value[lang] || '';
}

function setLocalizedValue(
  current: LocalizedString | undefined,
  lang: string,
  newValue: string
): LocalizedString {
  if (typeof current === 'string') {
    if (lang === 'en') return { en: newValue };
    return { en: current, [lang]: newValue };
  }
  const obj = typeof current === 'object' && current !== null ? { ...current } : {};
  if (newValue) {
    obj[lang] = newValue;
  } else {
    delete obj[lang];
  }
  return obj;
}

interface CustomCopySectionProps {
  state: { customCopy?: any };
  updateField: (key: 'customCopy', value: any) => void;
}

function CustomCopySection({ state, updateField }: CustomCopySectionProps) {
  const [copyLang, setCopyLang] = useState('en');

  const getVal = (key: string) => getLocalizedValue(state.customCopy?.[key], copyLang);
  const setVal = (key: string, v: string) => {
    const updated = setLocalizedValue(state.customCopy?.[key], copyLang, v);
    updateField('customCopy', { ...state.customCopy, [key]: updated });
  };

  return (
    <Section 
      id="custom-copy" 
      title="Custom Copy" 
      icon={<Type className="h-4 w-4" />}
    >
      <div className="space-y-4">
        <div className="text-xs text-muted-foreground mb-2">
          Customize text labels shown throughout your platform
        </div>

        <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50 border">
          <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
          <Select value={copyLang} onValueChange={setCopyLang}>
            <SelectTrigger className="min-h-[44px] h-11 sm:h-8 text-xs flex-1 touch-manipulation" aria-label="Select custom copy language">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COPY_LANGUAGES.map((l) => (
                <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-muted-foreground">Login Page</h4>
          <InputField
            label="Login Title"
            id={`login-title-${copyLang}`}
            value={getVal('loginTitle')}
            onChange={(v) => setVal('loginTitle', v)}
            placeholder="Welcome back"
          />
          <InputField
            label="Login Subtitle"
            id={`login-subtitle-${copyLang}`}
            value={getVal('loginSubtitle')}
            onChange={(v) => setVal('loginSubtitle', v)}
            placeholder="Sign in to continue learning"
          />
          <InputField
            label="Login Button Text"
            id={`login-cta-${copyLang}`}
            value={getVal('loginCta')}
            onChange={(v) => setVal('loginCta', v)}
            placeholder="Sign In"
          />
          <InputField
            label="Login Helper Text"
            id={`login-helper-${copyLang}`}
            value={getVal('loginHelper')}
            onChange={(v) => setVal('loginHelper', v)}
            placeholder="Need help? Contact support"
          />
        </div>

        <div className="space-y-3 pt-2 border-t">
          <h4 className="text-sm font-medium text-muted-foreground">Signup Page</h4>
          <InputField
            label="Signup Title"
            id={`signup-title-${copyLang}`}
            value={getVal('signupTitle')}
            onChange={(v) => setVal('signupTitle', v)}
            placeholder="Create your account"
          />
          <InputField
            label="Signup Subtitle"
            id={`signup-subtitle-${copyLang}`}
            value={getVal('signupSubtitle')}
            onChange={(v) => setVal('signupSubtitle', v)}
            placeholder="Start your learning journey"
          />
          <InputField
            label="Signup Button Text"
            id={`signup-cta-${copyLang}`}
            value={getVal('signupCta')}
            onChange={(v) => setVal('signupCta', v)}
            placeholder="Get Started"
          />
          <InputField
            label="Signup Helper Text"
            id={`signup-helper-${copyLang}`}
            value={getVal('signupHelper')}
            onChange={(v) => setVal('signupHelper', v)}
            placeholder="Already have an account?"
          />
        </div>

        <div className="space-y-3 pt-2 border-t">
          <h4 className="text-sm font-medium text-muted-foreground">Other</h4>
          <InputField
            label="Dashboard Welcome"
            id={`dashboard-welcome-${copyLang}`}
            value={getVal('dashboardWelcome')}
            onChange={(v) => setVal('dashboardWelcome', v)}
            placeholder="Welcome to your dashboard"
          />
          <InputField
            label="Footer Text"
            id={`footer-text-${copyLang}`}
            value={getVal('footerText')}
            onChange={(v) => setVal('footerText', v)}
            placeholder="Powered by LearnPlay"
          />
        </div>
      </div>
    </Section>
  );
}

function FontSelect({
  label,
  value,
  onChange,
  id
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  id: string;
}) {
  return (
    <div className="space-y-2">
      <Label className="text-sm" htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="min-h-[44px] h-11 sm:h-9 touch-manipulation" data-testid={`select-${id}`}>
          <SelectValue placeholder="Select a font" />
        </SelectTrigger>
        <SelectContent>
          {FONT_OPTIONS.map((font) => (
            <SelectItem 
              key={font.value} 
              value={font.value}
              data-testid={`select-option-${id}-${font.label.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <span style={{ fontFamily: font.value }}>{font.label}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

interface ImageUploadFieldProps {
  label: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  acceptedTypes?: string;
  maxSizeMB?: number;
  uploadType: 'logo' | 'favicon';
  isPlatform?: boolean;
}

function ImageUploadField({
  label,
  id,
  value,
  onChange,
  placeholder = 'https://...',
  acceptedTypes = '.png,.jpg,.jpeg,.gif,.webp',
  maxSizeMB = 5,
  uploadType,
  isPlatform = false
}: ImageUploadFieldProps) {
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const maxBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxBytes) {
      toast({
        title: 'File too large',
        description: `Maximum file size is ${maxSizeMB}MB`,
        variant: 'destructive'
      });
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', uploadType);
      if (isPlatform) {
        formData.append('isPlatform', 'true');
      }

      const response = await fetch('/api/branding/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Upload failed');
      }

      const data = await response.json();
      onChange(data.url);
      toast({ title: 'Image uploaded successfully' });
    } catch (error: any) {
      toast({
        title: 'Upload failed',
        description: error.message || 'Failed to upload image',
        variant: 'destructive'
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleClear = () => {
    onChange('');
  };

  return (
    <div className="space-y-2">
      <Label className="text-sm" htmlFor={id}>{label}</Label>
      <div className="space-y-3">
        {value && (
          <div className="p-3 bg-muted/50 rounded-lg border border-border/50 shadow-sm" data-testid={`preview-${id}`}>
            <span className="text-xs text-muted-foreground mb-2 block font-medium">Current {label}</span>
            <div className="bg-background/50 rounded p-2">
              <img
                src={value}
                alt={`${label} preview`}
                className="max-h-20 object-contain mx-auto"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  const container = e.currentTarget.parentElement;
                  if (container && !container.querySelector('[data-image-fallback]')) {
                    const fallback = document.createElement('span');
                    fallback.setAttribute('data-image-fallback', 'true');
                    fallback.className = 'block text-xs text-center text-muted-foreground py-2';
                    fallback.textContent = 'Image failed to load';
                    container.appendChild(fallback);
                  }
                }}
              />
            </div>
          </div>
        )}
        <div className="flex gap-2">
          <Input
            id={id}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="min-h-[44px] h-11 sm:h-9 flex-1 touch-manipulation"
            data-testid={`input-${id}`}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept={acceptedTypes}
            onChange={handleFileSelect}
            className="hidden"
            data-testid={`file-input-${id}`}
          />
          <Button type="button" variant="outline" size="sm" className="min-h-[44px] h-11 sm:h-9 px-3 touch-manipulation" onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            aria-label={`Upload ${label}`}
            title={`Upload ${label}`}
            data-testid={`button-upload-${id}`}
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
          </Button>
          {value && (
            <Button type="button" variant="ghost" size="sm" className="min-h-[44px] h-11 sm:h-9 px-2 touch-manipulation" onClick={handleClear} aria-label={`Clear ${label}`} title={`Clear ${label}`} data-testid={`button-clear-${id}`} >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

interface RegisteredColorPickerProps {
  tokenKey: string;
  label: string;
  description?: string;
  defaultValue: string;
  contrastWithToken?: string;
}

function RegisteredColorPicker({ 
  tokenKey, 
  label, 
  description, 
  defaultValue,
  contrastWithToken 
}: RegisteredColorPickerProps) {
  const { state, updateToken, registerSection, highlightedSection } = useBrandEditor();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    registerSection(tokenKey, ref.current);
    return () => registerSection(tokenKey, null);
  }, [tokenKey, registerSection]);

  const isHighlighted = highlightedSection === tokenKey;

  return (
    <div ref={ref}>
      <ColorPicker
        label={label}
        description={description}
        value={state.tokens[tokenKey] || defaultValue}
        onChange={(v) => updateToken(tokenKey, v)}
        contrastWith={contrastWithToken ? state.tokens[contrastWithToken] : undefined}
        isHighlighted={isHighlighted}
      />
    </div>
  );
}

interface RegisteredTokenInputProps {
  tokenKey: string;
  label: string;
  description?: string;
  defaultValue?: string;
  kind?: 'color' | 'text';
}

function RegisteredTokenInput({
  tokenKey,
  label,
  description,
  defaultValue = '',
  kind = 'color',
}: RegisteredTokenInputProps) {
  const { state, updateToken, registerSection, highlightedSection } = useBrandEditor();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    registerSection(tokenKey, ref.current);
    return () => registerSection(tokenKey, null);
  }, [tokenKey, registerSection]);

  const isHighlighted = highlightedSection === tokenKey;

  return (
    <div ref={ref}>
      {kind === 'color' ? (
        <ColorPicker
          label={label}
          description={description}
          value={state.tokens[tokenKey] || defaultValue}
          onChange={(v) => updateToken(tokenKey, v)}
          isHighlighted={isHighlighted}
        />
      ) : (
        <div
          className={cn(
            "space-y-2 rounded-lg p-2 transition-all duration-300",
            isHighlighted && "bg-primary/5 ring-2 ring-primary ring-inset"
          )}
        >
          <InputField
            label={label}
            id={`token-${tokenKey.replace(/[^a-z0-9-]/gi, '')}`}
            value={state.tokens[tokenKey] || defaultValue}
            onChange={(value) => updateToken(tokenKey, value)}
            placeholder={defaultValue || tokenKey}
          />
          {description ? (
            <p className="text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}

interface PrimitiveTokenConfig {
  tokenKey: string;
  label: string;
  description: string;
  defaultValue?: string;
  kind?: 'color' | 'text';
}

function tokenKeyLabel(tokenKey: string): string {
  return tokenKey
    .replace(/^--/, '')
    .split('-')
    .map((segment) => (segment ? segment[0].toUpperCase() + segment.slice(1) : segment))
    .join(' ');
}

const BASE_COLOR_PRIMITIVES: PrimitiveTokenConfig[] = [
  { tokenKey: '--btn-primary-bg', label: 'Primary Button', description: 'Primary button background color.' },
  { tokenKey: '--btn-primary-hover', label: 'Primary Button Hover', description: 'Primary button hover background color.' },
  { tokenKey: '--btn-primary-active', label: 'Primary Button Active', description: 'Primary button pressed background color.' },
  { tokenKey: '--btn-primary-disabled-bg', label: 'Primary Button Disabled', description: 'Primary button disabled background color.' },
  { tokenKey: '--btn-secondary-bg', label: 'Secondary Button', description: 'Secondary button background color.' },
  { tokenKey: '--btn-secondary-hover', label: 'Secondary Button Hover', description: 'Secondary button hover background color.' },
  { tokenKey: '--btn-ghost-bg', label: 'Ghost Button', description: 'Ghost button background color.' },
  { tokenKey: '--btn-ghost-hover', label: 'Ghost Button Hover', description: 'Ghost button hover background color.' },
  { tokenKey: '--btn-outline-bg', label: 'Outline Button', description: 'Outline button background color.' },
  { tokenKey: '--btn-outline-border', label: 'Outline Button Border', description: 'Outline button border color.' },
  { tokenKey: '--btn-outline-hover-bg', label: 'Outline Button Hover', description: 'Outline button hover background color.' },
  { tokenKey: '--btn-danger-bg', label: 'Danger Button', description: 'Danger action background color.' },
  { tokenKey: '--btn-success-bg', label: 'Success Button', description: 'Success action background color.' },
  { tokenKey: '--btn-warning-bg', label: 'Warning Button', description: 'Warning action background color.' },
  { tokenKey: '--btn-gradient-bg', label: 'Gradient Button Base', description: 'Base background color used for gradient button foreground contrast and fallback.' },
  { tokenKey: '--btn-focus-ring', label: 'Button Focus Ring', description: 'Focus ring color used for buttons.' },
  { tokenKey: '--link-fg', label: 'Link', description: 'Default link text color.' },
  { tokenKey: '--link-hover-fg', label: 'Link Hover', description: 'Link text color on hover.' },
  { tokenKey: '--link-active-fg', label: 'Link Active', description: 'Link text color when active/pressed.' },
  { tokenKey: '--link-visited-fg', label: 'Link Visited', description: 'Visited link text color.' },
  { tokenKey: '--link-focus-ring', label: 'Link Focus Ring', description: 'Focus ring color used for links.' },
  { tokenKey: '--link-muted-fg', label: 'Muted Link', description: 'Muted link text color for secondary links.' },
  { tokenKey: '--destructive', label: 'Destructive', description: 'Base destructive semantic color.' },
  { tokenKey: '--success', label: 'Success', description: 'Base success semantic color.' },
  { tokenKey: '--warning', label: 'Warning', description: 'Base warning semantic color.' },
  { tokenKey: '--action-accent', label: 'Action Accent', description: 'Accent action semantic color used by UI primitives.' },
  { tokenKey: '--badge-bg', label: 'Badge', description: 'Default badge background color.' },
  { tokenKey: '--badge-secondary-bg', label: 'Secondary Badge', description: 'Secondary badge background color.' },
  { tokenKey: '--badge-outline-border', label: 'Outline Badge Border', description: 'Outline badge border color.' },
  { tokenKey: '--alert-info-bg', label: 'Alert Info Background', description: 'Info alert background color.' },
  { tokenKey: '--alert-success-bg', label: 'Alert Success Background', description: 'Success alert background color.' },
  { tokenKey: '--alert-warning-bg', label: 'Alert Warning Background', description: 'Warning alert background color.' },
  { tokenKey: '--lesson-artifact-source-db-bg', label: 'Artifact Badge: Source DB', description: 'Background color for Source DB lesson artifact badge.' },
  { tokenKey: '--lesson-artifact-source-db-fg', label: 'Artifact Badge: Source DB Text', description: 'Text color for Source DB lesson artifact badge.' },
  { tokenKey: '--lesson-artifact-source-db-border', label: 'Artifact Badge: Source DB Border', description: 'Border color for Source DB lesson artifact badge.' },
  { tokenKey: '--lesson-artifact-objectives-bg', label: 'Artifact Badge: Objectives', description: 'Background color for Learning Objectives lesson artifact badge.' },
  { tokenKey: '--lesson-artifact-objectives-fg', label: 'Artifact Badge: Objectives Text', description: 'Text color for Learning Objectives lesson artifact badge.' },
  { tokenKey: '--lesson-artifact-objectives-border', label: 'Artifact Badge: Objectives Border', description: 'Border color for Learning Objectives lesson artifact badge.' },
  { tokenKey: '--lesson-artifact-digest-bg', label: 'Artifact Badge: Digest', description: 'Background color for Lesson Digest artifact badge.' },
  { tokenKey: '--lesson-artifact-digest-fg', label: 'Artifact Badge: Digest Text', description: 'Text color for Lesson Digest artifact badge.' },
  { tokenKey: '--lesson-artifact-digest-border', label: 'Artifact Badge: Digest Border', description: 'Border color for Lesson Digest artifact badge.' },
];

const SURFACE_PRIMITIVES: PrimitiveTokenConfig[] = [
  { tokenKey: '--pill-bg', label: 'Pill', description: 'Default pill background color.' },
  { tokenKey: '--pill-active-bg', label: 'Pill Active', description: 'Active pill background color.' },
  { tokenKey: '--tag-bg', label: 'Tag', description: 'Default tag background color.' },
  { tokenKey: '--filter-pill-bg', label: 'Filter Pill', description: 'Default filter pill background color.' },
  { tokenKey: '--filter-pill-active-bg', label: 'Filter Pill Active', description: 'Active filter pill background color.' },
  { tokenKey: '--filter-pill-disabled-bg', label: 'Filter Pill Disabled', description: 'Disabled filter pill background color.' },
  { tokenKey: '--tab-active-bg', label: 'Tab Active', description: 'Active tab background color.' },
  { tokenKey: '--tab-indicator', label: 'Tab Indicator', description: 'Tab indicator/accent color.' },
  { tokenKey: '--card-bg', label: 'Card Surface', description: 'Default card surface color.' },
  { tokenKey: '--glass-card-bg', label: 'Glass Card Surface', description: 'Glass card background color.' },
  { tokenKey: '--feature-card-bg', label: 'Feature Card Surface', description: 'Feature card background color.' },
  { tokenKey: '--card-hover-bg', label: 'Card Hover', description: 'Card hover background color.' },
  { tokenKey: '--card-selected-bg', label: 'Card Selected', description: 'Card selected background color.' },
  { tokenKey: '--surface-raised', label: 'Raised Surface', description: 'Raised/elevated surface background color.' },
  { tokenKey: '--avatar-bg', label: 'Avatar Surface', description: 'Avatar background color.' },
  { tokenKey: '--avatar-fg', label: 'Avatar Text', description: 'Avatar foreground/text color.' },
  { tokenKey: '--modal-bg', label: 'Modal Surface', description: 'Modal/dialog background color.' },
  { tokenKey: '--panel-bg', label: 'Panel Surface', description: 'Panel background color.' },
  { tokenKey: '--popover', label: 'Popover Surface', description: 'Popover/dropdown surface color.' },
];

const NAVIGATION_PRIMITIVES: PrimitiveTokenConfig[] = [
  { tokenKey: '--nav-bg', label: 'Navigation Background', description: 'Top-level navigation background color.' },
  { tokenKey: '--sidebar-bg', label: 'Sidebar Background', description: 'Sidebar background color.' },
  { tokenKey: '--sidebar-fg', label: 'Sidebar Text', description: 'Sidebar default text color.' },
  { tokenKey: '--sidebar-item-active-bg', label: 'Sidebar Item Active', description: 'Sidebar active item background color.' },
  { tokenKey: '--sidebar-item-active-fg', label: 'Sidebar Item Active Text', description: 'Sidebar active item text color.' },
  { tokenKey: '--sidebar-item-hover-bg', label: 'Sidebar Item Hover', description: 'Sidebar hover item background color.' },
  { tokenKey: '--sidebar-item-hover-fg', label: 'Sidebar Item Hover Text', description: 'Sidebar hover item text color.' },
  { tokenKey: '--sidebar-item-fg', label: 'Sidebar Item Text', description: 'Sidebar normal item text color.' },
  { tokenKey: '--sidebar-item-disabled-fg', label: 'Sidebar Item Disabled Text', description: 'Sidebar disabled item text color.' },
  { tokenKey: '--nav-item-active-bg', label: 'Nav Item Active', description: 'Horizontal navigation active item background color.' },
  { tokenKey: '--nav-item-active-fg', label: 'Nav Item Active Text', description: 'Horizontal navigation active item text color.' },
  { tokenKey: '--nav-item-hover-bg', label: 'Nav Item Hover', description: 'Horizontal navigation hover item background color.' },
  { tokenKey: '--nav-item-hover-fg', label: 'Nav Item Hover Text', description: 'Horizontal navigation hover item text color.' },
  { tokenKey: '--nav-item-fg', label: 'Nav Item Text', description: 'Horizontal navigation normal item text color.' },
  { tokenKey: '--nav-item-disabled-fg', label: 'Nav Item Disabled Text', description: 'Horizontal navigation disabled item text color.' },
  { tokenKey: '--nav-link', label: 'Navigation Link', description: 'Navigation link text color.' },
  { tokenKey: '--nav-pill-bg', label: 'Navigation Pill', description: 'Navigation pill background color.' },
  { tokenKey: '--nav-pill-border', label: 'Navigation Pill Border', description: 'Navigation pill border color.' },
  { tokenKey: '--nav-pill-fg', label: 'Navigation Pill Text', description: 'Navigation pill text color.' },
  { tokenKey: '--nav-pill-hover-bg', label: 'Navigation Pill Hover', description: 'Navigation pill hover background color.' },
  { tokenKey: '--nav-pill-hover-fg', label: 'Navigation Pill Hover Text', description: 'Navigation pill hover text color.' },
  { tokenKey: '--nav-pill-active-bg', label: 'Navigation Pill Active', description: 'Navigation pill active background color.' },
  { tokenKey: '--nav-pill-active-fg', label: 'Navigation Pill Active Text', description: 'Navigation pill active text color.' },
];

const FORM_PRIMITIVES: PrimitiveTokenConfig[] = [
  { tokenKey: '--input-bg', label: 'Input Background', description: 'Text input background color.' },
  { tokenKey: '--input-focus-border', label: 'Input Focus Border', description: 'Input border color while focused.' },
  { tokenKey: '--input-invalid-border', label: 'Input Invalid Border', description: 'Input border color for invalid state.' },
  { tokenKey: '--input-success-border', label: 'Input Success Border', description: 'Input border color for success state.' },
  { tokenKey: '--input-disabled-bg', label: 'Input Disabled Background', description: 'Input background color when disabled.' },
  { tokenKey: '--select-bg', label: 'Select Background', description: 'Select field background color.' },
  { tokenKey: '--select-option-hover', label: 'Select Option Hover', description: 'Select option hover background color.' },
  { tokenKey: '--checkbox-checked-bg', label: 'Checkbox Checked', description: 'Checkbox background color when checked.' },
  { tokenKey: '--checkbox-border', label: 'Checkbox Border', description: 'Checkbox border color.' },
  { tokenKey: '--radio-checked-bg', label: 'Radio Checked', description: 'Radio background color when checked.' },
  { tokenKey: '--radio-border', label: 'Radio Border', description: 'Radio border color.' },
  { tokenKey: '--switch-checked-bg', label: 'Switch Checked', description: 'Switch background color when checked.' },
  { tokenKey: '--switch-bg', label: 'Switch Background', description: 'Switch background color when unchecked.' },
];

const TYPOGRAPHY_SPACING_PRIMITIVES: PrimitiveTokenConfig[] = [
  { tokenKey: '--space-xs', label: 'Spacing XS', description: 'Extra-small spacing token.', defaultValue: '0.25rem', kind: 'text' },
  { tokenKey: '--space-sm', label: 'Spacing SM', description: 'Small spacing token.', defaultValue: '0.5rem', kind: 'text' },
  { tokenKey: '--space-md', label: 'Spacing MD', description: 'Medium spacing token.', defaultValue: '0.75rem', kind: 'text' },
  { tokenKey: '--space-lg', label: 'Spacing LG', description: 'Large spacing token.', defaultValue: '1rem', kind: 'text' },
  { tokenKey: '--space-xl', label: 'Spacing XL', description: 'Extra-large spacing token.', defaultValue: '1.5rem', kind: 'text' },
  { tokenKey: '--space-2xl', label: 'Spacing 2XL', description: '2XL spacing token.', defaultValue: '2rem', kind: 'text' },
  { tokenKey: '--space-3xl', label: 'Spacing 3XL', description: '3XL spacing token.', defaultValue: '3rem', kind: 'text' },
];

const TABLE_PRIMITIVES: PrimitiveTokenConfig[] = [
  { tokenKey: '--table-header-bg', label: 'Table Header', description: 'Table header background color.' },
];

const NOTIFICATION_PRIMITIVES: PrimitiveTokenConfig[] = [
  { tokenKey: '--toast-bg', label: 'Toast Surface', description: 'Toast notification background color.' },
];

const SURFACE_PLATFORM_PRIMITIVES: PrimitiveTokenConfig[] = [
  { tokenKey: '--course-card-bg', label: 'Course Card Surface', description: 'Course card background color.' },
  { tokenKey: '--course-card-badge-bg', label: 'Course Card Badge', description: 'Course card badge background color.' },
  { tokenKey: '--pagination-bg', label: 'Pagination Surface', description: 'Pagination button background color.' },
  { tokenKey: '--pagination-disabled-bg', label: 'Pagination Disabled', description: 'Disabled pagination background color.' },
  { tokenKey: '--pricing-card-bg', label: 'Pricing Card Surface', description: 'Pricing card background color.' },
  { tokenKey: '--stat-card-bg', label: 'Stat Card Surface', description: 'Stat card background color.' },
  { tokenKey: '--tab-bg', label: 'Tab Surface', description: 'Default tab background color.' },
  { tokenKey: '--text-primary', label: 'Primary Text', description: 'Primary content text color.' },
  { tokenKey: '--footer-border', label: 'Footer Border', description: 'Footer border color.' },
  { tokenKey: '--footer-fg', label: 'Footer Text', description: 'Footer text color.' },
  { tokenKey: '--footer-heading', label: 'Footer Heading', description: 'Footer heading color.' },
  { tokenKey: '--footer-link', label: 'Footer Link', description: 'Footer link color.' },
  { tokenKey: '--footer-social-bg', label: 'Footer Social Surface', description: 'Footer social icon background color.' },
];

const FORM_EXTENDED_PRIMITIVES: PrimitiveTokenConfig[] = [
  { tokenKey: '--search-bg', label: 'Search Background', description: 'Search field background color.' },
];

const TABLE_EXTENDED_PRIMITIVES: PrimitiveTokenConfig[] = [
  { tokenKey: '--table-row-bg', label: 'Table Row Surface', description: 'Default table row background color.' },
];

const CERTIFICATE_PRIMITIVES: PrimitiveTokenConfig[] = [
  { tokenKey: '--cert-bg', label: 'Certificate Background', description: 'Certificate panel background color.' },
  { tokenKey: '--cert-accent', label: 'Certificate Accent', description: 'Certificate accent color.' },
  { tokenKey: '--cert-title', label: 'Certificate Title', description: 'Certificate title text color.' },
];

const EMAIL_TEMPLATE_PRIMITIVES: PrimitiveTokenConfig[] = [
  { tokenKey: '--email-header-bg', label: 'Email Header Background', description: 'Email header background color.' },
  { tokenKey: '--email-header-fg', label: 'Email Header Text', description: 'Email header text color.' },
  { tokenKey: '--email-content-bg', label: 'Email Content Background', description: 'Email body background color.' },
  { tokenKey: '--email-content-fg', label: 'Email Content Text', description: 'Email body text color.' },
  { tokenKey: '--email-cta-bg', label: 'Email CTA Background', description: 'Email CTA button background color.' },
  { tokenKey: '--email-footer-bg', label: 'Email Footer Background', description: 'Email footer background color.' },
  { tokenKey: '--email-footer-fg', label: 'Email Footer Text', description: 'Email footer text color.' },
  { tokenKey: '--email-link', label: 'Email Link', description: 'Email link color.' },
  { tokenKey: '--email-warning', label: 'Email Warning', description: 'Email warning badge color.' },
  { tokenKey: '--email-accent', label: 'Email Accent', description: 'General email accent color.' },
];

const GAMIFICATION_PRIMITIVES: PrimitiveTokenConfig[] = [
  { tokenKey: '--game-gold', label: 'Game Gold', description: 'Highlight color for rewards and rank.' },
  { tokenKey: '--game-success', label: 'Game Success', description: 'Success color in game contexts.' },
  { tokenKey: '--game-xp', label: 'Game XP', description: 'XP/progression accent color.' },
  { tokenKey: '--timer-bg', label: 'Timer Background', description: 'Timer default background color.' },
  { tokenKey: '--timer-fg', label: 'Timer Text', description: 'Timer text color.' },
  { tokenKey: '--timer-warning', label: 'Timer Warning', description: 'Timer warning color.' },
  { tokenKey: '--timer-critical', label: 'Timer Critical', description: 'Timer critical color.' },
  { tokenKey: '--question-card-bg', label: 'Question Card Surface', description: 'Quiz question card background color.' },
  { tokenKey: '--answer-option-bg', label: 'Answer Option', description: 'Default answer option background color.' },
  { tokenKey: '--answer-option-selected-bg', label: 'Answer Option Selected', description: 'Selected answer option background color.' },
  { tokenKey: '--answer-option-correct-bg', label: 'Answer Option Correct', description: 'Correct answer option background color.' },
  { tokenKey: '--answer-option-incorrect-bg', label: 'Answer Option Incorrect', description: 'Incorrect answer option background color.' },
  { tokenKey: '--score-badge-bg', label: 'Score Badge', description: 'Score badge background color.' },
  { tokenKey: '--energy-bar-bg', label: 'Energy Bar Background', description: 'Energy/progress bar background color.' },
  { tokenKey: '--leaderboard-row-bg', label: 'Leaderboard Row', description: 'Leaderboard row background color.' },
  { tokenKey: '--arena-bg', label: 'Arena Background', description: 'Quiz arena background color.' },
  { tokenKey: '--game-card-face-bg', label: 'Game Card Face', description: 'Game card face background color.' },
];

const PROGRESS_PRIMITIVES: PrimitiveTokenConfig[] = [
  { tokenKey: '--progress-bar-bg', label: 'Progress Track', description: 'Progress bar track/background color.' },
  { tokenKey: '--progress-bar-fill', label: 'Progress Fill', description: 'Progress bar fill color.' },
];

const ADMIN_SURFACE_PRIMITIVES: PrimitiveTokenConfig[] = [
  { tokenKey: '--admin-sidebar-bg', label: 'Admin Sidebar Background', description: 'Admin sidebar background color.' },
  { tokenKey: '--admin-sidebar-fg', label: 'Admin Sidebar Text', description: 'Admin sidebar text color.' },
];

const HERO_PRIMITIVES: PrimitiveTokenConfig[] = [
  { tokenKey: '--hero-audience-pill-bg', label: 'Hero Audience Pill', description: 'Hero audience-pill background color.' },
];

const CONTRACT_PRIMITIVES: PrimitiveTokenConfig[] = getContractRequiredTokens()
  .sort((a, b) => a.localeCompare(b))
  .map((tokenKey) => ({
    tokenKey,
    label: tokenKeyLabel(tokenKey),
    description: 'Contract-required token used by one or more UI Kit primitives.',
  }));

export function ControlRail({ className }: { className?: string }) {
  const { state, updateToken, updateField, registerSection, highlightedSection, isPlatform } = useBrandEditor();

  const fontsRef = useRef<HTMLDivElement>(null);
  const supportLinksRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    registerSection('fonts', fontsRef.current);
    registerSection('support-links', supportLinksRef.current);
    registerSection('settings', settingsRef.current);
    return () => {
      registerSection('fonts', null);
      registerSection('support-links', null);
      registerSection('settings', null);
    };
  }, [registerSection]);

  return (
    <ScrollArea className={cn("h-full", className)} data-testid="control-rail">
      <div className="divide-y">
        <Section 
          id="brand-identity" 
          title="Brand Identity" 
          icon={<Building2 className="h-4 w-4" />}
          defaultOpen
        >
          <InputField
            label="Theme Name"
            id="theme-name"
            value={state.themeName}
            onChange={(v) => updateField('themeName', v)}
            placeholder="My Custom Theme"
          />
          <InputField
            label="Brand Name"
            id="brand-name"
            value={state.brandName}
            onChange={(v) => updateField('brandName', v)}
            placeholder="Your Organization"
          />
          <InputField
            label="Description"
            id="description"
            value={state.description}
            onChange={(v) => updateField('description', v)}
            placeholder="Theme description..."
          />
        </Section>

        <Section 
          id="logos" 
          title="Logos & Images" 
          icon={<ImageIcon className="h-4 w-4" />}
        >
          <ImageUploadField
            label="Logo"
            id="logo-url"
            value={state.logoUrl}
            onChange={(v) => updateField('logoUrl', v)}
            placeholder="https://... or upload"
            acceptedTypes=".png,.jpg,.jpeg,.gif,.webp"
            uploadType="logo"
            isPlatform={isPlatform}
          />
          <ImageUploadField
            label="Favicon"
            id="favicon-url"
            value={state.faviconUrl}
            onChange={(v) => updateField('faviconUrl', v)}
            placeholder="https://... or upload"
            acceptedTypes=".png,.jpg,.jpeg,.gif,.webp"
            uploadType="favicon"
            isPlatform={isPlatform}
          />
        </Section>

        <Section 
          id="base-colors" 
          title="Base Colors" 
          icon={<Palette className="h-4 w-4" />}
          defaultOpen
        >
          <RegisteredColorPicker
            tokenKey="--primary"
            label="Primary"
            description="Main brand color for buttons and links"
            defaultValue="#3b82f6"
            contrastWithToken="--primary-foreground"
          />
          <RegisteredColorPicker
            tokenKey="--primary-foreground"
            label="Primary Foreground"
            description="Text color on primary backgrounds"
            defaultValue="#ffffff"
            contrastWithToken="--primary"
          />
          <RegisteredColorPicker
            tokenKey="--secondary"
            label="Secondary"
            description="Secondary brand color"
            defaultValue="#1e293b"
            contrastWithToken="--secondary-foreground"
          />
          <RegisteredColorPicker
            tokenKey="--secondary-foreground"
            label="Secondary Foreground"
            description="Text color on secondary backgrounds"
            defaultValue="#ffffff"
            contrastWithToken="--secondary"
          />
          <RegisteredColorPicker
            tokenKey="--accent"
            label="Accent"
            description="Highlight and accent color"
            defaultValue="#60a5fa"
            contrastWithToken="--accent-foreground"
          />
          <RegisteredColorPicker
            tokenKey="--accent-foreground"
            label="Accent Foreground"
            description="Text color on accent backgrounds"
            defaultValue="#ffffff"
            contrastWithToken="--accent"
          />
          <div className="pt-2 border-t space-y-3">
            <p className="text-xs text-muted-foreground">Action, status, and link primitives</p>
            {BASE_COLOR_PRIMITIVES.map((primitive) => (
              <RegisteredTokenInput
                key={primitive.tokenKey}
                tokenKey={primitive.tokenKey}
                label={primitive.label}
                description={primitive.description}
                defaultValue={primitive.defaultValue}
                kind={primitive.kind}
              />
            ))}
          </div>
        </Section>

        <Section 
          id="surfaces" 
          title="Surfaces & Backgrounds" 
          icon={<Layers className="h-4 w-4" />}
        >
          <RegisteredColorPicker
            tokenKey="--background"
            label="Background"
            description="Main page background"
            defaultValue="#09090b"
          />
          <RegisteredColorPicker
            tokenKey="--foreground"
            label="Foreground"
            description="Main text color"
            defaultValue="#fafafa"
            contrastWithToken="--background"
          />
          <RegisteredColorPicker
            tokenKey="--card"
            label="Card"
            description="Card and panel backgrounds"
            defaultValue="#18181b"
            contrastWithToken="--card-foreground"
          />
          <RegisteredColorPicker
            tokenKey="--card-foreground"
            label="Card Foreground"
            description="Text color on cards"
            defaultValue="#fafafa"
            contrastWithToken="--card"
          />
          <RegisteredColorPicker
            tokenKey="--muted"
            label="Muted"
            description="Subtle backgrounds"
            defaultValue="#27272a"
            contrastWithToken="--muted-foreground"
          />
          <RegisteredColorPicker
            tokenKey="--muted-foreground"
            label="Muted Foreground"
            description="Text color on muted backgrounds"
            defaultValue="#a1a1aa"
            contrastWithToken="--muted"
          />
          <RegisteredColorPicker
            tokenKey="--border"
            label="Border"
            description="Border colors"
            defaultValue="#27272a"
          />
          <RegisteredColorPicker
            tokenKey="--ring"
            label="Ring"
            description="Focus ring color"
            defaultValue="#3b82f6"
          />
          <div className="pt-2 border-t space-y-3">
            <p className="text-xs text-muted-foreground">Surface and container primitives</p>
            {SURFACE_PRIMITIVES.map((primitive) => (
              <RegisteredTokenInput
                key={primitive.tokenKey}
                tokenKey={primitive.tokenKey}
                label={primitive.label}
                description={primitive.description}
                defaultValue={primitive.defaultValue}
                kind={primitive.kind}
              />
            ))}
          </div>
          <div className="pt-2 border-t space-y-3">
            <p className="text-xs text-muted-foreground">Platform surfaces</p>
            {SURFACE_PLATFORM_PRIMITIVES.map((primitive) => (
              <RegisteredTokenInput
                key={primitive.tokenKey}
                tokenKey={primitive.tokenKey}
                label={primitive.label}
                description={primitive.description}
                defaultValue={primitive.defaultValue}
                kind={primitive.kind}
              />
            ))}
          </div>
        </Section>

        <Section 
          id="typography" 
          title="Typography" 
          icon={<Type className="h-4 w-4" />}
        >
          <div ref={fontsRef} className={cn(
            "space-y-4 transition-all duration-300",
            highlightedSection === 'fonts' && "bg-primary/5 ring-2 ring-primary ring-inset rounded-lg p-2 -m-2"
          )}>
            <FontSelect
              label="Heading Font"
              id="heading-font"
              value={state.headingFont || 'Inter, system-ui, sans-serif'}
              onChange={(v) => updateField('headingFont', v)}
            />
            <FontSelect
              label="Body Font"
              id="body-font"
              value={state.bodyFont || 'Inter, system-ui, sans-serif'}
              onChange={(v) => updateField('bodyFont', v)}
            />
          </div>
          <div className="pt-2 border-t space-y-3">
            <p className="text-xs text-muted-foreground">Spacing primitives used by UI Kit samples</p>
            {TYPOGRAPHY_SPACING_PRIMITIVES.map((primitive) => (
              <RegisteredTokenInput
                key={primitive.tokenKey}
                tokenKey={primitive.tokenKey}
                label={primitive.label}
                description={primitive.description}
                defaultValue={primitive.defaultValue}
                kind={primitive.kind}
              />
            ))}
          </div>
        </Section>

        <Section
          id="navigation"
          title="Navigation"
          icon={<Layers className="h-4 w-4" />}
        >
          {NAVIGATION_PRIMITIVES.map((primitive) => (
            <RegisteredTokenInput
              key={primitive.tokenKey}
              tokenKey={primitive.tokenKey}
              label={primitive.label}
              description={primitive.description}
              defaultValue={primitive.defaultValue}
                kind={primitive.kind}
            />
          ))}
        </Section>

        <Section
          id="forms"
          title="Forms & Inputs"
          icon={<Settings className="h-4 w-4" />}
        >
          {FORM_PRIMITIVES.map((primitive) => (
            <RegisteredTokenInput
              key={primitive.tokenKey}
              tokenKey={primitive.tokenKey}
              label={primitive.label}
              description={primitive.description}
              defaultValue={primitive.defaultValue}
                kind={primitive.kind}
            />
          ))}
          {FORM_EXTENDED_PRIMITIVES.map((primitive) => (
            <RegisteredTokenInput
              key={primitive.tokenKey}
              tokenKey={primitive.tokenKey}
              label={primitive.label}
              description={primitive.description}
              defaultValue={primitive.defaultValue}
                kind={primitive.kind}
            />
          ))}
        </Section>

        <Section
          id="tables"
          title="Tables"
          icon={<FileText className="h-4 w-4" />}
        >
          {TABLE_PRIMITIVES.map((primitive) => (
            <RegisteredTokenInput
              key={primitive.tokenKey}
              tokenKey={primitive.tokenKey}
              label={primitive.label}
              description={primitive.description}
              defaultValue={primitive.defaultValue}
                kind={primitive.kind}
            />
          ))}
          {TABLE_EXTENDED_PRIMITIVES.map((primitive) => (
            <RegisteredTokenInput
              key={primitive.tokenKey}
              tokenKey={primitive.tokenKey}
              label={primitive.label}
              description={primitive.description}
              defaultValue={primitive.defaultValue}
                kind={primitive.kind}
            />
          ))}
        </Section>

        <Section
          id="notifications"
          title="Notifications"
          icon={<LifeBuoy className="h-4 w-4" />}
        >
          {NOTIFICATION_PRIMITIVES.map((primitive) => (
            <RegisteredTokenInput
              key={primitive.tokenKey}
              tokenKey={primitive.tokenKey}
              label={primitive.label}
              description={primitive.description}
              defaultValue={primitive.defaultValue}
                kind={primitive.kind}
            />
          ))}
        </Section>

        <Section
          id="hero"
          title="Hero"
          icon={<Sparkles className="h-4 w-4" />}
        >
          {HERO_PRIMITIVES.map((primitive) => (
            <RegisteredTokenInput
              key={primitive.tokenKey}
              tokenKey={primitive.tokenKey}
              label={primitive.label}
              description={primitive.description}
              defaultValue={primitive.defaultValue}
                kind={primitive.kind}
            />
          ))}
        </Section>

        <Section
          id="progress"
          title="Progress"
          icon={<Settings className="h-4 w-4" />}
        >
          {PROGRESS_PRIMITIVES.map((primitive) => (
            <RegisteredTokenInput
              key={primitive.tokenKey}
              tokenKey={primitive.tokenKey}
              label={primitive.label}
              description={primitive.description}
              defaultValue={primitive.defaultValue}
                kind={primitive.kind}
            />
          ))}
        </Section>

        <Section
          id="certificates"
          title="Certificates"
          icon={<FileText className="h-4 w-4" />}
        >
          {CERTIFICATE_PRIMITIVES.map((primitive) => (
            <RegisteredTokenInput
              key={primitive.tokenKey}
              tokenKey={primitive.tokenKey}
              label={primitive.label}
              description={primitive.description}
              defaultValue={primitive.defaultValue}
                kind={primitive.kind}
            />
          ))}
        </Section>

        <Section
          id="email-templates"
          title="Email Templates"
          icon={<FileText className="h-4 w-4" />}
        >
          {EMAIL_TEMPLATE_PRIMITIVES.map((primitive) => (
            <RegisteredTokenInput
              key={primitive.tokenKey}
              tokenKey={primitive.tokenKey}
              label={primitive.label}
              description={primitive.description}
              defaultValue={primitive.defaultValue}
                kind={primitive.kind}
            />
          ))}
        </Section>

        <Section
          id="gamification"
          title="Gamification"
          icon={<Gamepad2 className="h-4 w-4" />}
        >
          {GAMIFICATION_PRIMITIVES.map((primitive) => (
            <RegisteredTokenInput
              key={primitive.tokenKey}
              tokenKey={primitive.tokenKey}
              label={primitive.label}
              description={primitive.description}
              defaultValue={primitive.defaultValue}
                kind={primitive.kind}
            />
          ))}
        </Section>

        <Section
          id="admin-surfaces"
          title="Admin Surfaces"
          icon={<Settings className="h-4 w-4" />}
        >
          {ADMIN_SURFACE_PRIMITIVES.map((primitive) => (
            <RegisteredTokenInput
              key={primitive.tokenKey}
              tokenKey={primitive.tokenKey}
              label={primitive.label}
              description={primitive.description}
              defaultValue={primitive.defaultValue}
                kind={primitive.kind}
            />
          ))}
        </Section>

        <Section
          id="primitive-contracts"
          title="Primitive Contracts"
          icon={<Layers className="h-4 w-4" />}
        >
          <p className="text-xs text-muted-foreground">
            Full contract token coverage for UI Kit primitives. This section ensures every required primitive token is directly editable.
          </p>
          {CONTRACT_PRIMITIVES.map((primitive) => (
            <RegisteredTokenInput
              key={primitive.tokenKey}
              tokenKey={primitive.tokenKey}
              label={primitive.label}
              description={primitive.description}
              defaultValue={primitive.defaultValue}
                kind={primitive.kind}
            />
          ))}
        </Section>

        <Section 
          id="gradients" 
          title="Page Gradient" 
          icon={<Sparkles className="h-4 w-4" />}
        >
          <div className="p-3 rounded-lg border bg-muted/30">
            <Label className="text-sm font-medium">Gradients Disabled Platform-Wide</Label>
            <p className="text-xs text-muted-foreground mt-1">
              LearnPlay now enforces flat token surfaces across all pages and primitives. Gradient inputs are retained in
              stored themes for backward compatibility but are ignored at runtime.
            </p>
          </div>
        </Section>

        <Section 
          id="game-quiz" 
          title="Game & Quiz" 
          icon={<Gamepad2 className="h-4 w-4" />}
        >
          <RegisteredColorPicker
            tokenKey="--game-primary"
            label="Game Primary"
            description="Primary color for game elements"
            defaultValue="#3b82f6"
          />
          <RegisteredColorPicker
            tokenKey="--game-glow"
            label="Game Glow"
            description="Glow effect color for game elements"
            defaultValue="rgba(59, 130, 246, 0.5)"
          />
        </Section>

        <Section 
          id="documents" 
          title="Documents & Emails" 
          icon={<FileText className="h-4 w-4" />}
        >
          <div 
            ref={settingsRef}
            className={cn(
              "flex items-center justify-between p-3 rounded-lg border transition-all duration-300",
              highlightedSection === 'settings' && "bg-primary/5 ring-2 ring-primary ring-inset"
            )}
          >
            <div>
              <Label className="text-sm font-medium">Email Branding</Label>
              <p className="text-xs text-muted-foreground">
                Apply branding to emails, invoices, and certificates
              </p>
            </div>
            <Switch
              checked={state.allowEmailBranding}
              onCheckedChange={(v) => updateField('allowEmailBranding', v)}
              data-testid="switch-email-branding"
            />
          </div>
        </Section>

        <CustomCopySection state={state} updateField={updateField} />

        <Section 
          id="support" 
          title="Support & Legal" 
          icon={<LifeBuoy className="h-4 w-4" />}
        >
          <div 
            ref={supportLinksRef}
            className={cn(
              "space-y-4 transition-all duration-300",
              highlightedSection === 'support-links' && "bg-primary/5 ring-2 ring-primary ring-inset rounded-lg p-2 -m-2"
            )}
          >
            <InputField
              label="Support Email"
              id="support-email"
              value={state.supportEmail}
              onChange={(v) => updateField('supportEmail', v)}
              placeholder="support@example.com"
              type="email"
            />
            <InputField
              label="Support URL"
              id="support-url"
              value={state.supportUrl}
              onChange={(v) => updateField('supportUrl', v)}
              placeholder="https://support.example.com"
            />
            <InputField
              label="Terms of Service URL"
              id="terms-url"
              value={state.termsUrl}
              onChange={(v) => updateField('termsUrl', v)}
              placeholder="https://example.com/terms"
            />
            <InputField
              label="Privacy Policy URL"
              id="privacy-url"
              value={state.privacyUrl}
              onChange={(v) => updateField('privacyUrl', v)}
              placeholder="https://example.com/privacy"
            />
          </div>
        </Section>
      </div>
    </ScrollArea>
  );
}

export default ControlRail;
