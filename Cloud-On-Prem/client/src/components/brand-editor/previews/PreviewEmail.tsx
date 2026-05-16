import { useState } from 'react';
import { PreviewFrame, ClickableElement } from '../PreviewFrame';
import { useBrandEditor } from '../BrandEditorShell';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Mail, 
  KeyRound, 
  GraduationCap, 
  Receipt, 
  Award,
  Smartphone,
  Monitor,
  ExternalLink,
  Facebook,
  Twitter,
  Linkedin,
  Instagram
} from 'lucide-react';

type EmailTemplate = 'welcome' | 'password-reset' | 'enrollment' | 'invoice' | 'certificate';
type ViewMode = 'desktop' | 'mobile';

interface EmailTemplateData {
  id: EmailTemplate;
  label: string;
  icon: typeof Mail;
  subject: string;
  greeting: string;
  content: React.ReactNode;
  ctaText: string;
  ctaSecondary?: string;
}

export function PreviewEmail() {
  const { state } = useBrandEditor();
  const brandName = state.brandName || 'LearnPlay';
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate>('welcome');
  const [viewMode, setViewMode] = useState<ViewMode>('desktop');

  const templates: EmailTemplateData[] = [
    {
      id: 'welcome',
      label: 'Welcome',
      icon: Mail,
      subject: `Welcome to ${brandName}!`,
      greeting: 'Hi John,',
      content: (
        <>
          <p style={{ color: 'var(--email-content-fg)' }} data-testid="email-welcome-text-1">
            Thank you for joining {brandName}! We're excited to have you as part of our learning community.
          </p>
          <p style={{ color: 'var(--email-content-fg)' }} data-testid="email-welcome-text-2">
            Your account has been created successfully. You now have access to our platform where you can:
          </p>
          <ClickableElement
            editKey="--email-accent"
            className="p-4 rounded-lg space-y-2 my-4"
            style={{ backgroundColor: 'color-mix(in srgb, var(--email-accent) 10%, transparent)', border: '1px solid var(--email-border)' }}
            data-testid="email-welcome-features"
            aria-label="Edit email feature list style"
          >
            {['🎓 Browse and enroll in courses', '🎮 Compete in quiz battles and earn XP', '📜 Earn certificates for your achievements', '🏆 Track your progress on the leaderboard'].map((item, i) => (
              <div key={i} className="flex items-center gap-2" style={{ color: 'var(--email-content-fg)' }}>
                {item}
              </div>
            ))}
          </ClickableElement>
          <ClickableElement
            editKey="--email-accent"
            className="p-4 rounded-lg flex items-center gap-4 my-4"
            style={{ backgroundColor: 'color-mix(in srgb, var(--email-accent) 15%, transparent)', border: '1px solid var(--email-accent)' }}
            data-testid="email-welcome-bonus"
            aria-label="Edit welcome bonus card"
          >
            <div className="w-12 h-12 rounded-full flex items-center justify-center text-2xl shrink-0" style={{ backgroundColor: 'var(--email-accent)' }}>
              🎁
            </div>
            <div>
              <p className="font-semibold" style={{ color: 'var(--email-content-fg)' }}>Welcome Bonus!</p>
              <p className="text-sm" style={{ color: 'var(--email-muted)' }}>You've received 50 LP Credits to get started. Use them on any course!</p>
            </div>
          </ClickableElement>
        </>
      ),
      ctaText: 'Start Learning Now',
    },
    {
      id: 'password-reset',
      label: 'Password Reset',
      icon: KeyRound,
      subject: 'Reset Your Password',
      greeting: 'Hi John,',
      content: (
        <>
          <p style={{ color: 'var(--email-content-fg)' }} data-testid="email-reset-text-1">
            We received a request to reset your password for your {brandName} account.
          </p>
          <p style={{ color: 'var(--email-content-fg)' }} data-testid="email-reset-text-2">
            Click the button below to create a new password. This link will expire in 24 hours for security reasons.
          </p>
          <ClickableElement
            editKey="--email-warning"
            className="p-4 rounded-lg my-4"
            style={{ backgroundColor: 'color-mix(in srgb, var(--email-warning) 15%, transparent)', border: '1px solid var(--email-warning)' }}
            data-testid="email-reset-warning"
            aria-label="Edit warning box style"
          >
            <p className="font-semibold" style={{ color: 'var(--email-warning)' }}>⚠️ Security Notice</p>
            <p className="text-sm mt-1" style={{ color: 'var(--email-content-fg)' }}>
              If you didn't request this password reset, please ignore this email or contact our support team immediately.
            </p>
          </ClickableElement>
        </>
      ),
      ctaText: 'Reset Password',
      ctaSecondary: 'Contact Support',
    },
    {
      id: 'enrollment',
      label: 'Enrollment',
      icon: GraduationCap,
      subject: 'Course Enrollment Confirmed!',
      greeting: 'Hi John,',
      content: (
        <>
          <p style={{ color: 'var(--email-content-fg)' }} data-testid="email-enrollment-text-1">
            Congratulations! You've successfully enrolled in a new course.
          </p>
          <ClickableElement
            editKey="--email-content-bg"
            className="p-4 rounded-lg my-4"
            style={{ backgroundColor: 'var(--email-content-bg)', border: '2px solid var(--email-cta-bg)', boxShadow: '0 4px 12px color-mix(in srgb, var(--email-cta-bg) 15%, transparent)' }}
            data-testid="email-enrollment-course-card"
            aria-label="Edit course card style"
          >
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'linear-gradient(135deg, var(--email-cta-bg), var(--email-accent))' }}>
                <GraduationCap className="w-8 h-8" style={{ color: 'var(--email-cta-fg)' }} />
              </div>
              <div>
                <p className="font-bold text-lg" style={{ color: 'var(--email-content-fg)' }}>Python for Data Science</p>
                <p className="text-sm" style={{ color: 'var(--email-muted)' }}>12 Lessons • 6 Hours • Beginner</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: 'var(--email-success)', color: 'var(--success-foreground)' }}>New</span>
                  <span className="text-sm" style={{ color: 'var(--email-success)' }}>+500 XP on completion</span>
                </div>
              </div>
            </div>
          </ClickableElement>
          <p style={{ color: 'var(--email-muted)' }} data-testid="email-enrollment-text-2">
            Your course is ready to start. Click below to begin your learning journey!
          </p>
        </>
      ),
      ctaText: 'Start Course',
      ctaSecondary: 'View Course Details',
    },
    {
      id: 'invoice',
      label: 'Invoice',
      icon: Receipt,
      subject: 'Your Invoice from ' + brandName,
      greeting: 'Hi John,',
      content: (
        <>
          <p style={{ color: 'var(--email-content-fg)' }} data-testid="email-invoice-text-1">
            Thank you for your purchase! Here's your invoice for your recent transaction.
          </p>
          <ClickableElement
            editKey="--email-content-bg"
            className="rounded-lg my-4 overflow-hidden"
            style={{ border: '1px solid var(--email-border)' }}
            data-testid="email-invoice-table"
            aria-label="Edit invoice table style"
          >
            <div className="p-3 font-medium text-sm" style={{ backgroundColor: 'color-mix(in srgb, var(--email-muted) 15%, transparent)', color: 'var(--email-content-fg)' }}>
              Invoice #INV-2024-001234
            </div>
            <div className="p-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--email-muted)' }}>Python for Data Science</span>
                <span style={{ color: 'var(--email-content-fg)' }}>$49.99</span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--email-muted)' }}>100 LP Credits</span>
                <span style={{ color: 'var(--email-content-fg)' }}>$25.00</span>
              </div>
              <div className="border-t pt-3" style={{ borderColor: 'var(--email-border)' }}>
                <div className="flex justify-between font-bold">
                  <span style={{ color: 'var(--email-content-fg)' }}>Total</span>
                  <span style={{ color: 'var(--email-cta-bg)' }}>$74.99</span>
                </div>
              </div>
            </div>
          </ClickableElement>
          <div className="flex items-center gap-2 px-4 py-3 rounded-lg" style={{ backgroundColor: 'color-mix(in srgb, var(--email-success) 10%, transparent)', border: '1px solid var(--email-success)' }}>
            <span style={{ color: 'var(--email-success)' }}>✓</span>
            <span className="font-medium" style={{ color: 'var(--email-success)' }}>Payment Successful</span>
          </div>
        </>
      ),
      ctaText: 'Download Invoice',
      ctaSecondary: 'View Purchase History',
    },
    {
      id: 'certificate',
      label: 'Certificate',
      icon: Award,
      subject: 'Congratulations! You Earned a Certificate! 🎉',
      greeting: 'Hi John,',
      content: (
        <>
          <p style={{ color: 'var(--email-content-fg)' }} data-testid="email-cert-text-1">
            Congratulations on completing your course! You've earned a new certificate.
          </p>
          <ClickableElement
            editKey="--email-accent"
            className="relative p-6 rounded-xl my-4 text-center overflow-hidden"
            style={{ 
              background: 'linear-gradient(135deg, color-mix(in srgb, var(--email-accent) 20%, transparent), color-mix(in srgb, var(--email-accent) 10%, transparent))',
              border: '2px solid var(--email-accent)',
              boxShadow: '0 8px 24px color-mix(in srgb, var(--email-accent) 20%, transparent)'
            }}
            data-testid="email-cert-card"
            aria-label="Edit certificate notification card"
          >
            <div className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2" style={{ borderColor: 'var(--email-accent)' }} />
            <div className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2" style={{ borderColor: 'var(--email-accent)' }} />
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2" style={{ borderColor: 'var(--email-accent)' }} />
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2" style={{ borderColor: 'var(--email-accent)' }} />
            <Award className="w-16 h-16 mx-auto mb-3" style={{ color: 'var(--email-accent)' }} />
            <p className="text-xs uppercase tracking-widest mb-2" style={{ color: 'var(--email-accent)' }}>Certificate of Completion</p>
            <p className="text-xl font-bold" style={{ color: 'var(--email-content-fg)' }}>Python for Data Science</p>
            <p className="text-sm mt-2" style={{ color: 'var(--email-muted)' }}>Issued on December 6, 2024</p>
            <div className="flex items-center justify-center gap-4 mt-4">
              <div className="px-3 py-1 rounded-full text-sm font-semibold" style={{ backgroundColor: 'var(--email-accent)', color: 'var(--email-cta-fg)' }}>
                +500 XP Earned
              </div>
            </div>
          </ClickableElement>
          <p className="text-sm" style={{ color: 'var(--email-muted)' }}>
            Share your achievement with your network and download your certificate!
          </p>
        </>
      ),
      ctaText: 'View Certificate',
      ctaSecondary: 'Share on LinkedIn',
    },
  ];

  const currentTemplate = templates.find(t => t.id === selectedTemplate) || templates[0];
  const containerWidth = viewMode === 'mobile' ? 'max-w-[375px]' : 'max-w-xl';

  return (
    <PreviewFrame className="min-h-[900px]" data-testid="preview-email">
      <div className="p-6 space-y-4" style={{ backgroundColor: 'var(--surface-primary)' }}>
        <div className="flex items-center justify-between flex-wrap gap-4" data-testid="email-preview-controls">
          <ClickableElement
            editKey="--foreground"
            as="h1"
            className="text-xl font-bold flex items-center gap-2"
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}
            data-testid="email-preview-title"
            aria-label="Edit email preview title"
          >
            <Mail className="w-5 h-5" style={{ color: 'var(--action-primary)' }} />
            Email Templates
          </ClickableElement>
          <div className="flex items-center gap-3">
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
              <TabsList data-testid="email-view-mode-tabs">
                <TabsTrigger value="desktop" data-testid="email-view-desktop" className="flex items-center gap-1.5">
                  <Monitor className="w-4 h-4" />
                  Desktop
                </TabsTrigger>
                <TabsTrigger value="mobile" data-testid="email-view-mobile" className="flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4" />
                  Mobile
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>

        <Tabs value={selectedTemplate} onValueChange={(v) => setSelectedTemplate(v as EmailTemplate)}>
          <TabsList className="w-full flex flex-wrap justify-start gap-1 h-auto p-1" data-testid="email-template-tabs">
            {templates.map((template) => {
              const Icon = template.icon;
              return (
                <TabsTrigger
                  key={template.id}
                  value={template.id}
                  className="flex items-center gap-1.5 text-xs sm:text-sm"
                  data-testid={`email-template-tab-${template.id}`}
                >
                  <Icon className="w-4 h-4" />
                  <span className="hidden sm:inline">{template.label}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>

        <div 
          className="flex justify-center py-6"
          style={{ backgroundColor: 'var(--email-bg)' }}
          data-testid="email-preview-container"
        >
          <div className={`${containerWidth} w-full transition-all duration-300`}>
            <ClickableElement
              editKey="--email-content-bg"
              className="rounded-xl overflow-hidden"
              style={{ 
                backgroundColor: 'var(--email-content-bg)',
                boxShadow: '0 4px 20px color-mix(in srgb, var(--text-primary) 15%, transparent)'
              }}
              data-testid="email-container"
              aria-label="Edit email container"
            >
              <ClickableElement
                editKey="--email-header-bg"
                className="p-6 text-center"
                style={{
                  background: state.gradientEnabled 
                    ? `linear-gradient(${state.gradientAngle || '135deg'}, var(--gradient-primary-from), var(--gradient-primary-to))`
                    : 'var(--email-header-bg)',
                }}
                data-testid="email-header"
                aria-label="Edit email header"
              >
                <div className="flex justify-center mb-3" data-testid="email-logo-container">
                  {state.logoUrl ? (
                    <img 
                      src={state.logoUrl} 
                      alt="Logo" 
                      className={viewMode === 'mobile' ? 'h-10' : 'h-12'}
                      style={{ objectFit: 'contain' }}
                      data-testid="email-logo" 
                    />
                  ) : (
                    <div 
                      className={`${viewMode === 'mobile' ? 'h-10 px-4 text-base' : 'h-12 px-6 text-lg'} rounded-lg flex items-center justify-center font-bold`}
                      style={{ backgroundColor: 'var(--email-cta-fg)', color: 'var(--email-header-bg)' }}
                      data-testid="email-logo-placeholder"
                    >
                      {brandName}
                    </div>
                  )}
                </div>
                <ClickableElement
                  editKey="--email-header-fg"
                  as="h2"
                  className={`font-bold ${viewMode === 'mobile' ? 'text-lg' : 'text-xl'}`}
                  style={{ color: 'var(--email-header-fg)', fontFamily: 'var(--font-heading)' }}
                  data-testid="email-subject"
                  aria-label="Edit email subject style"
                >
                  {currentTemplate.subject}
                </ClickableElement>
              </ClickableElement>

              <div 
                className={`${viewMode === 'mobile' ? 'p-4' : 'p-6'} space-y-4`}
                style={{ backgroundColor: 'var(--email-content-bg)' }}
                data-testid="email-content"
              >
                <ClickableElement
                  editKey="--email-content-fg"
                  as="p"
                  className={`font-medium ${viewMode === 'mobile' ? 'text-base' : 'text-lg'}`}
                  style={{ color: 'var(--email-content-fg)', fontFamily: 'var(--font-body)' }}
                  data-testid="email-greeting"
                  aria-label="Edit greeting text style"
                >
                  {currentTemplate.greeting}
                </ClickableElement>

                <div className="space-y-4" data-testid="email-body">
                  {currentTemplate.content}
                </div>

                <div className={`pt-4 ${viewMode === 'mobile' ? 'space-y-3' : 'flex items-center gap-3'}`} data-testid="email-cta-container">
                  <ClickableElement
                    editKey="--email-cta-bg"
                    className={`inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-semibold transition-colors ${viewMode === 'mobile' ? 'w-full' : ''}`}
                    style={{ 
                      background: state.gradientEnabled 
                        ? `linear-gradient(${state.gradientAngle || '135deg'}, var(--gradient-primary-from), var(--gradient-primary-to))`
                        : 'var(--email-cta-bg)',
                      color: 'var(--email-cta-fg)',
                      boxShadow: '0 4px 12px color-mix(in srgb, var(--email-cta-bg) 30%, transparent)'
                    }}
                    data-testid="email-cta-primary"
                    aria-label="Edit primary CTA button"
                  >
                    {currentTemplate.ctaText}
                    <ExternalLink className="w-4 h-4" />
                  </ClickableElement>
                  {currentTemplate.ctaSecondary && (
                    <ClickableElement
                      editKey="--email-link"
                      className={`inline-flex items-center justify-center gap-1 px-4 py-2 rounded-lg font-medium text-sm ${viewMode === 'mobile' ? 'w-full' : ''}`}
                      style={{ 
                        color: 'var(--email-link)',
                        border: '1px solid var(--email-border)'
                      }}
                      data-testid="email-cta-secondary"
                      aria-label="Edit secondary link button"
                    >
                      {currentTemplate.ctaSecondary}
                    </ClickableElement>
                  )}
                </div>

                <div className="pt-4" style={{ borderTop: '1px solid var(--email-border)' }} data-testid="email-signoff">
                  <p style={{ color: 'var(--email-muted)' }}>Happy learning!</p>
                  <p className="mt-1" style={{ color: 'var(--email-muted)' }}>
                    The <span style={{ color: 'var(--email-link)' }}>{brandName}</span> Team
                  </p>
                </div>
              </div>

              <ClickableElement
                editKey="--email-footer-bg"
                className={`${viewMode === 'mobile' ? 'p-4' : 'p-6'} text-center`}
                style={{ 
                  backgroundColor: 'var(--email-footer-bg)',
                  borderTop: '1px solid var(--email-border)'
                }}
                data-testid="email-footer"
                aria-label="Edit email footer"
              >
                <div className="flex justify-center mb-3" data-testid="email-footer-logo">
                  {state.logoUrl ? (
                    <img 
                      src={state.logoUrl} 
                      alt="Logo" 
                      className="h-6 object-contain opacity-60" 
                      data-testid="email-footer-logo-img" 
                    />
                  ) : (
                    <span className="font-semibold opacity-60" style={{ color: 'var(--email-footer-fg)' }}>
                      {brandName}
                    </span>
                  )}
                </div>

                <ClickableElement
                  editKey="--email-link"
                  className="flex justify-center gap-3 mb-4"
                  data-testid="email-social-links"
                  aria-label="Edit social links"
                >
                  {[Facebook, Twitter, Linkedin, Instagram].map((Icon, i) => (
                    <div
                      key={i}
                      className="w-8 h-8 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: 'color-mix(in srgb, var(--email-link) 15%, transparent)' }}
                    >
                      <Icon className="w-4 h-4" style={{ color: 'var(--email-link)' }} />
                    </div>
                  ))}
                </ClickableElement>

                <ClickableElement
                  editKey="--email-footer-fg"
                  as="p"
                  className="text-sm mb-2"
                  style={{ color: 'var(--email-footer-fg)' }}
                  data-testid="email-support-info"
                  aria-label="Edit support info"
                >
                  Need help? Contact us at{' '}
                  <span style={{ color: 'var(--email-link)' }}>
                    {state.supportEmail || 'support@learnplay.com'}
                  </span>
                </ClickableElement>

                <div 
                  className={`flex ${viewMode === 'mobile' ? 'flex-col gap-2' : 'justify-center gap-4'} text-xs mb-3`}
                  data-testid="email-footer-links"
                >
                  <ClickableElement editKey="--email-link" as="span" style={{ color: 'var(--email-link)' }} data-testid="email-link-website" aria-label="Edit link style">
                    Website
                  </ClickableElement>
                  {viewMode !== 'mobile' && <span style={{ color: 'var(--email-footer-fg)' }}>•</span>}
                  <ClickableElement editKey="--email-link" as="span" style={{ color: 'var(--email-link)' }} data-testid="email-link-unsubscribe" aria-label="Edit unsubscribe link">
                    Unsubscribe
                  </ClickableElement>
                  {viewMode !== 'mobile' && <span style={{ color: 'var(--email-footer-fg)' }}>•</span>}
                  <ClickableElement editKey="--email-link" as="span" style={{ color: 'var(--email-link)' }} data-testid="email-link-privacy" aria-label="Edit privacy link">
                    Privacy Policy
                  </ClickableElement>
                  {viewMode !== 'mobile' && <span style={{ color: 'var(--email-footer-fg)' }}>•</span>}
                  <ClickableElement editKey="--email-link" as="span" style={{ color: 'var(--email-link)' }} data-testid="email-link-terms" aria-label="Edit terms link">
                    Terms of Service
                  </ClickableElement>
                </div>

                <p 
                  className="text-xs" 
                  style={{ color: 'var(--email-footer-fg)', opacity: 0.7 }} 
                  data-testid="email-copyright"
                >
                  © 2024 {brandName}. All rights reserved.
                </p>
                <p 
                  className="text-xs mt-1" 
                  style={{ color: 'var(--email-footer-fg)', opacity: 0.5 }} 
                  data-testid="email-address"
                >
                  123 Learning Street, Education City, EC 12345
                </p>
              </ClickableElement>
            </ClickableElement>
          </div>
        </div>

        <ClickableElement
          editKey="--muted"
          className="p-4 rounded-lg text-sm"
          style={{ backgroundColor: 'var(--surface-muted)', color: 'var(--text-muted)' }}
          data-testid="email-preview-info"
          aria-label="Edit info box style"
        >
          <p className="font-medium mb-1" style={{ color: 'var(--text-primary)' }}>📧 Email Branding Preview</p>
          <p>
            This preview shows how your branded emails will appear to recipients. All email templates automatically use your organization's branding including logo, colors, and contact information.
          </p>
        </ClickableElement>
      </div>
    </PreviewFrame>
  );
}

export default PreviewEmail;
