import { PreviewFrame, ClickableElement } from '../PreviewFrame';
import { X, ChevronRight, ChevronLeft, Check, AlertCircle, AlertTriangle, Info, CheckCircle, Bell, MoreHorizontal, Search, ChevronDown, Home, Settings, User, Loader2, ArrowUpDown, ArrowUp, ArrowDown, Trash2, Edit, Eye, Circle } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Calendar } from '@/components/ui/calendar';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { CountrySelector } from '@/components/ui/CountrySelector';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';

function SectionTitle({ children, id }: { children: React.ReactNode; id: string }) {
  return (
    <h2 
      id={id}
      className="text-lg font-semibold pb-2 border-b"
      style={{ color: 'var(--text-primary)', borderColor: 'var(--stroke-default)', fontFamily: 'var(--font-heading)', marginBottom: 'var(--space-md)' }}
      data-testid={`uikit-section-title-${id}`}
    >
      {children}
    </h2>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 'var(--space-md)' }}>
      <h3 className="text-sm font-medium" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-heading)', marginBottom: 'var(--space-sm)' }}>
        {title}
      </h3>
      {children}
    </div>
  );
}

export function PreviewUIKit() {
  return (
    <PreviewFrame className="min-h-[600px]" data-testid="preview-uikit">
      <div style={{ padding: 'var(--space-lg)', backgroundColor: 'var(--surface-primary)' }} className="space-y-8">
        
        {/* ========================================
            0. TYPOGRAPHY & SPACING SECTION
        ======================================== */}
        <section data-section="typography" data-testid="uikit-typography-section">
          <SectionTitle id="typography">Typography & Spacing</SectionTitle>
          
          <SubSection title="Heading Font Family">
            <div className="space-y-3">
              <ClickableElement
                editKey="--font-heading"
                as="h1"
                className="text-4xl font-bold"
                style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}
                data-testid="uikit-heading-h1"
                aria-label="Edit heading font family"
              >
                H1 - Page Title
              </ClickableElement>
              <ClickableElement
                editKey="--font-heading"
                as="h2"
                className="text-3xl font-bold"
                style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}
                data-testid="uikit-heading-h2"
                aria-label="Edit heading font family"
              >
                H2 - Section Title
              </ClickableElement>
              <ClickableElement
                editKey="--font-heading"
                as="h3"
                className="text-2xl font-semibold"
                style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}
                data-testid="uikit-heading-h3"
                aria-label="Edit heading font family"
              >
                H3 - Subsection Title
              </ClickableElement>
              <ClickableElement
                editKey="--font-heading"
                as="h4"
                className="text-xl font-semibold"
                style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}
                data-testid="uikit-heading-h4"
                aria-label="Edit heading font family"
              >
                H4 - Card Title
              </ClickableElement>
              <ClickableElement
                editKey="--font-heading"
                as="h5"
                className="text-lg font-medium"
                style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}
                data-testid="uikit-heading-h5"
                aria-label="Edit heading font family"
              >
                H5 - Widget Title
              </ClickableElement>
              <ClickableElement
                editKey="--font-heading"
                as="h6"
                className="text-base font-medium"
                style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}
                data-testid="uikit-heading-h6"
                aria-label="Edit heading font family"
              >
                H6 - Small Title
              </ClickableElement>
            </div>
          </SubSection>

          <SubSection title="Body Font Family">
            <div className="space-y-3">
              <ClickableElement
                editKey="--font-body"
                as="p"
                className="text-base"
                style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
                data-testid="uikit-body-paragraph"
                aria-label="Edit body font family"
              >
                This is a paragraph of body text. The body font is used for all readable content including descriptions, instructions, and general information throughout the application.
              </ClickableElement>
              <ClickableElement
                editKey="--font-body"
                as="span"
                className="text-sm"
                style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}
                data-testid="uikit-body-small"
                aria-label="Edit body font family"
              >
                Small text (14px) - Used for captions, labels, and secondary information.
              </ClickableElement>
              <ClickableElement
                editKey="--font-body"
                as="span"
                className="text-xs block"
                style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}
                data-testid="uikit-body-xs"
                aria-label="Edit body font family"
              >
                Extra small text (12px) - Used for timestamps, metadata, and fine print.
              </ClickableElement>
            </div>
          </SubSection>

          <SubSection title="Spacing Scale">
            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <ClickableElement
                  editKey="--space-xs"
                  className="flex items-center"
                  style={{ gap: 'var(--space-sm)' }}
                  data-testid="uikit-spacing-xs"
                  aria-label="Edit extra small spacing"
                >
                  <div 
                    className="rounded"
                    style={{ 
                      width: 'var(--space-xs)', 
                      height: '24px', 
                      backgroundColor: 'var(--action-primary)',
                      minWidth: '4px'
                    }} 
                  />
                  <span className="text-sm" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>--space-xs (Extra Small)</span>
                </ClickableElement>
              </div>
              <div className="flex items-center gap-4">
                <ClickableElement
                  editKey="--space-sm"
                  className="flex items-center"
                  style={{ gap: 'var(--space-sm)' }}
                  data-testid="uikit-spacing-sm"
                  aria-label="Edit small spacing"
                >
                  <div 
                    className="rounded"
                    style={{ 
                      width: 'var(--space-sm)', 
                      height: '24px', 
                      backgroundColor: 'var(--action-primary)',
                      minWidth: '8px'
                    }} 
                  />
                  <span className="text-sm" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>--space-sm (Small)</span>
                </ClickableElement>
              </div>
              <div className="flex items-center gap-4">
                <ClickableElement
                  editKey="--space-md"
                  className="flex items-center"
                  style={{ gap: 'var(--space-sm)' }}
                  data-testid="uikit-spacing-md"
                  aria-label="Edit medium spacing"
                >
                  <div 
                    className="rounded"
                    style={{ 
                      width: 'var(--space-md)', 
                      height: '24px', 
                      backgroundColor: 'var(--action-primary)',
                      minWidth: '12px'
                    }} 
                  />
                  <span className="text-sm" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>--space-md (Medium)</span>
                </ClickableElement>
              </div>
              <div className="flex items-center gap-4">
                <ClickableElement
                  editKey="--space-lg"
                  className="flex items-center"
                  style={{ gap: 'var(--space-sm)' }}
                  data-testid="uikit-spacing-lg"
                  aria-label="Edit large spacing"
                >
                  <div 
                    className="rounded"
                    style={{ 
                      width: 'var(--space-lg)', 
                      height: '24px', 
                      backgroundColor: 'var(--action-primary)',
                      minWidth: '16px'
                    }} 
                  />
                  <span className="text-sm" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>--space-lg (Large)</span>
                </ClickableElement>
              </div>
              <div className="flex items-center gap-4">
                <ClickableElement
                  editKey="--space-xl"
                  className="flex items-center"
                  style={{ gap: 'var(--space-sm)' }}
                  data-testid="uikit-spacing-xl"
                  aria-label="Edit extra large spacing"
                >
                  <div 
                    className="rounded"
                    style={{ 
                      width: 'var(--space-xl)', 
                      height: '24px', 
                      backgroundColor: 'var(--action-primary)',
                      minWidth: '24px'
                    }} 
                  />
                  <span className="text-sm" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>--space-xl (Extra Large)</span>
                </ClickableElement>
              </div>
              <div className="flex items-center gap-4">
                <ClickableElement
                  editKey="--space-2xl"
                  className="flex items-center"
                  style={{ gap: 'var(--space-sm)' }}
                  data-testid="uikit-spacing-2xl"
                  aria-label="Edit 2XL spacing"
                >
                  <div 
                    className="rounded"
                    style={{ 
                      width: 'var(--space-2xl)', 
                      height: '24px', 
                      backgroundColor: 'var(--action-primary)',
                      minWidth: '32px'
                    }} 
                  />
                  <span className="text-sm" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>--space-2xl (2X Large)</span>
                </ClickableElement>
              </div>
              <div className="flex items-center gap-4">
                <ClickableElement
                  editKey="--space-3xl"
                  className="flex items-center"
                  style={{ gap: 'var(--space-sm)' }}
                  data-testid="uikit-spacing-3xl"
                  aria-label="Edit 3XL spacing"
                >
                  <div 
                    className="rounded"
                    style={{ 
                      width: 'var(--space-3xl)', 
                      height: '24px', 
                      backgroundColor: 'var(--action-primary)',
                      minWidth: '48px'
                    }} 
                  />
                  <span className="text-sm" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>--space-3xl (3X Large)</span>
                </ClickableElement>
              </div>
            </div>
          </SubSection>

          <SubSection title="Spacing in Context">
            <div className="flex flex-wrap gap-4">
              <ClickableElement
                editKey="--space-md"
                className="rounded-lg border"
                style={{ 
                  padding: 'var(--space-sm)',
                  backgroundColor: 'var(--surface-raised)',
                  borderColor: 'var(--stroke-default)'
                }}
                data-testid="uikit-spacing-context-sm"
                aria-label="Edit small padding"
              >
                <p className="text-sm" style={{ color: 'var(--text-on-surface)', fontFamily: 'var(--font-body)' }}>Padding: --space-sm</p>
              </ClickableElement>
              <ClickableElement
                editKey="--space-md"
                className="rounded-lg border"
                style={{ 
                  padding: 'var(--space-md)',
                  backgroundColor: 'var(--surface-raised)',
                  borderColor: 'var(--stroke-default)'
                }}
                data-testid="uikit-spacing-context-md"
                aria-label="Edit medium padding"
              >
                <p className="text-sm" style={{ color: 'var(--text-on-surface)', fontFamily: 'var(--font-body)' }}>Padding: --space-md</p>
              </ClickableElement>
              <ClickableElement
                editKey="--space-lg"
                className="rounded-lg border"
                style={{ 
                  padding: 'var(--space-lg)',
                  backgroundColor: 'var(--surface-raised)',
                  borderColor: 'var(--stroke-default)'
                }}
                data-testid="uikit-spacing-context-lg"
                aria-label="Edit large padding"
              >
                <p className="text-sm" style={{ color: 'var(--text-on-surface)', fontFamily: 'var(--font-body)' }}>Padding: --space-lg</p>
              </ClickableElement>
            </div>
          </SubSection>
        </section>

        {/* ========================================
            1. BUTTONS SECTION
        ======================================== */}
        <section data-section="buttons" data-testid="uikit-buttons-section">
          <SectionTitle id="buttons">Buttons</SectionTitle>
          
          <SubSection title="Primary Buttons">
            <div className="flex flex-wrap gap-3">
              <ClickableElement
                editKey="--btn-primary-bg"
                className="px-4 py-2 rounded-lg font-medium text-sm transition-colors"
                style={{ 
                  backgroundColor: 'var(--btn-primary-bg)', 
                  color: 'var(--btn-primary-fg)' 
                }}
                data-testid="uikit-btn-primary"
                aria-label="Edit primary button style"
              >
                Primary
              </ClickableElement>
              <ClickableElement
                editKey="--btn-primary-hover"
                className="px-4 py-2 rounded-lg font-medium text-sm"
                style={{ 
                  backgroundColor: 'var(--btn-primary-hover)', 
                  color: 'var(--btn-primary-fg)' 
                }}
                data-testid="uikit-btn-primary-hover"
                aria-label="Edit primary button hover state"
              >
                Hover
              </ClickableElement>
              <ClickableElement
                editKey="--btn-primary-active"
                className="px-4 py-2 rounded-lg font-medium text-sm"
                style={{ 
                  backgroundColor: 'var(--btn-primary-active, var(--btn-primary-hover))', 
                  color: 'var(--btn-primary-fg)',
                  transform: 'scale(0.98)'
                }}
                data-testid="uikit-btn-primary-active"
                aria-label="Edit primary button active/pressed state"
              >
                Active
              </ClickableElement>
              <ClickableElement
                editKey="--btn-focus-ring"
                className="px-4 py-2 rounded-lg font-medium text-sm"
                style={{ 
                  backgroundColor: 'var(--btn-primary-bg)', 
                  color: 'var(--btn-primary-fg)',
                  boxShadow: '0 0 0 3px var(--btn-focus-ring, var(--focus-ring))',
                  outline: '2px solid var(--btn-focus-outline, var(--action-primary))',
                  outlineOffset: '2px'
                }}
                data-testid="uikit-btn-primary-focus"
                aria-label="Edit primary button focus state"
              >
                Focus
              </ClickableElement>
              <ClickableElement
                editKey="--btn-primary-disabled-bg"
                className="px-4 py-2 rounded-lg font-medium text-sm cursor-not-allowed"
                style={{ 
                  backgroundColor: 'var(--btn-primary-disabled-bg)', 
                  color: 'var(--btn-primary-disabled-fg)' 
                }}
                data-testid="uikit-btn-primary-disabled"
                aria-label="Edit primary button disabled state"
              >
                Disabled
              </ClickableElement>
            </div>
          </SubSection>

          <SubSection title="Secondary Buttons">
            <div className="flex flex-wrap gap-3">
              <ClickableElement
                editKey="--btn-secondary-bg"
                className="px-4 py-2 rounded-lg font-medium text-sm"
                style={{ 
                  backgroundColor: 'var(--btn-secondary-bg)', 
                  color: 'var(--btn-secondary-fg)' 
                }}
                data-testid="uikit-btn-secondary"
                aria-label="Edit secondary button style"
              >
                Secondary
              </ClickableElement>
              <ClickableElement
                editKey="--btn-secondary-hover"
                className="px-4 py-2 rounded-lg font-medium text-sm"
                style={{ 
                  backgroundColor: 'var(--btn-secondary-hover)', 
                  color: 'var(--btn-secondary-fg)' 
                }}
                data-testid="uikit-btn-secondary-hover"
                aria-label="Edit secondary button hover state"
              >
                Secondary (Hover)
              </ClickableElement>
            </div>
          </SubSection>

          <SubSection title="Ghost & Outline Buttons">
            <div className="flex flex-wrap gap-3">
              <ClickableElement
                editKey="--btn-ghost-bg"
                className="px-4 py-2 rounded-lg font-medium text-sm border"
                style={{ 
                  backgroundColor: 'var(--btn-ghost-bg)', 
                  color: 'var(--btn-ghost-fg)',
                  borderColor: 'var(--btn-ghost-border)'
                }}
                data-testid="uikit-btn-ghost"
                aria-label="Edit ghost button style"
              >
                Ghost
              </ClickableElement>
              <ClickableElement
                editKey="--btn-ghost-hover"
                className="px-4 py-2 rounded-lg font-medium text-sm"
                style={{ 
                  backgroundColor: 'var(--btn-ghost-hover)', 
                  color: 'var(--btn-ghost-fg)' 
                }}
                data-testid="uikit-btn-ghost-hover"
                aria-label="Edit ghost button hover state"
              >
                Ghost (Hover)
              </ClickableElement>
              <ClickableElement
                editKey="--btn-outline-bg"
                className="px-4 py-2 rounded-lg font-medium text-sm border-2"
                style={{ 
                  backgroundColor: 'var(--btn-outline-bg)', 
                  color: 'var(--btn-outline-fg)',
                  borderColor: 'var(--btn-outline-border)'
                }}
                data-testid="uikit-btn-outline"
                aria-label="Edit outline button style"
              >
                Outline
              </ClickableElement>
              <ClickableElement
                editKey="--btn-outline-hover-bg"
                className="px-4 py-2 rounded-lg font-medium text-sm border-2"
                style={{ 
                  backgroundColor: 'var(--btn-outline-hover-bg)', 
                  color: 'var(--btn-outline-fg)',
                  borderColor: 'var(--btn-outline-hover-border)'
                }}
                data-testid="uikit-btn-outline-hover"
                aria-label="Edit outline button hover state"
              >
                Outline (Hover)
              </ClickableElement>
            </div>
          </SubSection>

          <SubSection title="Destructive & Status Buttons">
            <div className="flex flex-wrap gap-3">
              <ClickableElement
                editKey="--btn-danger-bg"
                className="px-4 py-2 rounded-lg font-medium text-sm"
                style={{ 
                  backgroundColor: 'var(--btn-danger-bg)', 
                  color: 'var(--btn-danger-fg)' 
                }}
                data-testid="uikit-btn-danger"
                aria-label="Edit danger button style"
              >
                Destructive
              </ClickableElement>
              <ClickableElement
                editKey="--btn-success-bg"
                className="px-4 py-2 rounded-lg font-medium text-sm"
                style={{ 
                  backgroundColor: 'var(--btn-success-bg)', 
                  color: 'var(--btn-success-fg)' 
                }}
                data-testid="uikit-btn-success"
                aria-label="Edit success button style"
              >
                Success
              </ClickableElement>
              <ClickableElement
                editKey="--btn-warning-bg"
                className="px-4 py-2 rounded-lg font-medium text-sm"
                style={{ 
                  backgroundColor: 'var(--btn-warning-bg)', 
                  color: 'var(--btn-warning-fg)' 
                }}
                data-testid="uikit-btn-warning"
                aria-label="Edit warning button style"
              >
                Warning
              </ClickableElement>
            </div>
          </SubSection>

          <SubSection title="Link Button">
            <ClickableElement
              editKey="--link-fg"
              className="px-4 py-2 text-sm font-medium underline-offset-4 hover:underline"
              style={{ color: 'var(--link-fg)' }}
              data-testid="uikit-btn-link"
              aria-label="Edit link button style"
            >
              Link Button
            </ClickableElement>
          </SubSection>
        </section>

        {/* ========================================
            1.5. LINKS SECTION
        ======================================== */}
        <section data-section="links" data-testid="uikit-links-section">
          <SectionTitle id="links">Links</SectionTitle>
          
          <SubSection title="Text Links">
            <div className="flex flex-wrap gap-6 items-center">
              <ClickableElement
                editKey="--link-fg"
                className="text-sm font-medium"
                style={{ 
                  color: 'var(--link-fg)'
                }}
                data-testid="uikit-link-normal"
                aria-label="Edit link color"
              >
                Normal Link
              </ClickableElement>
              <ClickableElement
                editKey="--link-hover-fg"
                className="text-sm font-medium underline"
                style={{ 
                  color: 'var(--link-hover-fg)',
                  textDecorationColor: 'var(--link-hover-underline, currentColor)'
                }}
                data-testid="uikit-link-hover"
                aria-label="Edit link hover color"
              >
                Link (Hover)
              </ClickableElement>
              <ClickableElement
                editKey="--link-active-fg"
                className="text-sm font-medium underline"
                style={{ 
                  color: 'var(--link-active-fg)',
                  opacity: 0.8
                }}
                data-testid="uikit-link-active"
                aria-label="Edit link active color"
              >
                Link (Active)
              </ClickableElement>
              <ClickableElement
                editKey="--link-visited-fg"
                className="text-sm font-medium"
                style={{ 
                  color: 'var(--link-visited-fg)'
                }}
                data-testid="uikit-link-visited"
                aria-label="Edit link visited color"
              >
                Link (Visited)
              </ClickableElement>
              <ClickableElement
                editKey="--link-focus-ring"
                className="text-sm font-medium rounded px-1"
                style={{ 
                  color: 'var(--link-fg)',
                  outline: '2px solid var(--link-focus-ring, var(--focus-ring))',
                  outlineOffset: '2px'
                }}
                data-testid="uikit-link-focus"
                aria-label="Edit link focus ring"
              >
                Link (Focus)
              </ClickableElement>
            </div>
          </SubSection>

          <SubSection title="Link Styles">
            <div className="flex flex-wrap gap-6 items-center">
              <ClickableElement
                editKey="--link-fg"
                className="text-sm font-medium flex items-center gap-1"
                style={{ color: 'var(--link-fg)' }}
                data-testid="uikit-link-with-icon"
                aria-label="Edit link with icon"
              >
                <span>External Link</span>
                <ChevronRight className="w-4 h-4" />
              </ClickableElement>
              <ClickableElement
                editKey="--link-muted-fg"
                className="text-sm"
                style={{ 
                  color: 'var(--link-muted-fg)',
                  textDecoration: 'underline',
                  textDecorationStyle: 'dotted'
                }}
                data-testid="uikit-link-muted"
                aria-label="Edit muted link style"
              >
                Muted Link
              </ClickableElement>
              <ClickableElement
                editKey="--destructive"
                className="text-sm font-medium"
                style={{ color: 'var(--destructive)' }}
                data-testid="uikit-link-destructive"
                aria-label="Edit destructive link style"
              >
                Delete Link
              </ClickableElement>
            </div>
          </SubSection>

          <SubSection title="Inline Links">
            <ClickableElement
              editKey="--link-fg"
              className="text-sm max-w-md"
              style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}
              data-testid="uikit-link-inline"
              aria-label="Edit inline link style"
            >
              This is a paragraph with an{' '}
              <span 
                className="font-medium underline underline-offset-2"
                style={{ color: 'var(--link-fg)' }}
              >
                inline link
              </span>{' '}
              that appears within text content. Here's another{' '}
              <span 
                className="font-medium"
                style={{ color: 'var(--link-hover-fg)', textDecoration: 'underline' }}
              >
                hovered link
              </span>{' '}
              showing the hover state.
            </ClickableElement>
          </SubSection>
        </section>

        {/* ========================================
            1.6. NAVIGATION SECTION
        ======================================== */}
        <section data-section="navigation" data-testid="uikit-navigation-section">
          <SectionTitle id="navigation">Navigation Items</SectionTitle>
          
          <SubSection title="Horizontal Navigation">
            <div
              className="flex items-center gap-1 p-1 rounded-lg"
              style={{ 
                backgroundColor: 'var(--nav-bg)',
                borderColor: 'var(--nav-border)'
              }}
              data-testid="uikit-nav-horizontal"
            >
              <ClickableElement
                editKey="--nav-item-active-bg"
                className="px-4 py-2 rounded-md text-sm font-medium"
                style={{ 
                  backgroundColor: 'var(--nav-item-active-bg)', 
                  color: 'var(--nav-item-active-fg)' 
                }}
                data-testid="uikit-nav-horizontal-active"
                aria-label="Edit horizontal navigation active item"
              >
                Active
              </ClickableElement>
              <ClickableElement
                editKey="--nav-item-hover-bg"
                className="px-4 py-2 rounded-md text-sm font-medium"
                style={{ 
                  backgroundColor: 'var(--nav-item-hover-bg)', 
                  color: 'var(--nav-item-hover-fg)' 
                }}
                data-testid="uikit-nav-horizontal-hover"
                aria-label="Edit horizontal navigation hover item"
              >
                Hover
              </ClickableElement>
              <ClickableElement
                editKey="--nav-item-fg"
                className="px-4 py-2 rounded-md text-sm font-medium"
                style={{ color: 'var(--nav-item-fg)' }}
                data-testid="uikit-nav-horizontal-normal"
                aria-label="Edit horizontal navigation normal item"
              >
                Normal
              </ClickableElement>
              <ClickableElement
                editKey="--nav-item-disabled-fg"
                className="px-4 py-2 rounded-md text-sm font-medium cursor-not-allowed"
                style={{ color: 'var(--nav-item-disabled-fg)', opacity: 0.5 }}
                data-testid="uikit-nav-horizontal-disabled"
                aria-label="Edit horizontal navigation disabled item"
              >
                Disabled
              </ClickableElement>
            </div>
          </SubSection>

          <SubSection title="Vertical Navigation / Sidebar">
            <div
              className="w-64 p-2 rounded-lg space-y-1"
              style={{ 
                backgroundColor: 'var(--sidebar-bg)',
                border: '1px solid var(--sidebar-border)'
              }}
              data-testid="uikit-nav-vertical"
            >
              <ClickableElement
                editKey="--sidebar-item-active-bg"
                className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium"
                style={{ 
                  backgroundColor: 'var(--sidebar-item-active-bg)', 
                  color: 'var(--sidebar-item-active-fg)' 
                }}
                data-testid="uikit-nav-vertical-active"
                aria-label="Edit vertical navigation active item"
              >
                <Home className="w-4 h-4" />
                Active Item
              </ClickableElement>
              <ClickableElement
                editKey="--sidebar-item-hover-bg"
                className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium"
                style={{ 
                  backgroundColor: 'var(--sidebar-item-hover-bg)', 
                  color: 'var(--sidebar-item-hover-fg)' 
                }}
                data-testid="uikit-nav-vertical-hover"
                aria-label="Edit vertical navigation hover item"
              >
                <Settings className="w-4 h-4" />
                Hover Item
              </ClickableElement>
              <ClickableElement
                editKey="--sidebar-item-fg"
                className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium"
                style={{ color: 'var(--sidebar-item-fg)' }}
                data-testid="uikit-nav-vertical-normal"
                aria-label="Edit vertical navigation normal item"
              >
                <User className="w-4 h-4" />
                Normal Item
              </ClickableElement>
              <ClickableElement
                editKey="--sidebar-item-disabled-fg"
                className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium cursor-not-allowed"
                style={{ color: 'var(--sidebar-item-disabled-fg)', opacity: 0.5 }}
                data-testid="uikit-nav-vertical-disabled"
                aria-label="Edit vertical navigation disabled item"
              >
                <Bell className="w-4 h-4" />
                Disabled Item
              </ClickableElement>
            </div>
          </SubSection>

          <SubSection title="Pill Navigation">
            <div className="flex flex-wrap gap-2">
              <ClickableElement
                editKey="--nav-pill-active-bg"
                className="px-4 py-2 rounded-full text-sm font-medium"
                style={{ 
                  backgroundColor: 'var(--nav-pill-active-bg)', 
                  color: 'var(--nav-pill-active-fg)' 
                }}
                data-testid="uikit-nav-pill-active"
                aria-label="Edit active pill navigation"
              >
                Active
              </ClickableElement>
              <ClickableElement
                editKey="--nav-pill-hover-bg"
                className="px-4 py-2 rounded-full text-sm font-medium"
                style={{ 
                  backgroundColor: 'var(--nav-pill-hover-bg)', 
                  color: 'var(--nav-pill-hover-fg)' 
                }}
                data-testid="uikit-nav-pill-hover"
                aria-label="Edit hover pill navigation"
              >
                Hover
              </ClickableElement>
              <ClickableElement
                editKey="--nav-pill-bg"
                className="px-4 py-2 rounded-full text-sm font-medium border"
                style={{ 
                  backgroundColor: 'var(--nav-pill-bg)', 
                  color: 'var(--nav-pill-fg)',
                  borderColor: 'var(--nav-pill-border)'
                }}
                data-testid="uikit-nav-pill-normal"
                aria-label="Edit normal pill navigation"
              >
                Normal
              </ClickableElement>
            </div>
          </SubSection>
        </section>

        {/* ========================================
            2. FORM ELEMENTS SECTION
        ======================================== */}
        <section data-section="forms" data-testid="uikit-forms-section">
          <SectionTitle id="forms">Form Elements</SectionTitle>
          
          <SubSection title="Input Fields">
            <div className="space-y-3 max-w-md">
              <div>
                <label className="block text-sm" style={{ color: 'var(--label-fg, var(--text-primary))', fontFamily: 'var(--font-body)', marginBottom: 'var(--space-xs)' }}>Normal Input</label>
                <ClickableElement
                  editKey="--input-bg"
                  className="w-full px-3 py-2 rounded-lg border text-sm"
                  style={{ 
                    backgroundColor: 'var(--input-bg)', 
                    color: 'var(--input-fg)',
                    borderColor: 'var(--input-border)'
                  }}
                  data-testid="uikit-input-normal"
                  aria-label="Edit input field style"
                >
                  <span style={{ color: 'var(--input-placeholder)' }}>Placeholder text...</span>
                </ClickableElement>
              </div>
              <div>
                <label className="block text-sm" style={{ color: 'var(--label-fg, var(--text-primary))', fontFamily: 'var(--font-body)', marginBottom: 'var(--space-xs)' }}>Focused Input</label>
                <ClickableElement
                  editKey="--input-focus-border"
                  className="w-full px-3 py-2 rounded-lg border-2 text-sm"
                  style={{ 
                    backgroundColor: 'var(--input-bg)', 
                    color: 'var(--input-fg)',
                    borderColor: 'var(--input-focus-border)',
                    boxShadow: '0 0 0 3px var(--input-focus-ring)'
                  }}
                  data-testid="uikit-input-focused"
                  aria-label="Edit input focus state"
                >
                  Typing here...
                </ClickableElement>
              </div>
              <div>
                <label className="block text-sm" style={{ color: 'var(--label-fg, var(--text-primary))', fontFamily: 'var(--font-body)', marginBottom: 'var(--space-xs)' }}>Error Input</label>
                <ClickableElement
                  editKey="--input-invalid-border"
                  className="w-full px-3 py-2 rounded-lg border text-sm"
                  style={{ 
                    backgroundColor: 'var(--input-invalid-bg)', 
                    color: 'var(--input-fg)',
                    borderColor: 'var(--input-invalid-border)'
                  }}
                  data-testid="uikit-input-error"
                  aria-label="Edit input error state"
                >
                  Invalid value
                </ClickableElement>
                <span className="text-xs mt-1 block" style={{ color: 'var(--destructive)' }}>This field is required</span>
              </div>
              <div>
                <label className="block text-sm" style={{ color: 'var(--label-fg, var(--text-primary))', fontFamily: 'var(--font-body)', marginBottom: 'var(--space-xs)' }}>Success Input</label>
                <ClickableElement
                  editKey="--input-success-border"
                  className="w-full px-3 py-2 rounded-lg border text-sm"
                  style={{ 
                    backgroundColor: 'var(--input-success-bg)', 
                    color: 'var(--input-fg)',
                    borderColor: 'var(--input-success-border)'
                  }}
                  data-testid="uikit-input-success"
                  aria-label="Edit input success state"
                >
                  Valid input
                </ClickableElement>
              </div>
              <div>
                <label className="block text-sm" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', marginBottom: 'var(--space-xs)' }}>Disabled Input</label>
                <ClickableElement
                  editKey="--input-disabled-bg"
                  className="w-full px-3 py-2 rounded-lg border text-sm cursor-not-allowed"
                  style={{ 
                    backgroundColor: 'var(--input-disabled-bg)', 
                    color: 'var(--input-disabled-fg)',
                    borderColor: 'var(--input-disabled-border)'
                  }}
                  data-testid="uikit-input-disabled"
                  aria-label="Edit input disabled state"
                >
                  Disabled input
                </ClickableElement>
              </div>
            </div>
          </SubSection>

          <SubSection title="Select Dropdown">
            <div className="max-w-xs">
              <ClickableElement
                editKey="--select-bg"
                className="w-full px-3 py-2 rounded-lg border text-sm flex items-center justify-between"
                style={{ 
                  backgroundColor: 'var(--select-bg)', 
                  color: 'var(--select-fg)',
                  borderColor: 'var(--select-border)'
                }}
                data-testid="uikit-select"
                aria-label="Edit select dropdown style"
              >
                <span>Select an option</span>
                <ChevronDown className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
              </ClickableElement>
              <ClickableElement
                editKey="--select-option-hover"
                className="w-full mt-1 rounded-lg border overflow-hidden"
                style={{ 
                  backgroundColor: 'var(--select-bg)', 
                  borderColor: 'var(--select-border)'
                }}
                data-testid="uikit-select-options"
                aria-label="Edit select options style"
              >
                <div className="px-3 py-2 text-sm" style={{ backgroundColor: 'var(--select-option-selected)', color: 'var(--select-fg)' }}>Option 1 (Selected)</div>
                <div className="px-3 py-2 text-sm" style={{ backgroundColor: 'var(--select-option-hover)', color: 'var(--select-fg)' }}>Option 2 (Hover)</div>
                <div className="px-3 py-2 text-sm" style={{ color: 'var(--select-fg)' }}>Option 3</div>
              </ClickableElement>
            </div>
          </SubSection>

          <SubSection title="Textarea">
            <div className="max-w-2xl">
              <label className="block text-sm" style={{ color: 'var(--label-fg, var(--text-primary))', fontFamily: 'var(--font-body)', marginBottom: 'var(--space-xs)' }}>
                Multi-line Input
              </label>
              <ClickableElement
                editKey="--input-bg"
                className="w-full min-h-[96px] rounded-lg border px-3 py-2 text-sm"
                style={{
                  backgroundColor: 'var(--input-bg)',
                  color: 'var(--input-fg)',
                  borderColor: 'var(--input-border)',
                }}
                data-testid="uikit-textarea"
                aria-label="Edit textarea style"
              >
                Describe your changes, notes, or feedback across multiple lines...
              </ClickableElement>
            </div>
          </SubSection>

          <SubSection title="Checkbox & Radio">
            <div className="flex flex-wrap gap-6">
              <div className="flex items-center gap-2">
                <ClickableElement
                  editKey="--checkbox-checked-bg"
                  className="w-5 h-5 rounded flex items-center justify-center"
                  style={{ 
                    backgroundColor: 'var(--checkbox-checked-bg)',
                    color: 'var(--checkbox-checked-fg)'
                  }}
                  data-testid="uikit-checkbox-checked"
                  aria-label="Edit checkbox checked state"
                >
                  <Check className="w-3 h-3" />
                </ClickableElement>
                <span className="text-sm" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>Checked</span>
              </div>
              <div className="flex items-center gap-2">
                <ClickableElement
                  editKey="--checkbox-border"
                  className="w-5 h-5 rounded border-2"
                  style={{ 
                    backgroundColor: 'var(--checkbox-bg)',
                    borderColor: 'var(--checkbox-border)'
                  }}
                  data-testid="uikit-checkbox-unchecked"
                  aria-label="Edit checkbox unchecked state"
                >
                  <span className="sr-only">Unchecked checkbox</span>
                </ClickableElement>
                <span className="text-sm" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>Unchecked</span>
              </div>
              <div className="flex items-center gap-2">
                <ClickableElement
                  editKey="--radio-checked-bg"
                  className="w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ 
                    backgroundColor: 'var(--radio-checked-bg)'
                  }}
                  data-testid="uikit-radio-checked"
                  aria-label="Edit radio checked state"
                >
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--radio-checked-fg)' }} />
                </ClickableElement>
                <span className="text-sm" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>Selected</span>
              </div>
              <div className="flex items-center gap-2">
                <ClickableElement
                  editKey="--radio-border"
                  className="w-5 h-5 rounded-full border-2"
                  style={{ 
                    backgroundColor: 'var(--radio-bg)',
                    borderColor: 'var(--radio-border)'
                  }}
                  data-testid="uikit-radio-unchecked"
                  aria-label="Edit radio unchecked state"
                >
                  <span className="sr-only">Unselected radio</span>
                </ClickableElement>
                <span className="text-sm" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>Unselected</span>
              </div>
            </div>
          </SubSection>

          <SubSection title="Switch / Toggle">
            <div className="flex flex-wrap gap-6">
              <div className="flex items-center gap-3">
                <ClickableElement
                  editKey="--switch-checked-bg"
                  className="w-11 h-6 rounded-full p-1 flex items-center justify-end"
                  style={{ backgroundColor: 'var(--switch-checked-bg)' }}
                  data-testid="uikit-switch-on"
                  aria-label="Edit switch on state"
                >
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: 'var(--switch-thumb)' }} />
                </ClickableElement>
                <span className="text-sm" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>On</span>
              </div>
              <div className="flex items-center gap-3">
                <ClickableElement
                  editKey="--switch-bg"
                  className="w-11 h-6 rounded-full p-1 flex items-center justify-start"
                  style={{ backgroundColor: 'var(--switch-bg)' }}
                  data-testid="uikit-switch-off"
                  aria-label="Edit switch off state"
                >
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: 'var(--switch-thumb)' }} />
                </ClickableElement>
                <span className="text-sm" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-body)' }}>Off</span>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <ClickableElement
                editKey="--btn-outline-bg"
                className="rounded-md border px-3 py-2 text-sm font-medium"
                style={{ backgroundColor: 'var(--btn-outline-bg)', color: 'var(--btn-outline-fg)', borderColor: 'var(--btn-outline-border)' }}
                data-testid="uikit-toggle-default"
              >
                Toggle Default
              </ClickableElement>
              <ClickableElement
                editKey="--action-accent"
                className="rounded-md border px-3 py-2 text-sm font-medium"
                style={{ backgroundColor: 'var(--action-accent)', color: 'var(--action-accent-fg)', borderColor: 'var(--action-accent)' }}
                data-testid="uikit-toggle-active"
              >
                Toggle Active
              </ClickableElement>
            </div>
          </SubSection>

          <SubSection title="Slider">
            <div className="max-w-xs">
              <ClickableElement
                editKey="--primary"
                className="relative h-2 rounded-full"
                style={{ backgroundColor: 'var(--surface-muted)' }}
                data-testid="uikit-slider"
                aria-label="Edit slider style"
              >
                <div 
                  className="absolute h-full rounded-full" 
                  style={{ backgroundColor: 'var(--action-primary)', width: '60%' }} 
                />
                <div 
                  className="absolute w-4 h-4 rounded-full border-2 -top-1"
                  style={{ 
                    backgroundColor: 'var(--surface-primary)', 
                    borderColor: 'var(--action-primary)',
                    left: 'calc(60% - 8px)'
                  }} 
                />
              </ClickableElement>
            </div>
          </SubSection>
        </section>

        {/* ========================================
            3. CHIPS & BADGES SECTION
        ======================================== */}
        <section data-section="badges" data-testid="uikit-badges-section">
          <SectionTitle id="badges">Chips & Badges</SectionTitle>
          
          <SubSection title="Primary Badges">
            <div className="flex flex-wrap gap-2">
              <ClickableElement
                editKey="--badge-bg"
                className="px-3 py-1 rounded-full text-xs font-medium"
                style={{ 
                  backgroundColor: 'var(--badge-bg)', 
                  color: 'var(--badge-fg)' 
                }}
                data-testid="uikit-badge-primary"
                aria-label="Edit primary badge style"
              >
                Primary
              </ClickableElement>
              <ClickableElement
                editKey="--badge-secondary-bg"
                className="px-3 py-1 rounded-full text-xs font-medium"
                style={{ 
                  backgroundColor: 'var(--badge-secondary-bg)', 
                  color: 'var(--badge-secondary-fg)' 
                }}
                data-testid="uikit-badge-secondary"
                aria-label="Edit secondary badge style"
              >
                Secondary
              </ClickableElement>
              <ClickableElement
                editKey="--badge-outline-border"
                className="px-3 py-1 rounded-full text-xs font-medium border"
                style={{ 
                  backgroundColor: 'var(--badge-outline-bg)', 
                  color: 'var(--badge-outline-fg)',
                  borderColor: 'var(--badge-outline-border)'
                }}
                data-testid="uikit-badge-outline"
                aria-label="Edit outline badge style"
              >
                Outline
              </ClickableElement>
            </div>
          </SubSection>

          <SubSection title="Status Badges">
            <div className="flex flex-wrap gap-2">
              <ClickableElement
                editKey="--success"
                className="px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1"
                style={{ 
                  backgroundColor: 'var(--success)', 
                  color: 'var(--success-foreground)' 
                }}
                data-testid="uikit-badge-success"
                aria-label="Edit success badge style"
              >
                <CheckCircle className="w-3 h-3" /> Success
              </ClickableElement>
              <ClickableElement
                editKey="--warning"
                className="px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1"
                style={{ 
                  backgroundColor: 'var(--warning)', 
                  color: 'var(--warning-foreground)' 
                }}
                data-testid="uikit-badge-warning"
                aria-label="Edit warning badge style"
              >
                <AlertTriangle className="w-3 h-3" /> Warning
              </ClickableElement>
              <ClickableElement
                editKey="--destructive"
                className="px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1"
                style={{ 
                  backgroundColor: 'var(--destructive)', 
                  color: 'var(--destructive-foreground)' 
                }}
                data-testid="uikit-badge-error"
                aria-label="Edit error badge style"
              >
                <AlertCircle className="w-3 h-3" /> Error
              </ClickableElement>
              <ClickableElement
                editKey="--accent"
                className="px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1"
                style={{ 
                  backgroundColor: 'var(--action-accent)', 
                  color: 'var(--action-accent-fg)' 
                }}
                data-testid="uikit-badge-info"
                aria-label="Edit info badge style"
              >
                <Info className="w-3 h-3" /> Info
              </ClickableElement>
            </div>
          </SubSection>

          <SubSection title="Badge Sizes">
            <div className="flex flex-wrap gap-2 items-center">
              <ClickableElement
                editKey="--badge-bg"
                className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                style={{ 
                  backgroundColor: 'var(--badge-bg)', 
                  color: 'var(--badge-fg)' 
                }}
                data-testid="uikit-badge-sm"
                aria-label="Edit small badge style"
              >
                Small
              </ClickableElement>
              <ClickableElement
                editKey="--badge-bg"
                className="px-3 py-1 rounded-full text-xs font-medium"
                style={{ 
                  backgroundColor: 'var(--badge-bg)', 
                  color: 'var(--badge-fg)' 
                }}
                data-testid="uikit-badge-md"
                aria-label="Edit medium badge style"
              >
                Medium
              </ClickableElement>
              <ClickableElement
                editKey="--badge-bg"
                className="px-4 py-1.5 rounded-full text-sm font-medium"
                style={{ 
                  backgroundColor: 'var(--badge-bg)', 
                  color: 'var(--badge-fg)' 
                }}
                data-testid="uikit-badge-lg"
                aria-label="Edit large badge style"
              >
                Large
              </ClickableElement>
            </div>
          </SubSection>

          <SubSection title="Notification Badges (Counts)">
            <div className="flex flex-wrap gap-4 items-center">
              <ClickableElement
                editKey="--destructive"
                className="relative inline-flex"
                data-testid="uikit-notification-badge"
                aria-label="Edit notification badge style"
              >
                <div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--surface-muted)' }}>
                  <Bell className="w-5 h-5" style={{ color: 'var(--text-primary)' }} />
                </div>
                <span 
                  className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
                  style={{ backgroundColor: 'var(--destructive)', color: 'var(--destructive-foreground)' }}
                >
                  3
                </span>
              </ClickableElement>
              <ClickableElement
                editKey="--primary"
                className="relative inline-flex"
                data-testid="uikit-notification-badge-primary"
                aria-label="Edit primary notification badge"
              >
                <div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--surface-muted)' }}>
                  <Bell className="w-5 h-5" style={{ color: 'var(--text-primary)' }} />
                </div>
                <span 
                  className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
                  style={{ backgroundColor: 'var(--action-primary)', color: 'var(--action-primary-fg)' }}
                >
                  12
                </span>
              </ClickableElement>
              <ClickableElement
                editKey="--success"
                className="relative inline-flex"
                data-testid="uikit-notification-badge-success"
                aria-label="Edit success notification badge"
              >
                <div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--surface-muted)' }}>
                  <Bell className="w-5 h-5" style={{ color: 'var(--text-primary)' }} />
                </div>
                <span 
                  className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center"
                  style={{ backgroundColor: 'var(--success)', color: 'var(--success-foreground)' }}
                >
                  99+
                </span>
              </ClickableElement>
              <ClickableElement
                editKey="--destructive"
                className="relative inline-flex"
                data-testid="uikit-notification-dot"
                aria-label="Edit notification dot style"
              >
                <div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--surface-muted)' }}>
                  <Bell className="w-5 h-5" style={{ color: 'var(--text-primary)' }} />
                </div>
                <span 
                  className="absolute top-0 right-0 w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: 'var(--destructive)' }}
                />
              </ClickableElement>
            </div>
          </SubSection>

          <SubSection title="Pills & Tags">
            <div className="flex flex-wrap gap-2">
              <ClickableElement
                editKey="--pill-bg"
                className="px-3 py-1 rounded-full text-xs font-medium border"
                style={{ 
                  backgroundColor: 'var(--pill-bg)', 
                  color: 'var(--pill-fg)',
                  borderColor: 'var(--pill-border)'
                }}
                data-testid="uikit-pill"
                aria-label="Edit pill style"
              >
                Filter Pill
              </ClickableElement>
              <ClickableElement
                editKey="--pill-active-bg"
                className="px-3 py-1 rounded-full text-xs font-medium"
                style={{ 
                  backgroundColor: 'var(--pill-active-bg)', 
                  color: 'var(--pill-active-fg)'
                }}
                data-testid="uikit-pill-active"
                aria-label="Edit active pill style"
              >
                Active Pill
              </ClickableElement>
              <ClickableElement
                editKey="--tag-bg"
                className="px-3 py-1 rounded text-xs font-medium border"
                style={{ 
                  backgroundColor: 'var(--tag-bg)', 
                  color: 'var(--tag-fg)',
                  borderColor: 'var(--tag-border)'
                }}
                data-testid="uikit-tag"
                aria-label="Edit tag style"
              >
                Tag
              </ClickableElement>
            </div>
          </SubSection>

          <SubSection title="Removable Chips">
            <div className="flex flex-wrap gap-2">
              <ClickableElement
                editKey="--pill-bg"
                className="px-3 py-1 rounded-full text-xs font-medium border flex items-center gap-1"
                style={{ 
                  backgroundColor: 'var(--pill-bg)', 
                  color: 'var(--pill-fg)',
                  borderColor: 'var(--pill-border)'
                }}
                data-testid="uikit-chip-removable"
                aria-label="Edit removable chip style"
              >
                Removable <X className="w-3 h-3 ml-1" />
              </ClickableElement>
              <ClickableElement
                editKey="--primary"
                className="px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1"
                style={{ 
                  backgroundColor: 'var(--action-primary)', 
                  color: 'var(--action-primary-fg)'
                }}
                data-testid="uikit-chip-removable-primary"
                aria-label="Edit removable primary chip style"
              >
                Selected <X className="w-3 h-3 ml-1" />
              </ClickableElement>
            </div>
          </SubSection>
        </section>

        {/* ========================================
            4. FILTER CHIPS SECTION
        ======================================== */}
        <section data-section="filter-chips" data-testid="uikit-filter-chips-section">
          <SectionTitle id="filter-chips">Filter Chips</SectionTitle>
          
          <SubSection title="Active & Inactive States">
            <div className="flex flex-wrap gap-2">
              <ClickableElement
                editKey="--filter-pill-active-bg"
                className="px-4 py-2 rounded-full text-sm font-medium transition-colors"
                style={{ 
                  backgroundColor: 'var(--filter-pill-active-bg, var(--action-primary))', 
                  color: 'var(--filter-pill-active-fg, var(--action-primary-fg))'
                }}
                data-testid="uikit-filter-chip-active"
                aria-label="Edit active filter chip style"
              >
                Active Filter
              </ClickableElement>
              <ClickableElement
                editKey="--filter-pill-bg"
                className="px-4 py-2 rounded-full text-sm font-medium border transition-colors"
                style={{ 
                  backgroundColor: 'var(--filter-pill-bg, var(--surface-muted))', 
                  color: 'var(--filter-pill-fg, var(--text-muted))',
                  borderColor: 'var(--filter-pill-border, var(--stroke-default))'
                }}
                data-testid="uikit-filter-chip-inactive"
                aria-label="Edit inactive filter chip style"
              >
                Inactive
              </ClickableElement>
              <ClickableElement
                editKey="--filter-pill-bg"
                className="px-4 py-2 rounded-full text-sm font-medium border transition-colors"
                style={{ 
                  backgroundColor: 'var(--filter-pill-hover-bg, var(--surface-muted))', 
                  color: 'var(--filter-pill-fg, var(--text-primary))',
                  borderColor: 'var(--filter-pill-border, var(--stroke-default))'
                }}
                data-testid="uikit-filter-chip-hover"
                aria-label="Edit filter chip hover state"
              >
                Hover State
              </ClickableElement>
            </div>
          </SubSection>

          <SubSection title="With Close Buttons">
            <div className="flex flex-wrap gap-2">
              <ClickableElement
                editKey="--filter-pill-active-bg"
                className="px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 transition-colors"
                style={{ 
                  backgroundColor: 'var(--filter-pill-active-bg, var(--action-primary))', 
                  color: 'var(--filter-pill-active-fg, var(--action-primary-fg))'
                }}
                data-testid="uikit-filter-chip-close-active"
                aria-label="Edit active filter chip with close button"
              >
                Category
                <X className="w-3.5 h-3.5" />
              </ClickableElement>
              <ClickableElement
                editKey="--filter-pill-active-bg"
                className="px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 transition-colors"
                style={{ 
                  backgroundColor: 'var(--filter-pill-active-bg, var(--action-primary))', 
                  color: 'var(--filter-pill-active-fg, var(--action-primary-fg))'
                }}
                data-testid="uikit-filter-chip-close-tag"
                aria-label="Edit filter chip with tag"
              >
                Price: $10-50
                <X className="w-3.5 h-3.5" />
              </ClickableElement>
              <ClickableElement
                editKey="--filter-pill-bg"
                className="px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 border"
                style={{ 
                  backgroundColor: 'var(--filter-pill-bg, var(--surface-muted))', 
                  color: 'var(--filter-pill-fg, var(--text-muted))',
                  borderColor: 'var(--filter-pill-border, var(--stroke-default))'
                }}
                data-testid="uikit-filter-chip-close-inactive"
                aria-label="Edit inactive filter chip with close"
              >
                Brand
                <X className="w-3.5 h-3.5" />
              </ClickableElement>
            </div>
          </SubSection>

          <SubSection title="Disabled State">
            <div className="flex flex-wrap gap-2">
              <ClickableElement
                editKey="--filter-pill-disabled-bg"
                className="px-4 py-2 rounded-full text-sm font-medium cursor-not-allowed opacity-50"
                style={{ 
                  backgroundColor: 'var(--filter-pill-disabled-bg, var(--surface-muted))', 
                  color: 'var(--filter-pill-disabled-fg, var(--text-muted))'
                }}
                data-testid="uikit-filter-chip-disabled"
                aria-label="Edit disabled filter chip style"
              >
                Disabled Filter
              </ClickableElement>
              <ClickableElement
                editKey="--filter-pill-disabled-bg"
                className="px-4 py-2 rounded-full text-sm font-medium flex items-center gap-2 cursor-not-allowed opacity-50"
                style={{ 
                  backgroundColor: 'var(--filter-pill-disabled-bg, var(--surface-muted))', 
                  color: 'var(--filter-pill-disabled-fg, var(--text-muted))'
                }}
                data-testid="uikit-filter-chip-disabled-close"
                aria-label="Edit disabled filter chip with close"
              >
                Disabled
                <X className="w-3.5 h-3.5" />
              </ClickableElement>
            </div>
          </SubSection>

          <SubSection title="Filter Chip Group">
            <ClickableElement
              editKey="--filter-pill-bg"
              className="flex flex-wrap gap-2 p-3 rounded-lg border"
              style={{ 
                backgroundColor: 'var(--surface-muted)',
                borderColor: 'var(--stroke-default)'
              }}
              data-testid="uikit-filter-chip-group"
              aria-label="Edit filter chip group container"
            >
              <div 
                className="px-3 py-1.5 rounded-full text-sm font-medium"
                style={{ backgroundColor: 'var(--filter-pill-active-bg, var(--action-primary))', color: 'var(--filter-pill-active-fg, var(--action-primary-fg))' }}
              >
                All
              </div>
              <div 
                className="px-3 py-1.5 rounded-full text-sm font-medium border"
                style={{ backgroundColor: 'var(--surface-primary)', color: 'var(--text-primary)', borderColor: 'var(--stroke-default)' }}
              >
                Active
              </div>
              <div 
                className="px-3 py-1.5 rounded-full text-sm font-medium border"
                style={{ backgroundColor: 'var(--surface-primary)', color: 'var(--text-primary)', borderColor: 'var(--stroke-default)' }}
              >
                Completed
              </div>
              <div 
                className="px-3 py-1.5 rounded-full text-sm font-medium border"
                style={{ backgroundColor: 'var(--surface-primary)', color: 'var(--text-primary)', borderColor: 'var(--stroke-default)' }}
              >
                Archived
              </div>
            </ClickableElement>
          </SubSection>
        </section>

        {/* ========================================
            5. TABS & NAVIGATION SECTION
        ======================================== */}
        <section data-section="tabs" data-testid="uikit-tabs-section">
          <SectionTitle id="tabs">Tabs & Navigation</SectionTitle>
          
          <SubSection title="Tab Variants">
            <ClickableElement
              editKey="--tab-active-bg"
              className="inline-flex p-1 rounded-lg"
              style={{ backgroundColor: 'var(--surface-muted)' }}
              data-testid="uikit-tabs"
              aria-label="Edit tabs style"
            >
              <div 
                className="px-4 py-2 rounded-md text-sm font-medium"
                style={{ backgroundColor: 'var(--tab-active-bg)', color: 'var(--tab-active-fg)' }}
              >
                Active Tab
              </div>
              <div 
                className="px-4 py-2 rounded-md text-sm font-medium"
                style={{ backgroundColor: 'var(--tab-hover-bg)', color: 'var(--tab-hover-fg)' }}
              >
                Hover Tab
              </div>
              <div 
                className="px-4 py-2 rounded-md text-sm font-medium"
                style={{ color: 'var(--tab-fg)' }}
              >
                Default Tab
              </div>
              <div 
                className="px-4 py-2 rounded-md text-sm font-medium"
                style={{ color: 'var(--tab-disabled-fg)' }}
              >
                Disabled
              </div>
            </ClickableElement>
          </SubSection>

          <SubSection title="Underline Tabs">
            <ClickableElement
              editKey="--tab-indicator"
              className="flex border-b"
              style={{ borderColor: 'var(--tab-border)' }}
              data-testid="uikit-tabs-underline"
              aria-label="Edit underline tabs style"
            >
              <div 
                className="px-4 py-2 text-sm font-medium border-b-2 -mb-px"
                style={{ color: 'var(--tab-active-fg)', borderColor: 'var(--tab-indicator)' }}
              >
                Active
              </div>
              <div className="px-4 py-2 text-sm font-medium" style={{ color: 'var(--tab-fg)' }}>
                Tab 2
              </div>
              <div className="px-4 py-2 text-sm font-medium" style={{ color: 'var(--tab-fg)' }}>
                Tab 3
              </div>
            </ClickableElement>
          </SubSection>

          <SubSection title="Breadcrumbs">
            <ClickableElement
              editKey="--nav-link"
              className="flex items-center gap-2 text-sm"
              data-testid="uikit-breadcrumbs"
              aria-label="Edit breadcrumbs style"
            >
              <Home className="w-4 h-4" style={{ color: 'var(--nav-link)' }} />
              <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
              <span style={{ color: 'var(--nav-link-hover)' }}>Products</span>
              <ChevronRight className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
              <span style={{ color: 'var(--text-primary)' }}>Category</span>
            </ClickableElement>
          </SubSection>

          <SubSection title="Pagination">
            <ClickableElement
              editKey="--btn-ghost-hover"
              className="flex items-center gap-1"
              data-testid="uikit-pagination"
              aria-label="Edit pagination style"
            >
              <div 
                className="w-8 h-8 rounded flex items-center justify-center text-sm"
                style={{ backgroundColor: 'var(--btn-ghost-hover)', color: 'var(--text-primary)' }}
              >
                <ChevronLeft className="w-4 h-4" />
              </div>
              <div 
                className="w-8 h-8 rounded flex items-center justify-center text-sm font-medium"
                style={{ backgroundColor: 'var(--action-primary)', color: 'var(--action-primary-fg)' }}
              >
                1
              </div>
              <div 
                className="w-8 h-8 rounded flex items-center justify-center text-sm"
                style={{ backgroundColor: 'var(--btn-ghost-hover)', color: 'var(--text-primary)' }}
              >
                2
              </div>
              <div 
                className="w-8 h-8 rounded flex items-center justify-center text-sm"
                style={{ color: 'var(--text-primary)' }}
              >
                3
              </div>
              <div 
                className="w-8 h-8 rounded flex items-center justify-center text-sm"
                style={{ color: 'var(--text-muted)' }}
              >
                ...
              </div>
              <div 
                className="w-8 h-8 rounded flex items-center justify-center text-sm"
                style={{ color: 'var(--text-primary)' }}
              >
                10
              </div>
              <div 
                className="w-8 h-8 rounded flex items-center justify-center text-sm"
                style={{ backgroundColor: 'var(--btn-ghost-hover)', color: 'var(--text-primary)' }}
              >
                <ChevronRight className="w-4 h-4" />
              </div>
            </ClickableElement>
          </SubSection>
        </section>

        {/* ========================================
            5. CARDS SECTION
        ======================================== */}
        <section data-section="cards" data-testid="uikit-cards-section">
          <SectionTitle id="cards">Cards</SectionTitle>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SubSection title="Basic Card">
              <ClickableElement
                editKey="--card-bg"
                className="rounded-xl p-4 border"
                style={{ 
                  backgroundColor: 'var(--card-bg)', 
                  borderColor: 'var(--card-border)',
                  boxShadow: '0 1px 3px var(--card-shadow)'
                }}
                data-testid="uikit-card-basic"
                aria-label="Edit basic card style"
              >
                <h4 className="font-semibold" style={{ color: 'var(--card-fg)' }}>Basic Card</h4>
                <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                  A simple card component with title and description.
                </p>
              </ClickableElement>
            </SubSection>

            <SubSection title="Glass Card">
              <ClickableElement
                editKey="--glass-card-bg"
                className="rounded-xl p-4 border backdrop-blur-sm"
                style={{ 
                  backgroundColor: 'var(--glass-card-bg)', 
                  borderColor: 'var(--glass-card-border)'
                }}
                data-testid="uikit-card-glass"
                aria-label="Edit glass card style"
              >
                <h4 className="font-semibold" style={{ color: 'var(--glass-card-title)' }}>Glass Card</h4>
                <p className="text-sm mt-1" style={{ color: 'var(--glass-card-body)' }}>
                  A translucent card with blur effect.
                </p>
              </ClickableElement>
            </SubSection>

            <SubSection title="Feature Card">
              <ClickableElement
                editKey="--feature-card-bg"
                className="rounded-xl p-4 border"
                style={{ 
                  backgroundColor: 'var(--feature-card-bg)', 
                  borderColor: 'var(--feature-card-border)'
                }}
                data-testid="uikit-card-feature"
                aria-label="Edit feature card style"
              >
                <div 
                  className="w-10 h-10 rounded-lg flex items-center justify-center mb-3"
                  style={{ backgroundColor: 'var(--feature-card-icon-bg)' }}
                >
                  <Settings className="w-5 h-5" style={{ color: 'var(--feature-card-icon-fg)' }} />
                </div>
                <h4 className="font-semibold" style={{ color: 'var(--feature-card-title)' }}>Feature Card</h4>
                <p className="text-sm mt-1" style={{ color: 'var(--feature-card-body)' }}>
                  Card with icon highlighting a feature.
                </p>
              </ClickableElement>
            </SubSection>

            <SubSection title="Stat Card">
              <ClickableElement
                editKey="--card-bg"
                className="rounded-xl p-4 border"
                style={{ 
                  backgroundColor: 'var(--card-bg)', 
                  borderColor: 'var(--card-border)'
                }}
                data-testid="uikit-card-stat"
                aria-label="Edit stat card style"
              >
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Total Revenue</p>
                <p className="text-2xl font-bold mt-1" style={{ color: 'var(--card-fg)' }}>$12,345</p>
                <p className="text-xs mt-1" style={{ color: 'var(--success)' }}>+12% from last month</p>
              </ClickableElement>
            </SubSection>

            <SubSection title="Hover State">
              <ClickableElement
                editKey="--card-hover-bg"
                className="rounded-xl p-4 border"
                style={{ 
                  backgroundColor: 'var(--card-hover-bg)', 
                  borderColor: 'var(--card-hover-border)',
                  boxShadow: '0 4px 12px var(--card-hover-shadow)'
                }}
                data-testid="uikit-card-hover"
                aria-label="Edit card hover state"
              >
                <h4 className="font-semibold" style={{ color: 'var(--card-fg)' }}>Hovered Card</h4>
                <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                  Card in hover state with enhanced shadow.
                </p>
              </ClickableElement>
            </SubSection>

            <SubSection title="Selected State">
              <ClickableElement
                editKey="--card-selected-bg"
                className="rounded-xl p-4 border-2"
                style={{ 
                  backgroundColor: 'var(--card-selected-bg)', 
                  borderColor: 'var(--card-selected-border)'
                }}
                data-testid="uikit-card-selected"
                aria-label="Edit card selected state"
              >
                <h4 className="font-semibold" style={{ color: 'var(--card-fg)' }}>Selected Card</h4>
                <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                  Card in selected/active state.
                </p>
              </ClickableElement>
            </SubSection>
          </div>
        </section>

        {/* ========================================
            6. RESPONSIVE TABLES SECTION
        ======================================== */}
        <section data-section="tables" data-testid="uikit-tables-section">
          <SectionTitle id="tables">Responsive Tables</SectionTitle>
          
          <SubSection title="Full Table with All Features">
            <ClickableElement
              editKey="--table-header-bg"
              className="rounded-lg border overflow-hidden"
              style={{ borderColor: 'var(--table-cell-border)' }}
              data-testid="uikit-table"
              aria-label="Edit table style"
            >
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ backgroundColor: 'var(--table-header-bg)' }}>
                    <th className="text-left px-4 py-3 font-medium border-b w-10" style={{ color: 'var(--table-header-fg)', borderColor: 'var(--table-header-border)' }}>
                      <div className="w-5 h-5 rounded border-2 flex items-center justify-center" style={{ borderColor: 'var(--checkbox-border)', backgroundColor: 'var(--checkbox-bg)' }}>
                        <span className="sr-only">Select all</span>
                      </div>
                    </th>
                    <th className="text-left px-4 py-3 font-medium border-b cursor-pointer" style={{ color: 'var(--table-header-fg)', borderColor: 'var(--table-header-border)' }}>
                      <div className="flex items-center gap-1">
                        Name
                        <ArrowUp className="w-4 h-4" style={{ color: 'var(--action-primary)' }} />
                      </div>
                    </th>
                    <th className="text-left px-4 py-3 font-medium border-b cursor-pointer" style={{ color: 'var(--table-header-fg)', borderColor: 'var(--table-header-border)' }}>
                      <div className="flex items-center gap-1">
                        Email
                        <ArrowUpDown className="w-4 h-4 opacity-50" />
                      </div>
                    </th>
                    <th className="text-left px-4 py-3 font-medium border-b cursor-pointer" style={{ color: 'var(--table-header-fg)', borderColor: 'var(--table-header-border)' }}>
                      <div className="flex items-center gap-1">
                        Status
                        <ArrowDown className="w-4 h-4" style={{ color: 'var(--action-primary)' }} />
                      </div>
                    </th>
                    <th className="text-right px-4 py-3 font-medium border-b" style={{ color: 'var(--table-header-fg)', borderColor: 'var(--table-header-border)' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ backgroundColor: 'var(--table-row-bg)' }}>
                    <td className="px-4 py-3 border-b" style={{ borderColor: 'var(--table-cell-border)' }}>
                      <div className="w-5 h-5 rounded flex items-center justify-center" style={{ backgroundColor: 'var(--checkbox-checked-bg)' }}>
                        <Check className="w-3 h-3" style={{ color: 'var(--checkbox-checked-fg)' }} />
                      </div>
                    </td>
                    <td className="px-4 py-3 border-b" style={{ color: 'var(--table-row-fg)', borderColor: 'var(--table-cell-border)' }}>John Doe</td>
                    <td className="px-4 py-3 border-b" style={{ color: 'var(--text-muted)', borderColor: 'var(--table-cell-border)' }}>john@example.com</td>
                    <td className="px-4 py-3 border-b" style={{ borderColor: 'var(--table-cell-border)' }}>
                      <span className="px-2 py-0.5 rounded-full text-xs" style={{ backgroundColor: 'var(--success)', color: 'var(--success-foreground)' }}>Active</span>
                    </td>
                    <td className="px-4 py-3 border-b text-right" style={{ borderColor: 'var(--table-cell-border)' }}>
                      <div className="flex items-center justify-end gap-2">
                        <Eye className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                        <Edit className="w-4 h-4" style={{ color: 'var(--action-primary)' }} />
                        <Trash2 className="w-4 h-4" style={{ color: 'var(--destructive)' }} />
                      </div>
                    </td>
                  </tr>
                  <tr style={{ backgroundColor: 'var(--table-row-alt-bg)' }}>
                    <td className="px-4 py-3 border-b" style={{ borderColor: 'var(--table-cell-border)' }}>
                      <div className="w-5 h-5 rounded border-2" style={{ borderColor: 'var(--checkbox-border)', backgroundColor: 'var(--checkbox-bg)' }} />
                    </td>
                    <td className="px-4 py-3 border-b" style={{ color: 'var(--table-row-fg)', borderColor: 'var(--table-cell-border)' }}>Jane Smith</td>
                    <td className="px-4 py-3 border-b" style={{ color: 'var(--text-muted)', borderColor: 'var(--table-cell-border)' }}>jane@example.com</td>
                    <td className="px-4 py-3 border-b" style={{ borderColor: 'var(--table-cell-border)' }}>
                      <span className="px-2 py-0.5 rounded-full text-xs" style={{ backgroundColor: 'var(--warning)', color: 'var(--warning-foreground)' }}>Pending</span>
                    </td>
                    <td className="px-4 py-3 border-b text-right" style={{ borderColor: 'var(--table-cell-border)' }}>
                      <div className="flex items-center justify-end gap-2">
                        <Eye className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                        <Edit className="w-4 h-4" style={{ color: 'var(--action-primary)' }} />
                        <Trash2 className="w-4 h-4" style={{ color: 'var(--destructive)' }} />
                      </div>
                    </td>
                  </tr>
                  <tr style={{ backgroundColor: 'var(--table-row-hover-bg)' }}>
                    <td className="px-4 py-3 border-b" style={{ borderColor: 'var(--table-cell-border)' }}>
                      <div className="w-5 h-5 rounded border-2" style={{ borderColor: 'var(--checkbox-border)', backgroundColor: 'var(--checkbox-bg)' }} />
                    </td>
                    <td className="px-4 py-3 border-b" style={{ color: 'var(--table-row-fg)', borderColor: 'var(--table-cell-border)' }}>Mike Johnson (Hover)</td>
                    <td className="px-4 py-3 border-b" style={{ color: 'var(--text-muted)', borderColor: 'var(--table-cell-border)' }}>mike@example.com</td>
                    <td className="px-4 py-3 border-b" style={{ borderColor: 'var(--table-cell-border)' }}>
                      <span className="px-2 py-0.5 rounded-full text-xs" style={{ backgroundColor: 'var(--destructive)', color: 'var(--destructive-foreground)' }}>Inactive</span>
                    </td>
                    <td className="px-4 py-3 border-b text-right" style={{ borderColor: 'var(--table-cell-border)' }}>
                      <div className="flex items-center justify-end gap-2">
                        <Eye className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                        <Edit className="w-4 h-4" style={{ color: 'var(--action-primary)' }} />
                        <Trash2 className="w-4 h-4" style={{ color: 'var(--destructive)' }} />
                      </div>
                    </td>
                  </tr>
                  <tr style={{ backgroundColor: 'var(--table-row-selected-bg)' }}>
                    <td className="px-4 py-3" style={{ borderColor: 'var(--table-cell-border)' }}>
                      <div className="w-5 h-5 rounded flex items-center justify-center" style={{ backgroundColor: 'var(--checkbox-checked-bg)' }}>
                        <Check className="w-3 h-3" style={{ color: 'var(--checkbox-checked-fg)' }} />
                      </div>
                    </td>
                    <td className="px-4 py-3" style={{ color: 'var(--table-row-selected-fg)' }}>Sarah Wilson (Selected)</td>
                    <td className="px-4 py-3" style={{ color: 'var(--text-muted)' }}>sarah@example.com</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-xs" style={{ backgroundColor: 'var(--success)', color: 'var(--success-foreground)' }}>Active</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Eye className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                        <Edit className="w-4 h-4" style={{ color: 'var(--action-primary)' }} />
                        <Trash2 className="w-4 h-4" style={{ color: 'var(--destructive)' }} />
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </ClickableElement>
          </SubSection>

          <SubSection title="Sortable Column Indicators">
            <div className="flex flex-wrap gap-4">
              <ClickableElement
                editKey="--table-header-bg"
                className="flex items-center gap-2 px-4 py-2 rounded-lg"
                style={{ backgroundColor: 'var(--table-header-bg)', color: 'var(--table-header-fg)' }}
                data-testid="uikit-sort-inactive"
                aria-label="Edit inactive sort indicator"
              >
                <span className="text-sm font-medium">Unsorted</span>
                <ArrowUpDown className="w-4 h-4 opacity-50" />
              </ClickableElement>
              <ClickableElement
                editKey="--primary"
                className="flex items-center gap-2 px-4 py-2 rounded-lg"
                style={{ backgroundColor: 'var(--table-header-bg)', color: 'var(--table-header-fg)' }}
                data-testid="uikit-sort-asc"
                aria-label="Edit ascending sort indicator"
              >
                <span className="text-sm font-medium">Sort Asc</span>
                <ArrowUp className="w-4 h-4" style={{ color: 'var(--action-primary)' }} />
              </ClickableElement>
              <ClickableElement
                editKey="--primary"
                className="flex items-center gap-2 px-4 py-2 rounded-lg"
                style={{ backgroundColor: 'var(--table-header-bg)', color: 'var(--table-header-fg)' }}
                data-testid="uikit-sort-desc"
                aria-label="Edit descending sort indicator"
              >
                <span className="text-sm font-medium">Sort Desc</span>
                <ArrowDown className="w-4 h-4" style={{ color: 'var(--action-primary)' }} />
              </ClickableElement>
            </div>
          </SubSection>
        </section>

        {/* ========================================
            7. AVATAR COMPONENTS SECTION
        ======================================== */}
        <section data-section="avatars" data-testid="uikit-avatars-section">
          <SectionTitle id="avatars">Avatar Components</SectionTitle>
          
          <SubSection title="Avatar Sizes">
            <div className="flex flex-wrap gap-4 items-end">
              <ClickableElement
                editKey="--avatar-bg"
                className="flex flex-col items-center gap-2"
                data-testid="uikit-avatar-xs"
                aria-label="Edit extra small avatar"
              >
                <div 
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-medium"
                  style={{ backgroundColor: 'var(--avatar-bg, var(--surface-muted))', color: 'var(--avatar-fg, var(--text-muted))' }}
                >
                  XS
                </div>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>24px</span>
              </ClickableElement>
              <ClickableElement
                editKey="--avatar-bg"
                className="flex flex-col items-center gap-2"
                data-testid="uikit-avatar-sm"
                aria-label="Edit small avatar"
              >
                <div 
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium"
                  style={{ backgroundColor: 'var(--avatar-bg, var(--surface-muted))', color: 'var(--avatar-fg, var(--text-muted))' }}
                >
                  SM
                </div>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>32px</span>
              </ClickableElement>
              <ClickableElement
                editKey="--avatar-bg"
                className="flex flex-col items-center gap-2"
                data-testid="uikit-avatar-md"
                aria-label="Edit medium avatar"
              >
                <div 
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium"
                  style={{ backgroundColor: 'var(--avatar-bg, var(--surface-muted))', color: 'var(--avatar-fg, var(--text-muted))' }}
                >
                  MD
                </div>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>40px</span>
              </ClickableElement>
              <ClickableElement
                editKey="--avatar-bg"
                className="flex flex-col items-center gap-2"
                data-testid="uikit-avatar-lg"
                aria-label="Edit large avatar"
              >
                <div 
                  className="w-12 h-12 rounded-full flex items-center justify-center text-base font-medium"
                  style={{ backgroundColor: 'var(--avatar-bg, var(--surface-muted))', color: 'var(--avatar-fg, var(--text-muted))' }}
                >
                  LG
                </div>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>48px</span>
              </ClickableElement>
              <ClickableElement
                editKey="--avatar-bg"
                className="flex flex-col items-center gap-2"
                data-testid="uikit-avatar-xl"
                aria-label="Edit extra large avatar"
              >
                <div 
                  className="w-16 h-16 rounded-full flex items-center justify-center text-lg font-medium"
                  style={{ backgroundColor: 'var(--avatar-bg, var(--surface-muted))', color: 'var(--avatar-fg, var(--text-muted))' }}
                >
                  XL
                </div>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>64px</span>
              </ClickableElement>
            </div>
          </SubSection>

          <SubSection title="Avatar with Image Placeholder">
            <div className="flex flex-wrap gap-4 items-center">
              <ClickableElement
                editKey="--primary"
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ backgroundColor: 'var(--action-primary)', color: 'var(--action-primary-fg)' }}
                data-testid="uikit-avatar-initials"
                aria-label="Edit avatar with initials"
              >
                <span className="text-sm font-semibold">JD</span>
              </ClickableElement>
              <ClickableElement
                editKey="--success"
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ backgroundColor: 'var(--success)', color: 'var(--success-foreground)' }}
                data-testid="uikit-avatar-initials-success"
                aria-label="Edit success avatar"
              >
                <span className="text-sm font-semibold">AB</span>
              </ClickableElement>
              <ClickableElement
                editKey="--warning"
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ backgroundColor: 'var(--warning)', color: 'var(--warning-foreground)' }}
                data-testid="uikit-avatar-initials-warning"
                aria-label="Edit warning avatar"
              >
                <span className="text-sm font-semibold">CD</span>
              </ClickableElement>
              <ClickableElement
                editKey="--muted"
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ backgroundColor: 'var(--surface-muted)', color: 'var(--text-muted)' }}
                data-testid="uikit-avatar-placeholder"
                aria-label="Edit placeholder avatar"
              >
                <User className="w-5 h-5" />
              </ClickableElement>
            </div>
          </SubSection>

          <SubSection title="Avatar Status Indicators">
            <div className="flex flex-wrap gap-6 items-center">
              <ClickableElement
                editKey="--success"
                className="relative"
                data-testid="uikit-avatar-online"
                aria-label="Edit online avatar status"
              >
                <div 
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: 'var(--action-primary)', color: 'var(--action-primary-fg)' }}
                >
                  <span className="text-sm font-semibold">ON</span>
                </div>
                <div 
                  className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2"
                  style={{ backgroundColor: 'var(--success)', borderColor: 'var(--surface-primary)' }}
                />
                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-xs whitespace-nowrap" style={{ color: 'var(--success)' }}>Online</span>
              </ClickableElement>
              <ClickableElement
                editKey="--muted-foreground"
                className="relative"
                data-testid="uikit-avatar-offline"
                aria-label="Edit offline avatar status"
              >
                <div 
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: 'var(--surface-muted)', color: 'var(--text-muted)' }}
                >
                  <span className="text-sm font-semibold">OF</span>
                </div>
                <div 
                  className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2"
                  style={{ backgroundColor: 'var(--text-muted)', borderColor: 'var(--surface-primary)' }}
                />
                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>Offline</span>
              </ClickableElement>
              <ClickableElement
                editKey="--warning"
                className="relative"
                data-testid="uikit-avatar-away"
                aria-label="Edit away avatar status"
              >
                <div 
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: 'var(--warning)', color: 'var(--warning-foreground)' }}
                >
                  <span className="text-sm font-semibold">AW</span>
                </div>
                <div 
                  className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2"
                  style={{ backgroundColor: 'var(--warning)', borderColor: 'var(--surface-primary)' }}
                />
                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-xs whitespace-nowrap" style={{ color: 'var(--warning)' }}>Away</span>
              </ClickableElement>
              <ClickableElement
                editKey="--destructive"
                className="relative"
                data-testid="uikit-avatar-busy"
                aria-label="Edit busy avatar status"
              >
                <div 
                  className="w-10 h-10 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: 'var(--destructive)', color: 'var(--destructive-foreground)' }}
                >
                  <span className="text-sm font-semibold">BU</span>
                </div>
                <div 
                  className="absolute bottom-0 right-0 w-3 h-3 rounded-full border-2"
                  style={{ backgroundColor: 'var(--destructive)', borderColor: 'var(--surface-primary)' }}
                />
                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-xs whitespace-nowrap" style={{ color: 'var(--destructive)' }}>Busy</span>
              </ClickableElement>
            </div>
          </SubSection>

          <SubSection title="Avatar Groups (Stacks)">
            <div className="flex flex-col gap-4">
              <ClickableElement
                editKey="--avatar-bg"
                className="flex -space-x-3"
                data-testid="uikit-avatar-group"
                aria-label="Edit avatar group"
              >
                <div 
                  className="w-10 h-10 rounded-full flex items-center justify-center border-2 z-40"
                  style={{ backgroundColor: 'var(--action-primary)', color: 'var(--action-primary-fg)', borderColor: 'var(--surface-primary)' }}
                >
                  <span className="text-sm font-semibold">A</span>
                </div>
                <div 
                  className="w-10 h-10 rounded-full flex items-center justify-center border-2 z-30"
                  style={{ backgroundColor: 'var(--success)', color: 'var(--success-foreground)', borderColor: 'var(--surface-primary)' }}
                >
                  <span className="text-sm font-semibold">B</span>
                </div>
                <div 
                  className="w-10 h-10 rounded-full flex items-center justify-center border-2 z-20"
                  style={{ backgroundColor: 'var(--warning)', color: 'var(--warning-foreground)', borderColor: 'var(--surface-primary)' }}
                >
                  <span className="text-sm font-semibold">C</span>
                </div>
                <div 
                  className="w-10 h-10 rounded-full flex items-center justify-center border-2 z-10"
                  style={{ backgroundColor: 'var(--surface-muted)', color: 'var(--text-muted)', borderColor: 'var(--surface-primary)' }}
                >
                  <span className="text-xs font-semibold">+5</span>
                </div>
              </ClickableElement>
              <ClickableElement
                editKey="--avatar-bg"
                className="flex -space-x-2"
                data-testid="uikit-avatar-group-small"
                aria-label="Edit small avatar group"
              >
                <div 
                  className="w-8 h-8 rounded-full flex items-center justify-center border-2 z-40"
                  style={{ backgroundColor: 'var(--action-primary)', color: 'var(--action-primary-fg)', borderColor: 'var(--surface-primary)' }}
                >
                  <span className="text-xs font-semibold">1</span>
                </div>
                <div 
                  className="w-8 h-8 rounded-full flex items-center justify-center border-2 z-30"
                  style={{ backgroundColor: 'var(--action-primary)', color: 'var(--action-primary-fg)', borderColor: 'var(--surface-primary)' }}
                >
                  <span className="text-xs font-semibold">2</span>
                </div>
                <div 
                  className="w-8 h-8 rounded-full flex items-center justify-center border-2 z-20"
                  style={{ backgroundColor: 'var(--action-primary)', color: 'var(--action-primary-fg)', borderColor: 'var(--surface-primary)' }}
                >
                  <span className="text-xs font-semibold">3</span>
                </div>
              </ClickableElement>
            </div>
          </SubSection>
        </section>

        {/* ========================================
            7. ALERTS & TOASTS SECTION
        ======================================== */}
        <section data-section="alerts" data-testid="uikit-alerts-section">
          <SectionTitle id="alerts">Alerts & Toasts</SectionTitle>
          
          <SubSection title="Alert Variants">
            <div className="space-y-3">
              <ClickableElement
                editKey="--accent"
                className="flex items-start gap-3 p-4 rounded-lg border"
                style={{ 
                  backgroundColor: 'var(--action-accent)', 
                  borderColor: 'var(--action-accent)'
                }}
                data-testid="uikit-alert-info"
                aria-label="Edit info alert style"
              >
                <Info className="w-5 h-5 shrink-0" style={{ color: 'var(--action-accent-fg)' }} />
                <div>
                  <p className="font-medium" style={{ color: 'var(--action-accent-fg)' }}>Information</p>
                  <p className="text-sm mt-0.5" style={{ color: 'var(--action-accent-fg)', opacity: 0.9 }}>This is an informational alert message.</p>
                </div>
              </ClickableElement>

              <ClickableElement
                editKey="--success"
                className="flex items-start gap-3 p-4 rounded-lg"
                style={{ backgroundColor: 'var(--alert-success-bg)' }}
                data-testid="uikit-alert-success"
                aria-label="Edit success alert style"
              >
                <CheckCircle className="w-5 h-5 shrink-0" style={{ color: 'var(--success)' }} />
                <div>
                  <p className="font-medium" style={{ color: 'var(--success)' }}>Success</p>
                  <p className="text-sm mt-0.5" style={{ color: 'var(--text-primary)' }}>Your changes have been saved successfully.</p>
                </div>
              </ClickableElement>

              <ClickableElement
                editKey="--warning"
                className="flex items-start gap-3 p-4 rounded-lg"
                style={{ backgroundColor: 'var(--alert-warning-bg)' }}
                data-testid="uikit-alert-warning"
                aria-label="Edit warning alert style"
              >
                <AlertTriangle className="w-5 h-5 shrink-0" style={{ color: 'var(--warning)' }} />
                <div>
                  <p className="font-medium" style={{ color: 'var(--warning)' }}>Warning</p>
                  <p className="text-sm mt-0.5" style={{ color: 'var(--text-primary)' }}>Please review the following items before proceeding.</p>
                </div>
              </ClickableElement>

              <ClickableElement
                editKey="--destructive"
                className="flex items-start gap-3 p-4 rounded-lg"
                style={{ backgroundColor: 'var(--alert-error-bg)' }}
                data-testid="uikit-alert-error"
                aria-label="Edit error alert style"
              >
                <AlertCircle className="w-5 h-5 shrink-0" style={{ color: 'var(--destructive)' }} />
                <div>
                  <p className="font-medium" style={{ color: 'var(--destructive)' }}>Error</p>
                  <p className="text-sm mt-0.5" style={{ color: 'var(--text-primary)' }}>Something went wrong. Please try again.</p>
                </div>
              </ClickableElement>
            </div>
          </SubSection>

          <SubSection title="Toast Notifications">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <ClickableElement
                editKey="--toast-bg"
                className="p-4 rounded-lg border shadow-elevated flex items-center gap-3"
                style={{ 
                  backgroundColor: 'var(--toast-bg)', 
                  borderColor: 'var(--toast-border)'
                }}
                data-testid="uikit-toast"
                aria-label="Edit toast style"
              >
                <Bell className="w-5 h-5" style={{ color: 'var(--action-primary)' }} />
                <div className="flex-1">
                  <p className="font-medium text-sm" style={{ color: 'var(--toast-fg)' }}>New Notification</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>You have a new message</p>
                </div>
                <X className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
              </ClickableElement>

              <ClickableElement
                editKey="--success"
                className="p-4 rounded-lg border shadow-elevated flex items-center gap-3"
                style={{ 
                  backgroundColor: 'var(--toast-bg)', 
                  borderColor: 'var(--success)'
                }}
                data-testid="uikit-toast-success"
                aria-label="Edit success toast style"
              >
                <CheckCircle className="w-5 h-5 shrink-0" style={{ color: 'var(--success)' }} />
                <div className="flex-1">
                  <p className="font-medium text-sm" style={{ color: 'var(--toast-fg)' }}>Saved successfully!</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Your changes have been saved.</p>
                </div>
                <X className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
              </ClickableElement>

              <ClickableElement
                editKey="--destructive"
                className="p-4 rounded-lg border shadow-elevated flex items-center gap-3"
                style={{ 
                  backgroundColor: 'var(--toast-bg)', 
                  borderColor: 'var(--destructive)'
                }}
                data-testid="uikit-toast-error"
                aria-label="Edit error toast style"
              >
                <AlertCircle className="w-5 h-5 shrink-0" style={{ color: 'var(--destructive)' }} />
                <div className="flex-1">
                  <p className="font-medium text-sm" style={{ color: 'var(--toast-fg)' }}>Error occurred</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Something went wrong.</p>
                </div>
                <div 
                  className="px-3 py-1 rounded text-xs font-medium"
                  style={{ backgroundColor: 'var(--destructive)', color: 'var(--destructive-foreground)' }}
                >
                  Retry
                </div>
              </ClickableElement>

              <ClickableElement
                editKey="--warning"
                className="p-4 rounded-lg border shadow-elevated flex items-center gap-3"
                style={{ 
                  backgroundColor: 'var(--toast-bg)', 
                  borderColor: 'var(--warning)'
                }}
                data-testid="uikit-toast-warning"
                aria-label="Edit warning toast style"
              >
                <AlertTriangle className="w-5 h-5 shrink-0" style={{ color: 'var(--warning)' }} />
                <div className="flex-1">
                  <p className="font-medium text-sm" style={{ color: 'var(--toast-fg)' }}>Warning</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Please review your input.</p>
                </div>
                <div 
                  className="px-3 py-1 rounded text-xs font-medium"
                  style={{ backgroundColor: 'var(--warning)', color: 'var(--warning-foreground)' }}
                >
                  Review
                </div>
              </ClickableElement>

              <ClickableElement
                editKey="--accent"
                className="p-4 rounded-lg border shadow-elevated flex items-center gap-3"
                style={{ 
                  backgroundColor: 'var(--toast-bg)', 
                  borderColor: 'var(--action-accent)'
                }}
                data-testid="uikit-toast-info"
                aria-label="Edit info toast style"
              >
                <Info className="w-5 h-5 shrink-0" style={{ color: 'var(--action-primary)' }} />
                <div className="flex-1">
                  <p className="font-medium text-sm" style={{ color: 'var(--toast-fg)' }}>Information</p>
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>A new update is available.</p>
                </div>
                <div 
                  className="px-3 py-1 rounded text-xs font-medium"
                  style={{ backgroundColor: 'var(--action-primary)', color: 'var(--action-primary-fg)' }}
                >
                  Update
                </div>
              </ClickableElement>

              <ClickableElement
                editKey="--success"
                className="p-4 rounded-lg border shadow-elevated flex items-center gap-3"
                style={{ 
                  backgroundColor: 'var(--toast-bg)', 
                  borderColor: 'var(--success)'
                }}
                data-testid="uikit-toast-action"
                aria-label="Edit toast with action buttons"
              >
                <CheckCircle className="w-5 h-5 shrink-0" style={{ color: 'var(--success)' }} />
                <div className="flex-1">
                  <p className="font-medium text-sm" style={{ color: 'var(--toast-fg)' }}>Item moved to trash</p>
                </div>
                <div className="flex gap-2">
                  <div 
                    className="px-3 py-1 rounded text-xs font-medium border"
                    style={{ borderColor: 'var(--stroke-default)', color: 'var(--text-primary)' }}
                  >
                    Undo
                  </div>
                  <X className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
                </div>
              </ClickableElement>
            </div>
          </SubSection>
        </section>

        {/* ========================================
            8. MODALS & DIALOGS SECTION
        ======================================== */}
        <section data-section="modals" data-testid="uikit-modals-section">
          <SectionTitle id="modals">Modals & Dialogs</SectionTitle>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SubSection title="Modal Preview">
              <ClickableElement
                editKey="--modal-bg"
                className="rounded-xl border shadow-dialog overflow-hidden"
                style={{ 
                  backgroundColor: 'var(--modal-bg)', 
                  borderColor: 'var(--modal-border)'
                }}
                data-testid="uikit-modal"
                aria-label="Edit modal style"
              >
                <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--stroke-default)' }}>
                  <h4 className="font-semibold" style={{ color: 'var(--modal-fg)' }}>Modal Title</h4>
                  <X className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />
                </div>
                <div className="p-4">
                  <p className="text-sm" style={{ color: 'var(--modal-fg)' }}>
                    Modal content goes here. This is a preview of how modals will look.
                  </p>
                </div>
                <div className="p-4 border-t flex justify-end gap-2" style={{ borderColor: 'var(--stroke-default)' }}>
                  <div 
                    className="px-4 py-2 rounded-lg text-sm"
                    style={{ backgroundColor: 'var(--btn-ghost-hover)', color: 'var(--text-primary)' }}
                  >
                    Cancel
                  </div>
                  <div 
                    className="px-4 py-2 rounded-lg text-sm font-medium"
                    style={{ backgroundColor: 'var(--action-primary)', color: 'var(--action-primary-fg)' }}
                  >
                    Confirm
                  </div>
                </div>
              </ClickableElement>
            </SubSection>

            <SubSection title="Confirmation Dialog">
              <ClickableElement
                editKey="--destructive"
                className="rounded-xl border shadow-dialog overflow-hidden"
                style={{ 
                  backgroundColor: 'var(--modal-bg)', 
                  borderColor: 'var(--modal-border)'
                }}
                data-testid="uikit-dialog"
                aria-label="Edit dialog style"
              >
                <div className="p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--alert-error-bg)' }}>
                      <AlertTriangle className="w-5 h-5" style={{ color: 'var(--destructive)' }} />
                    </div>
                    <h4 className="font-semibold" style={{ color: 'var(--modal-fg)' }}>Delete Item?</h4>
                  </div>
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                    This action cannot be undone. Are you sure?
                  </p>
                </div>
                <div className="p-4 border-t flex justify-end gap-2" style={{ borderColor: 'var(--stroke-default)' }}>
                  <div 
                    className="px-4 py-2 rounded-lg text-sm"
                    style={{ backgroundColor: 'var(--btn-ghost-hover)', color: 'var(--text-primary)' }}
                  >
                    Cancel
                  </div>
                  <div 
                    className="px-4 py-2 rounded-lg text-sm font-medium"
                    style={{ backgroundColor: 'var(--btn-danger-bg)', color: 'var(--btn-danger-fg)' }}
                  >
                    Delete
                  </div>
                </div>
              </ClickableElement>
            </SubSection>

            <SubSection title="Sheet / Drawer Preview">
              <ClickableElement
                editKey="--panel-bg"
                className="rounded-lg border shadow-elevated overflow-hidden"
                style={{ 
                  backgroundColor: 'var(--panel-bg)', 
                  borderColor: 'var(--panel-border)'
                }}
                data-testid="uikit-sheet"
                aria-label="Edit sheet/drawer style"
              >
                <div className="p-4 border-b" style={{ backgroundColor: 'var(--panel-header-bg)', borderColor: 'var(--stroke-default)' }}>
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold" style={{ color: 'var(--panel-header-fg)' }}>Drawer Panel</h4>
                    <X className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />
                  </div>
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex items-center gap-3 p-2 rounded-lg" style={{ backgroundColor: 'var(--panel-hover-bg)' }}>
                    <User className="w-5 h-5" style={{ color: 'var(--action-primary)' }} />
                    <span className="text-sm" style={{ color: 'var(--panel-fg)' }}>Profile</span>
                  </div>
                  <div className="flex items-center gap-3 p-2 rounded-lg">
                    <Settings className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />
                    <span className="text-sm" style={{ color: 'var(--panel-fg)' }}>Settings</span>
                  </div>
                </div>
              </ClickableElement>
            </SubSection>
          </div>
        </section>

        {/* ========================================
            9. PROGRESS & LOADING SECTION
        ======================================== */}
        <section data-section="progress" data-testid="uikit-progress-section">
          <SectionTitle id="progress">Progress & Loading</SectionTitle>
          
          <SubSection title="Linear Progress Bar">
            <div className="space-y-3 max-w-md">
              <ClickableElement
                editKey="--primary"
                className="h-2 rounded-full overflow-hidden"
                style={{ backgroundColor: 'var(--surface-muted)' }}
                data-testid="uikit-progress-bar"
                aria-label="Edit progress bar style"
              >
                <div className="h-full rounded-full" style={{ backgroundColor: 'var(--action-primary)', width: '65%' }} />
              </ClickableElement>
              <ClickableElement
                editKey="--success"
                className="h-2 rounded-full overflow-hidden"
                style={{ backgroundColor: 'var(--surface-muted)' }}
                data-testid="uikit-progress-bar-success"
                aria-label="Edit success progress bar"
              >
                <div className="h-full rounded-full" style={{ backgroundColor: 'var(--success)', width: '100%' }} />
              </ClickableElement>
              <ClickableElement
                editKey="--warning"
                className="h-2 rounded-full overflow-hidden"
                style={{ backgroundColor: 'var(--surface-muted)' }}
                data-testid="uikit-progress-bar-warning"
                aria-label="Edit warning progress bar"
              >
                <div className="h-full rounded-full" style={{ backgroundColor: 'var(--warning)', width: '45%' }} />
              </ClickableElement>
            </div>
          </SubSection>

          <SubSection title="Circular Progress">
            <div className="flex flex-wrap gap-6">
              <ClickableElement
                editKey="--primary"
                className="relative w-16 h-16"
                data-testid="uikit-progress-circular"
                aria-label="Edit circular progress style"
              >
                <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                  <circle
                    cx="18" cy="18" r="15.5"
                    fill="none"
                    stroke="var(--surface-muted)"
                    strokeWidth="3"
                  />
                  <circle
                    cx="18" cy="18" r="15.5"
                    fill="none"
                    stroke="var(--action-primary)"
                    strokeWidth="3"
                    strokeDasharray="97.4"
                    strokeDashoffset="34"
                    strokeLinecap="round"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-sm font-medium" style={{ color: 'var(--text-primary)' }}>65%</span>
              </ClickableElement>

              <ClickableElement
                editKey="--success"
                className="relative w-16 h-16"
                data-testid="uikit-progress-circular-complete"
                aria-label="Edit completed circular progress"
              >
                <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                  <circle
                    cx="18" cy="18" r="15.5"
                    fill="none"
                    stroke="var(--success)"
                    strokeWidth="3"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center">
                  <CheckCircle className="w-6 h-6" style={{ color: 'var(--success)' }} />
                </span>
              </ClickableElement>
            </div>
          </SubSection>

          <SubSection title="Skeleton States">
            <div className="space-y-3 max-w-md">
              <ClickableElement
                editKey="--muted"
                className="space-y-3"
                data-testid="uikit-skeleton"
                aria-label="Edit skeleton loading style"
              >
                <div className="h-4 rounded animate-pulse" style={{ backgroundColor: 'var(--surface-muted)', width: '75%' }} />
                <div className="h-4 rounded animate-pulse" style={{ backgroundColor: 'var(--surface-muted)', width: '100%' }} />
                <div className="h-4 rounded animate-pulse" style={{ backgroundColor: 'var(--surface-muted)', width: '60%' }} />
              </ClickableElement>
              <ClickableElement
                editKey="--muted"
                className="flex items-center gap-3"
                data-testid="uikit-skeleton-avatar"
                aria-label="Edit skeleton avatar style"
              >
                <div className="w-10 h-10 rounded-full animate-pulse" style={{ backgroundColor: 'var(--surface-muted)' }} />
                <div className="flex-1 space-y-2">
                  <div className="h-3 rounded animate-pulse" style={{ backgroundColor: 'var(--surface-muted)', width: '40%' }} />
                  <div className="h-3 rounded animate-pulse" style={{ backgroundColor: 'var(--surface-muted)', width: '70%' }} />
                </div>
              </ClickableElement>
            </div>
          </SubSection>

          <SubSection title="Spinner">
            <div className="flex flex-wrap gap-6">
              <ClickableElement
                editKey="--primary"
                className="flex items-center gap-2"
                data-testid="uikit-spinner"
                aria-label="Edit spinner style"
              >
                <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--action-primary)' }} />
                <span className="text-sm" style={{ color: 'var(--text-primary)' }}>Loading...</span>
              </ClickableElement>
              <ClickableElement
                editKey="--muted-foreground"
                className="flex items-center gap-2"
                data-testid="uikit-spinner-muted"
                aria-label="Edit muted spinner style"
              >
                <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--text-muted)' }} />
                <span className="text-sm" style={{ color: 'var(--text-muted)' }}>Processing...</span>
              </ClickableElement>
            </div>
          </SubSection>
        </section>

        {/* ========================================
            10. ADVANCED PRIMITIVES SECTION
        ======================================== */}
        <section data-section="advanced-primitives" data-testid="uikit-advanced-primitives-section">
          <SectionTitle id="advanced-primitives">Advanced Primitives</SectionTitle>

          <SubSection title="Separator">
            <div className="space-y-4 rounded-lg border p-4" style={{ borderColor: 'var(--stroke-default)', backgroundColor: 'var(--surface-primary)' }}>
              <p style={{ color: 'var(--text-primary)' }}>Section A</p>
              <Separator />
              <p style={{ color: 'var(--text-primary)' }}>Section B</p>
            </div>
          </SubSection>

          <SubSection title="Scroll Area">
            <div className="rounded-lg border p-3" style={{ borderColor: 'var(--stroke-default)', backgroundColor: 'var(--surface-raised)' }}>
              <ScrollArea className="h-32 rounded-md border" style={{ borderColor: 'var(--stroke-default)' }}>
                <div className="space-y-2 p-3">
                  {Array.from({ length: 12 }).map((_, index) => (
                    <div
                      key={`scroll-row-${index}`}
                      className="rounded px-3 py-2 text-sm"
                      style={{ backgroundColor: 'var(--surface-muted)', color: 'var(--text-primary)' }}
                    >
                      Scroll row {index + 1}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </SubSection>

          <SubSection title="Collapsible">
            <Collapsible defaultOpen>
              <div className="rounded-lg border" style={{ borderColor: 'var(--stroke-default)', backgroundColor: 'var(--surface-primary)' }}>
                <CollapsibleTrigger className="w-full px-4 py-3 text-left font-medium">
                  Collapsible Trigger (Open)
                </CollapsibleTrigger>
                <CollapsibleContent className="px-4 pb-4 text-sm" style={{ color: 'var(--text-muted)' }}>
                  Collapsible content driven by the shared primitive contract.
                </CollapsibleContent>
              </div>
            </Collapsible>
          </SubSection>

          <SubSection title="Accordion">
            <Accordion type="single" collapsible defaultValue="item-1" className="rounded-lg border px-4" style={{ borderColor: 'var(--stroke-default)' }}>
              <AccordionItem value="item-1">
                <AccordionTrigger>Accordion Item One</AccordionTrigger>
                <AccordionContent>Accordion content using tokenized surface and text primitives.</AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-2">
                <AccordionTrigger>Accordion Item Two</AccordionTrigger>
                <AccordionContent>Collapsed item shows parity for open and closed states.</AccordionContent>
              </AccordionItem>
            </Accordion>
          </SubSection>

          <SubSection title="Calendar">
            <div className="inline-block rounded-lg border p-2" style={{ borderColor: 'var(--stroke-default)', backgroundColor: 'var(--surface-primary)' }}>
              <Calendar mode="single" selected={new Date()} onSelect={() => undefined} />
            </div>
          </SubSection>

          <SubSection title="Command Palette">
            <Command className="max-w-md">
              <CommandInput placeholder="Search commands..." />
              <CommandList>
                <CommandEmpty>No results found.</CommandEmpty>
                <CommandGroup heading="Navigation">
                  <CommandItem>Go to Dashboard</CommandItem>
                  <CommandItem>Open Profile</CommandItem>
                </CommandGroup>
                <CommandSeparator />
                <CommandGroup heading="Actions">
                  <CommandItem>Create New Course</CommandItem>
                  <CommandItem>Generate Report</CommandItem>
                </CommandGroup>
              </CommandList>
            </Command>
          </SubSection>

          <SubSection title="Resizable Panels">
            <div className="h-40 overflow-hidden rounded-lg border" style={{ borderColor: 'var(--stroke-default)' }}>
              <ResizablePanelGroup direction="horizontal">
                <ResizablePanel defaultSize={50}>
                  <div className="flex h-full items-center justify-center text-sm" style={{ backgroundColor: 'var(--surface-primary)', color: 'var(--text-primary)' }}>
                    Left Panel
                  </div>
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={50}>
                  <div className="flex h-full items-center justify-center text-sm" style={{ backgroundColor: 'var(--surface-muted)', color: 'var(--text-primary)' }}>
                    Right Panel
                  </div>
                </ResizablePanel>
              </ResizablePanelGroup>
            </div>
          </SubSection>

          <SubSection title="Toast Host (Toaster)">
            <div className="rounded-lg border p-4 text-sm" style={{ borderColor: 'var(--stroke-default)', backgroundColor: 'var(--surface-primary)', color: 'var(--text-primary)' }}>
              Global toast hosting is provided by the <code>Toaster</code> primitive, which renders tokenized toast notifications from app events.
            </div>
          </SubSection>
        </section>

        {/* ========================================
            11. DOMAIN PRIMITIVES SECTION
        ======================================== */}
        <section data-section="domain-primitives" data-testid="uikit-domain-primitives-section">
          <SectionTitle id="domain-primitives">Domain Primitives</SectionTitle>

          <SubSection title="Player Avatar">
            <div className="flex flex-wrap items-center gap-4">
              <ClickableElement editKey="--avatar-bg" data-testid="uikit-domain-avatar-1" aria-label="Edit avatar primitive">
                <PlayerAvatar
                  showCosmetics={false}
                  showCountry
                  showGlow={false}
                  className=""
                  user={{
                    id: 1,
                    gamerName: 'UIKitPro',
                    email: 'uikit@example.com',
                    country: 'USA',
                  }}
                  size="md"
                />
              </ClickableElement>
              <ClickableElement editKey="--avatar-fg" data-testid="uikit-domain-avatar-2" aria-label="Edit avatar label primitive">
                <PlayerAvatar
                  showCosmetics={false}
                  showCountry={false}
                  showGlow={false}
                  className=""
                  user={{
                    id: 2,
                    gamerName: 'Paragon',
                    email: 'paragon@example.com',
                  }}
                  size="lg"
                />
              </ClickableElement>
            </div>
          </SubSection>

          <SubSection title="Country Selector">
            <div className="max-w-sm">
              <ClickableElement editKey="--select-bg" data-testid="uikit-domain-country-selector" aria-label="Edit country selector primitive">
                <CountrySelector value="USA" onValueChange={() => undefined} placeholder="Select country" disabled={false} className="" />
              </ClickableElement>
            </div>
          </SubSection>

          <SubSection title="Behavioral Domain Components">
            <ClickableElement
              editKey="--surface-raised"
              className="space-y-2 rounded-lg border p-4 text-sm"
              style={{ borderColor: 'var(--stroke-default)', backgroundColor: 'var(--surface-raised)', color: 'var(--text-primary)' }}
              data-testid="uikit-domain-behavioral"
              aria-label="Edit behavioral domain primitives surface"
            >
              <p><strong>AvatarUpload</strong> is mapped as a domain primitive for authenticated profile flows.</p>
              <p><strong>InlineLeaderboard</strong> is mapped as a domain primitive for live ranked views.</p>
              <p><strong>CollectionModal</strong> is mapped as a domain primitive for collection game-launch workflows.</p>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                These are intentionally data-driven and validated through app-level scenarios rather than static-only samples.
              </p>
            </ClickableElement>
          </SubSection>
        </section>

        {/* ========================================
            12. TOOLTIPS & POPOVERS SECTION
        ======================================== */}
        <section data-section="tooltips" data-testid="uikit-tooltips-section">
          <SectionTitle id="tooltips">Tooltips & Popovers</SectionTitle>
          
          <SubSection title="Tooltip Examples">
            <div className="flex flex-wrap gap-6 items-end">
              <ClickableElement
                editKey="--popover"
                className="relative"
                data-testid="uikit-tooltip"
                aria-label="Edit tooltip style"
              >
                <div 
                  className="px-3 py-1.5 rounded text-xs font-medium shadow-elevated"
                  style={{ backgroundColor: 'var(--popover)', color: 'var(--popover-foreground)', border: '1px solid var(--stroke-default)' }}
                >
                  Tooltip text
                </div>
                <div 
                  className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45"
                  style={{ backgroundColor: 'var(--popover)', borderRight: '1px solid var(--stroke-default)', borderBottom: '1px solid var(--stroke-default)' }}
                />
              </ClickableElement>

              <ClickableElement
                editKey="--foreground"
                className="relative"
                data-testid="uikit-tooltip-dark"
                aria-label="Edit dark tooltip style"
              >
                <div 
                  className="px-3 py-1.5 rounded text-xs font-medium shadow-elevated"
                  style={{ backgroundColor: 'var(--text-primary)', color: 'var(--surface-primary)' }}
                >
                  Dark tooltip
                </div>
                <div 
                  className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45"
                  style={{ backgroundColor: 'var(--text-primary)' }}
                />
              </ClickableElement>
            </div>
          </SubSection>

          <SubSection title="Popover">
            <ClickableElement
              editKey="--popover"
              className="rounded-lg border shadow-elevated overflow-hidden max-w-xs"
              style={{ 
                backgroundColor: 'var(--popover)', 
                borderColor: 'var(--stroke-default)'
              }}
              data-testid="uikit-popover"
              aria-label="Edit popover style"
            >
              <div className="p-4">
                <h4 className="font-semibold text-sm" style={{ color: 'var(--popover-foreground)' }}>Popover Title</h4>
                <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                  This is a popover with additional content and information.
                </p>
              </div>
              <div className="px-4 py-3 border-t" style={{ backgroundColor: 'var(--surface-muted)', borderColor: 'var(--stroke-default)' }}>
                <span 
                  className="text-sm font-medium"
                  style={{ color: 'var(--action-primary)' }}
                >
                  Learn more →
                </span>
              </div>
            </ClickableElement>
          </SubSection>

          <SubSection title="Dropdown Menu">
            <ClickableElement
              editKey="--popover"
              className="rounded-lg border shadow-elevated overflow-hidden w-48"
              style={{ 
                backgroundColor: 'var(--popover)', 
                borderColor: 'var(--stroke-default)'
              }}
              data-testid="uikit-dropdown"
              aria-label="Edit dropdown menu style"
            >
              <div className="p-1">
                <div 
                  className="flex items-center gap-2 px-3 py-2 rounded text-sm"
                  style={{ backgroundColor: 'var(--action-accent)', color: 'var(--action-accent-fg)' }}
                >
                  <User className="w-4 h-4" />
                  Profile (Selected)
                </div>
                <div 
                  className="flex items-center gap-2 px-3 py-2 rounded text-sm hover:bg-accent"
                  style={{ color: 'var(--popover-foreground)' }}
                >
                  <Settings className="w-4 h-4" />
                  Settings
                </div>
                <div className="h-px my-1" style={{ backgroundColor: 'var(--stroke-default)' }} />
                <div 
                  className="flex items-center gap-2 px-3 py-2 rounded text-sm"
                  style={{ color: 'var(--destructive)' }}
                >
                  <X className="w-4 h-4" />
                  Sign out
                </div>
              </div>
            </ClickableElement>
          </SubSection>

          <SubSection title="Context Menu">
            <ClickableElement
              editKey="--popover"
              className="rounded-lg border shadow-elevated overflow-hidden w-56"
              style={{ 
                backgroundColor: 'var(--popover)', 
                borderColor: 'var(--stroke-default)'
              }}
              data-testid="uikit-context-menu"
              aria-label="Edit context menu style"
            >
              <div className="p-1">
                <div 
                  className="flex items-center justify-between px-3 py-2 rounded text-sm"
                  style={{ color: 'var(--popover-foreground)' }}
                >
                  <span>Copy</span>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>⌘C</span>
                </div>
                <div 
                  className="flex items-center justify-between px-3 py-2 rounded text-sm"
                  style={{ backgroundColor: 'var(--action-accent)', color: 'var(--action-accent-fg)' }}
                >
                  <span>Paste (Hover)</span>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>⌘V</span>
                </div>
                <div className="h-px my-1" style={{ backgroundColor: 'var(--stroke-default)' }} />
                <div 
                  className="flex items-center justify-between px-3 py-2 rounded text-sm"
                  style={{ color: 'var(--popover-foreground)' }}
                >
                  <span>More options</span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </div>
            </ClickableElement>
          </SubSection>
        </section>

      </div>
    </PreviewFrame>
  );
}

export default PreviewUIKit;
