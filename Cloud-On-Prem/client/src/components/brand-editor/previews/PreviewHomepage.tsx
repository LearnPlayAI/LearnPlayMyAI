import { PreviewFrame, ClickableElement } from '../PreviewFrame';
import { useBrandEditor } from '../BrandEditorShell';
import { Home, GraduationCap, Settings, ChevronDown, User, Award, CreditCard, FileText, Youtube, X, Smartphone, Share2, Building2, PenTool, Mail, Shield, FileCheck, ExternalLink, Menu } from 'lucide-react';

export function PreviewHomepage() {
  const { state } = useBrandEditor();
  const brandName = state.brandName || 'LearnPlay';

  return (
    <PreviewFrame className="min-h-[800px]" data-testid="preview-homepage">
      {/* Navigation Bar Section */}
      <ClickableElement
        editKey="--nav-bg"
        interactive={false}
        className="w-full border-b backdrop-blur-xl"
        style={{
          backgroundColor: 'var(--nav-bg)',
          borderColor: 'var(--nav-border)',
        }}
        data-testid="preview-homepage-nav"
        aria-label="Edit navigation bar styles"
      >
        <div className="max-w-5xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            {/* Logo Area */}
            <ClickableElement
              editKey="brand-identity"
              className="flex items-center gap-3 cursor-pointer group"
              data-testid="preview-homepage-logo"
              aria-label="Edit logo and brand identity"
            >
              <div 
                className="w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden shadow-md transition-all group-hover:shadow-elevated"
                style={{ 
                  boxShadow: 'var(--game-glow)',
                }}
              >
                {state.logoUrl ? (
                  <img src={state.logoUrl} alt={`${brandName} Logo`} className="max-h-full max-w-full object-contain p-0.5" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: 'var(--action-primary)' }}>
                    <span className="text-xs font-bold" style={{ color: 'var(--action-primary-fg)' }}>LP</span>
                  </div>
                )}
              </div>
              <span className="font-bold text-lg" style={{ color: 'var(--action-primary)' }}>{brandName}</span>
            </ClickableElement>

            {/* Desktop Nav Links */}
            <div className="hidden md:flex items-center gap-4">
              <ClickableElement
                editKey="--nav-link"
                className="flex items-center gap-2 px-3 py-2 text-sm font-semibold transition-colors"
                style={{ color: 'var(--nav-link)' }}
                data-testid="preview-homepage-nav-home"
                aria-label="Edit navigation link style"
              >
                <Home className="w-4 h-4" />
                <span>Home</span>
              </ClickableElement>
              <ClickableElement
                editKey="--nav-link"
                className="flex items-center gap-2 px-3 py-2 text-sm font-semibold transition-colors"
                style={{ color: 'var(--nav-link)' }}
                data-testid="preview-homepage-nav-courses"
                aria-label="Edit navigation link style"
              >
                <GraduationCap className="w-4 h-4" />
                <span>Courses</span>
              </ClickableElement>
              <ClickableElement
                editKey="--nav-link"
                className="flex items-center gap-2 px-3 py-2 text-sm font-semibold transition-colors"
                style={{ color: 'var(--nav-link)' }}
                data-testid="preview-homepage-nav-admin"
                aria-label="Edit navigation link style"
              >
                <Settings className="w-4 h-4" />
                <span>Admin</span>
              </ClickableElement>

              {/* Sign In button (nav-link style) */}
              <ClickableElement
                editKey="--nav-link"
                className="px-3 py-2 text-sm font-semibold transition-colors"
                style={{ color: 'var(--nav-link)' }}
                data-testid="preview-homepage-nav-signin"
                aria-label="Edit sign in link style"
              >
                Sign In
              </ClickableElement>

              {/* CTA Gradient Button */}
              <ClickableElement
                editKey="--cta-gradient-from"
                className="flex items-center gap-2 px-4 py-2 text-primary-foreground font-bold rounded-lg shadow-elevated text-sm"
                style={{
                  background: 'linear-gradient(to right, var(--cta-gradient-from), var(--cta-gradient-to))',
                }}
                data-testid="preview-homepage-nav-cta"
                aria-label="Edit CTA gradient button"
              >
                Get Started
              </ClickableElement>

              {/* User Menu Button (authenticated state) */}
              <ClickableElement
                editKey="--cta-gradient-from"
                className="flex items-center gap-2 px-4 py-2 text-primary-foreground font-bold rounded-lg shadow-elevated text-sm"
                style={{
                  background: 'linear-gradient(to right, var(--cta-gradient-from), var(--cta-gradient-to))',
                }}
                data-testid="preview-homepage-user-menu-btn"
                aria-label="Edit user menu button gradient"
              >
                <div className="w-5 h-5 rounded-full" style={{ backgroundColor: 'var(--action-primary-fg)', opacity: 0.8 }} />
                <span>User</span>
                <ChevronDown className="w-4 h-4" />
              </ClickableElement>
            </div>

            {/* Mobile Menu Button */}
            <ClickableElement
              editKey="--cta-gradient-from"
              className="md:hidden flex items-center gap-2 px-3 py-2 text-primary-foreground font-semibold rounded-lg text-sm"
              style={{
                background: 'linear-gradient(to right, var(--cta-gradient-from), var(--cta-gradient-to))',
              }}
              data-testid="preview-homepage-mobile-menu-btn"
              aria-label="Edit mobile menu button"
            >
              <Menu className="w-5 h-5" />
              Menu
            </ClickableElement>
          </div>
        </div>
      </ClickableElement>

      {/* User Menu Dropdown Preview */}
      <div className="px-4 py-4" style={{ backgroundColor: 'var(--surface-primary)' }}>
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>User Menu Dropdown:</p>
          <ClickableElement
            editKey="--card"
            interactive={false}
            className="w-56 rounded-xl shadow-dialog overflow-hidden border"
            style={{ 
              backgroundColor: 'var(--surface-raised)', 
              borderColor: 'var(--stroke-default)' 
            }}
            data-testid="preview-homepage-user-menu"
            aria-label="Edit user menu dropdown styles"
          >
            <div className="p-2 space-y-1">
              {[
                { icon: User, label: 'My Profile' },
                { icon: Award, label: 'My Certificates' },
                { icon: CreditCard, label: 'Subscriptions' },
                { icon: FileText, label: 'Invoices' },
                { icon: Youtube, label: 'Tutorials' },
              ].map((item, i) => (
                <div
                  key={i}
                  className="w-full px-4 py-3 text-left rounded-lg transition-colors flex items-center gap-3"
                  style={{ 
                    color: 'var(--text-on-surface)',
                    backgroundColor: i === 0 ? 'var(--surface-muted)' : 'transparent',
                  }}
                  data-testid={`preview-homepage-menu-item-${i}`}
                >
                  <item.icon className="w-4 h-4" />
                  <span className="text-sm">{item.label}</span>
                </div>
              ))}
              <div className="border-t my-1" style={{ borderColor: 'var(--stroke-default)' }}></div>
              <div
                className="w-full px-4 py-3 text-left rounded-lg flex items-center gap-3"
                style={{ color: 'var(--destructive)' }}
                data-testid="preview-homepage-menu-logout"
              >
                <X className="w-4 h-4" />
                <span className="text-sm">Sign Out</span>
              </div>
            </div>
          </ClickableElement>
        </div>
      </div>

      {/* Mobile Menu Preview */}
      <div className="px-4 py-4" style={{ backgroundColor: 'var(--surface-primary)' }}>
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-medium mb-2" style={{ color: 'var(--text-muted)' }}>Mobile Menu:</p>
          <ClickableElement
            editKey="--card"
            interactive={false}
            className="rounded-lg border overflow-hidden"
            style={{ 
              backgroundColor: 'var(--surface-raised)', 
              borderColor: 'var(--stroke-default)' 
            }}
            data-testid="preview-homepage-mobile-menu"
            aria-label="Edit mobile menu styles"
          >
            <div className="px-4 py-3 space-y-2">
              {['Start Learning', 'Browse Courses', 'Admin', 'My Profile'].map((item, i) => (
                <div
                  key={i}
                  className="w-full px-4 py-3 text-left rounded-lg transition-colors"
                  style={{ 
                    color: 'var(--text-primary)',
                    backgroundColor: i === 0 ? 'var(--surface-muted)' : 'transparent',
                  }}
                  data-testid={`preview-homepage-mobile-item-${i}`}
                >
                  <span className="text-sm font-medium">{item}</span>
                </div>
              ))}
            </div>
          </ClickableElement>
        </div>
      </div>

      {/* Hero Section with Audience Pills */}
      <ClickableElement 
        editKey="--gradient-primary-from"
        interactive={false}
        className="w-full py-16 px-8"
        style={{
          background: `linear-gradient(135deg, var(--gradient-primary-from), var(--gradient-primary-to))`,
        }}
        data-testid="preview-homepage-hero-section"
        aria-label="Edit hero section gradient colors"
      >
        <div className="max-w-4xl mx-auto text-center space-y-6">
          {/* Audience Pills */}
          <div className="flex flex-wrap items-center gap-2 justify-center">
            {['For Schools', 'For Business', 'For Creators'].map((audience, i) => (
              <ClickableElement
                key={i}
                editKey="--hero-audience-pill-bg"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 backdrop-blur-sm rounded-full text-xs font-medium shadow-md"
                style={{
                  backgroundColor: 'var(--hero-audience-pill-bg)',
                  color: 'var(--hero-audience-pill-fg)',
                  borderWidth: '1px',
                  borderStyle: 'solid',
                  borderColor: 'var(--hero-audience-pill-border)',
                }}
                data-testid={`preview-homepage-audience-pill-${i}`}
                aria-label="Edit audience pill styles"
              >
                {i === 0 && <GraduationCap className="w-3 h-3" />}
                {i === 1 && <Building2 className="w-3 h-3" />}
                {i === 2 && <PenTool className="w-3 h-3" />}
                <span>{audience}</span>
              </ClickableElement>
            ))}
          </div>

          <ClickableElement 
            editKey="brand-identity" 
            as="h1" 
            className="text-4xl font-bold" 
            style={{ color: 'var(--action-primary-fg)', fontFamily: 'var(--font-heading)' }}
            data-testid="preview-homepage-hero-title"
            aria-label="Edit brand identity"
          >
            Welcome to {brandName}
          </ClickableElement>
          <ClickableElement 
            editKey="brand-identity" 
            as="p" 
            className="text-xl opacity-90" 
            style={{ color: 'var(--action-primary-fg)', fontFamily: 'var(--font-body)' }}
            data-testid="preview-homepage-hero-subtitle"
            aria-label="Edit hero subtitle"
          >
            Transform your learning experience with gamified education
          </ClickableElement>
          <div className="flex gap-4 justify-center pt-4">
            {/* CTA Gradient Button */}
            <ClickableElement 
              editKey="--cta-gradient-from"
              className="px-6 py-3 rounded-lg font-bold text-primary-foreground shadow-elevated transition-all hover:scale-105"
              style={{ 
                background: 'linear-gradient(to right, var(--cta-gradient-from), var(--cta-gradient-to))',
                boxShadow: 'var(--game-glow)',
              }}
              data-testid="preview-homepage-cta-gradient"
              aria-label="Edit CTA gradient button"
            >
              Get Started
            </ClickableElement>
            <ClickableElement 
              editKey="--secondary"
              className="px-6 py-3 rounded-lg font-medium border-2"
              style={{ 
                borderColor: 'var(--action-primary-fg)',
                color: 'var(--action-primary-fg)',
                backgroundColor: 'transparent'
              }}
              data-testid="preview-homepage-cta-secondary"
              aria-label="Edit secondary button style"
            >
              Learn More
            </ClickableElement>
          </div>
        </div>
      </ClickableElement>

      {/* Featured Courses Section */}
      <div className="py-16 px-8" style={{ backgroundColor: 'var(--surface-primary)' }} data-testid="preview-homepage-courses-section">
        <div className="max-w-5xl mx-auto">
          <ClickableElement 
            editKey="--foreground" 
            as="h2" 
            className="text-2xl font-bold text-center" 
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-heading)', marginBottom: 'var(--space-xl)' }}
            data-testid="preview-homepage-courses-header"
            aria-label="Edit section header color"
          >
            Featured Courses
          </ClickableElement>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {['Introduction to Programming', 'Data Science Basics', 'Web Development'].map((title, i) => (
              <ClickableElement 
                key={i}
                editKey="--card"
                className="rounded-xl overflow-hidden"
                style={{ backgroundColor: 'var(--surface-raised)', border: '1px solid var(--stroke-default)' }}
                data-testid={`preview-homepage-course-card-${i}`}
                aria-label={`Edit course card style - ${title}`}
              >
                <div 
                  className="h-32 flex items-center justify-center"
                  style={{ backgroundColor: 'var(--surface-muted)' }}
                  data-testid={`preview-homepage-course-image-${i}`}
                >
                  <span style={{ color: 'var(--text-muted)' }}>Course Image</span>
                </div>
                <div style={{ padding: 'var(--space-md)' }} className="space-y-2">
                  <h3 className="font-semibold" style={{ color: 'var(--text-on-surface)', fontFamily: 'var(--font-heading)' }} data-testid={`preview-homepage-course-title-${i}`}>{title}</h3>
                  <p className="text-sm" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }} data-testid={`preview-homepage-course-description-${i}`}>
                    Learn the fundamentals and build real projects
                  </p>
                  <div className="flex items-center justify-between pt-2">
                    <ClickableElement 
                      editKey="--accent"
                      className="text-sm px-3 py-1 rounded-full"
                      style={{ backgroundColor: 'var(--action-accent)', color: 'var(--action-accent-fg)' }}
                      data-testid={`preview-homepage-course-badge-${i}`}
                      aria-label="Edit course badge style"
                    >
                      Popular
                    </ClickableElement>
                    <span className="text-sm font-medium" style={{ color: 'var(--action-primary)' }} data-testid={`preview-homepage-course-price-${i}`}>
                      $49.99
                    </span>
                  </div>
                </div>
              </ClickableElement>
            ))}
          </div>
        </div>
      </div>

      {/* Features Section */}
      <ClickableElement 
        editKey="--muted"
        className="py-12 px-8"
        style={{ backgroundColor: 'var(--surface-muted)' }}
        data-testid="preview-homepage-features-section"
        aria-label="Edit features section background"
      >
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-heading)', marginBottom: 'var(--space-md)' }} data-testid="preview-homepage-features-header">
            Why Choose {brandName}?
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-8">
            {[
              { title: 'Gamified Learning', desc: 'Earn XP, level up, and compete' },
              { title: 'Expert Instructors', desc: 'Learn from industry professionals' },
              { title: 'Certificates', desc: 'Get recognized for your achievements' },
            ].map((item, i) => (
              <div key={i} className="text-center" data-testid={`preview-homepage-feature-${i}`}>
                <div 
                  className="w-12 h-12 rounded-full mx-auto mb-4 flex items-center justify-center"
                  style={{ backgroundColor: 'var(--action-primary)' }}
                  data-testid={`preview-homepage-feature-icon-${i}`}
                >
                  <span style={{ color: 'var(--action-primary-fg)' }}>{i + 1}</span>
                </div>
                <h3 className="font-medium" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }} data-testid={`preview-homepage-feature-title-${i}`}>{item.title}</h3>
                <p className="text-sm" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', marginTop: 'var(--space-xs)' }} data-testid={`preview-homepage-feature-desc-${i}`}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </ClickableElement>

      {/* Footer Section */}
      <ClickableElement 
        editKey="--footer-link"
        className="py-8 px-8"
        style={{ backgroundColor: 'var(--surface-raised)', borderTop: '1px solid var(--footer-border)' }}
        data-testid="preview-homepage-footer"
        aria-label="Edit footer styles"
      >
        <div className="max-w-5xl mx-auto">
          {/* Footer Grid */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            {/* Quick Links */}
            <div className="text-center md:text-left">
              <ClickableElement
                editKey="--footer-heading"
                as="h4"
                className="text-sm font-semibold mb-3"
                style={{ color: 'var(--footer-heading)' }}
                data-testid="preview-homepage-footer-heading-1"
                aria-label="Edit footer heading style"
              >
                Quick Links
              </ClickableElement>
              <div className="flex flex-col gap-2">
                {['Browse Courses', 'Create Courses', 'Start Free Trial', 'Pricing'].map((link, i) => (
                  <ClickableElement
                    key={i}
                    editKey="--footer-link"
                    className="text-sm transition-colors cursor-pointer flex items-center gap-2 justify-center md:justify-start"
                    style={{ color: 'var(--footer-link)' }}
                    data-testid={`preview-homepage-footer-link-${i}`}
                    aria-label="Edit footer link style"
                  >
                    {i === 0 && <GraduationCap className="w-4 h-4" />}
                    {i === 1 && <PenTool className="w-4 h-4" />}
                    {i === 2 && <User className="w-4 h-4" />}
                    {i === 3 && <CreditCard className="w-4 h-4" />}
                    {link}
                  </ClickableElement>
                ))}
              </div>
            </div>

            {/* For Organizations */}
            <div className="text-center md:text-left">
              <ClickableElement
                editKey="--footer-heading"
                as="h4"
                className="text-sm font-semibold mb-3"
                style={{ color: 'var(--footer-heading)' }}
                data-testid="preview-homepage-footer-heading-2"
                aria-label="Edit footer heading style"
              >
                For Organizations
              </ClickableElement>
              <div className="flex flex-col gap-2">
                {['Schools & Universities', 'Businesses & Corporates', 'Course Creators'].map((link, i) => (
                  <ClickableElement
                    key={i}
                    editKey="--footer-link"
                    className="text-sm transition-colors cursor-pointer flex items-center gap-2 justify-center md:justify-start"
                    style={{ color: 'var(--footer-link)' }}
                    data-testid={`preview-homepage-footer-org-link-${i}`}
                    aria-label="Edit footer link style"
                  >
                    {i === 0 && <GraduationCap className="w-4 h-4" />}
                    {i === 1 && <Building2 className="w-4 h-4" />}
                    {i === 2 && <PenTool className="w-4 h-4" />}
                    {link}
                  </ClickableElement>
                ))}
              </div>
            </div>

            {/* Mobile & Resources */}
            <div className="text-center md:text-left">
              <ClickableElement
                editKey="--footer-heading"
                as="h4"
                className="text-sm font-semibold mb-3"
                style={{ color: 'var(--footer-heading)' }}
                data-testid="preview-homepage-footer-heading-3"
                aria-label="Edit footer heading style"
              >
                Learn Anywhere
              </ClickableElement>
              <div className="flex flex-col gap-3 mb-4">
                <ClickableElement
                  editKey="--footer-fg"
                  className="flex items-center gap-2 text-sm justify-center md:justify-start"
                  style={{ color: 'var(--footer-fg)' }}
                  data-testid="preview-homepage-footer-pwa"
                  aria-label="Edit footer text style"
                >
                  <Smartphone className="w-4 h-4" style={{ color: 'var(--action-primary)' }} />
                  <span>Install as app on any device</span>
                </ClickableElement>
                <ClickableElement
                  editKey="--footer-fg"
                  className="flex items-center gap-2 text-sm justify-center md:justify-start"
                  style={{ color: 'var(--footer-fg)' }}
                  data-testid="preview-homepage-footer-share"
                  aria-label="Edit footer text style"
                >
                  <Share2 className="w-4 h-4" style={{ color: 'var(--action-secondary)' }} />
                  <span>Share courses with a link</span>
                </ClickableElement>
              </div>
            </div>

            {/* Social Links */}
            <div className="text-center md:text-left">
              <ClickableElement
                editKey="--footer-heading"
                as="h4"
                className="text-sm font-semibold mb-3"
                style={{ color: 'var(--footer-heading)' }}
                data-testid="preview-homepage-footer-heading-4"
                aria-label="Edit footer heading style"
              >
                Resources
              </ClickableElement>
              <ClickableElement
                editKey="--footer-social-bg"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg transition-all text-sm font-semibold"
                style={{ 
                  backgroundColor: 'var(--footer-social-bg)', 
                  color: 'var(--footer-social-fg)'
                }}
                data-testid="preview-homepage-footer-youtube"
                aria-label="Edit social button styles"
              >
                <Youtube className="w-5 h-5" />
                <span>Watch Tutorials</span>
              </ClickableElement>
              <ClickableElement
                editKey="--footer-fg"
                as="p"
                className="text-xs mt-2 text-center md:text-left"
                style={{ color: 'var(--footer-fg)' }}
                data-testid="preview-homepage-footer-social-desc"
                aria-label="Edit footer description text"
              >
                Tutorials, tips, and platform guides
              </ClickableElement>
            </div>
          </div>

          {/* Support & Legal Links */}
          <ClickableElement
            editKey="--footer-border"
            className="border-t pt-6 mb-6"
            style={{ borderColor: 'var(--footer-border)' }}
            data-testid="preview-homepage-footer-legal"
            aria-label="Edit footer border style"
          >
            <div className="flex flex-wrap items-center justify-center gap-4 md:gap-6">
              {[
                { icon: ExternalLink, label: 'Support' },
                { icon: Mail, label: 'Contact Us' },
                { icon: FileCheck, label: 'Terms of Service' },
                { icon: Shield, label: 'Privacy Policy' },
              ].map((item, i) => (
                <ClickableElement
                  key={i}
                  editKey="--footer-link"
                  className="text-sm transition-colors flex items-center gap-2"
                  style={{ color: 'var(--footer-link)' }}
                  data-testid={`preview-homepage-footer-legal-link-${i}`}
                  aria-label="Edit footer legal link style"
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </ClickableElement>
              ))}
            </div>
          </ClickableElement>

          {/* Copyright */}
          <ClickableElement
            editKey="--footer-border"
            className="border-t pt-6"
            style={{ borderColor: 'var(--footer-border)' }}
            data-testid="preview-homepage-footer-copyright"
            aria-label="Edit footer copyright section"
          >
            <ClickableElement
              editKey="--footer-fg"
              as="p"
              className="text-sm text-center"
              style={{ color: 'var(--footer-fg)' }}
              data-testid="preview-homepage-footer-copyright-text"
              aria-label="Edit footer copyright text style"
            >
              © 2025 {brandName} - Smart Learning Platform. All rights reserved.
            </ClickableElement>
          </ClickableElement>
        </div>
      </ClickableElement>
    </PreviewFrame>
  );
}

export default PreviewHomepage;
