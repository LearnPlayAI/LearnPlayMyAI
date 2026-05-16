import { useState } from 'react';
import { PreviewFrame, ClickableElement } from '../PreviewFrame';
import { useBrandEditor } from '../BrandEditorShell';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Award, Download, Share2, Crown, Sparkles, CheckCircle, Printer, Shield, Calendar, Hash, GraduationCap } from 'lucide-react';
import { SiLinkedin, SiX, SiFacebook } from 'react-icons/si';

export function PreviewCertificates() {
  const { state } = useBrandEditor();
  const brandName = state.brandName || 'LearnPlay';
  const [viewMode, setViewMode] = useState<'gallery' | 'detail'>('gallery');
  const [selectedCertType, setSelectedCertType] = useState<'course'>('course');

  const mockCertificates = [
    {
      id: '1',
      type: 'course' as const,
      title: 'Python for Data Science',
      organization: brandName,
      xpEarned: 500,
      completedAt: 'December 4, 2024',
      certificateId: 'COURSE-2024-ABC123',
      sharedPlatforms: ['linkedin'],
    },
    {
      id: '2',
      type: 'course' as const,
      title: 'Advanced Analytics and Reporting',
      organization: brandName,
      xpEarned: 650,
      completedAt: 'December 2, 2024',
      certificateId: 'COURSE-2024-GHI789',
      sharedPlatforms: ['twitter', 'facebook'],
    },
  ];

  const totalXP = mockCertificates.reduce((sum, cert) => sum + cert.xpEarned, 0);
  const courseCerts = mockCertificates.filter(c => c.type === 'course');
  const sharedCount = mockCertificates.filter(c => c.sharedPlatforms.length > 0).length;

  return (
    <PreviewFrame className="min-h-[800px]" data-testid="preview-certificates">
      <div className="p-6 space-y-6" style={{ backgroundColor: 'var(--surface-primary)' }}>
        
        <div className="flex items-center justify-between" data-testid="preview-certificates-header">
          <ClickableElement 
            editKey="--foreground" 
            as="h1" 
            className="text-2xl font-bold flex items-center gap-3" 
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}
            data-testid="preview-certificates-title"
            aria-label="Edit certificate page title"
          >
            <Award className="w-7 h-7" style={{ color: 'var(--action-primary)' }} />
            My Certificates
          </ClickableElement>
          <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'gallery' | 'detail')}>
            <TabsList data-testid="preview-certificates-view-tabs">
              <TabsTrigger value="gallery" data-testid="preview-certificates-tab-gallery">Gallery</TabsTrigger>
              <TabsTrigger value="detail" data-testid="preview-certificates-tab-detail">Detail View</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4" data-testid="preview-certificates-stats">
          <ClickableElement
            editKey="--card-bg"
            className="p-4 rounded-xl border transition-all duration-300"
            style={{
              backgroundColor: 'var(--card-bg)',
              borderColor: 'var(--card-border)',
            }}
            data-testid="preview-certificates-stat-total"
            aria-label="Edit stats card style"
          >
            <p className="text-xs uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>
              Total Certificates
            </p>
            <p className="text-3xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {mockCertificates.length}
            </p>
          </ClickableElement>

          <ClickableElement
            editKey="--cert-accent"
            className="p-4 rounded-xl border transition-all duration-300"
            style={{
              background: 'linear-gradient(135deg, color-mix(in srgb, var(--game-gold) 15%, transparent), color-mix(in srgb, var(--game-gold-light) 10%, transparent))',
              borderColor: 'var(--cert-accent)',
            }}
            data-testid="preview-certificates-stat-course"
            aria-label="Edit course mastery card style"
          >
            <p className="text-xs uppercase tracking-wide mb-1 flex items-center gap-1" style={{ color: 'var(--cert-accent)' }}>
              <Crown className="w-3 h-3" />
              Course Mastery
            </p>
            <p className="text-3xl font-bold" style={{ color: 'var(--cert-accent)' }}>
              {courseCerts.length}
            </p>
          </ClickableElement>

          <ClickableElement
            editKey="--primary"
            className="p-4 rounded-xl border transition-all duration-300"
            style={{
              backgroundColor: 'var(--card-bg)',
              borderColor: 'var(--card-border)',
            }}
            data-testid="preview-certificates-stat-xp"
            aria-label="Edit XP stats card style"
          >
            <p className="text-xs uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>
              Total XP Earned
            </p>
            <p className="text-3xl font-bold" style={{ color: 'var(--action-primary)' }}>
              {totalXP}
            </p>
          </ClickableElement>

          <ClickableElement
            editKey="--success"
            className="p-4 rounded-xl border transition-all duration-300"
            style={{
              backgroundColor: 'var(--card-bg)',
              borderColor: 'var(--card-border)',
            }}
            data-testid="preview-certificates-stat-shared"
            aria-label="Edit shared stats card style"
          >
            <p className="text-xs uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>
              Shared Certificates
            </p>
            <p className="text-3xl font-bold" style={{ color: 'var(--success)' }}>
              {sharedCount}
            </p>
          </ClickableElement>
        </div>

        {viewMode === 'gallery' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="preview-certificates-grid">
            {mockCertificates.map((cert) => {
              const isCourse = cert.type === 'course';
              
              return (
                <ClickableElement
                  key={cert.id}
                  editKey={isCourse ? "--cert-accent" : "--card-bg"}
                  className="rounded-xl border overflow-hidden transition-all duration-300"
                  style={{
                    background: isCourse
                      ? 'linear-gradient(135deg, color-mix(in srgb, var(--game-gold) 12%, transparent), color-mix(in srgb, var(--game-gold-light) 8%, transparent))'
                      : 'var(--card-bg)',
                    borderColor: isCourse ? 'var(--cert-accent)' : 'var(--card-border)',
                    boxShadow: isCourse ? '0 4px 20px color-mix(in srgb, var(--game-gold) 15%, transparent)' : undefined,
                  }}
                  data-testid={`preview-certificate-card-${cert.id}`}
                  aria-label={`Edit ${isCourse ? 'course mastery' : 'lesson'} certificate card style`}
                >
                  <div className="p-5 space-y-4">
                    <div className="flex items-start justify-between">
                      <div className="relative">
                        {isCourse ? (
                          <>
                            <Crown className="w-14 h-14" style={{ color: 'var(--cert-accent)' }} />
                            <Sparkles className="absolute -top-1 -right-1 w-5 h-5 animate-pulse" style={{ color: 'var(--cert-accent)' }} />
                          </>
                        ) : (
                          <Award className="w-14 h-14" style={{ color: 'var(--action-primary)' }} />
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        {isCourse && (
                          <ClickableElement
                            editKey="--cert-accent"
                            className="px-2 py-1 rounded-full text-xs font-semibold border"
                            style={{
                              backgroundColor: 'color-mix(in srgb, var(--game-gold) 20%, transparent)',
                              borderColor: 'var(--cert-accent)',
                              color: 'var(--cert-accent)',
                            }}
                            data-testid={`preview-cert-mastery-badge-${cert.id}`}
                            aria-label="Edit course mastery badge"
                          >
                            Course Mastery
                          </ClickableElement>
                        )}
                        <ClickableElement
                          editKey="--badge-bg"
                          className="px-2 py-1 rounded-full text-xs font-semibold"
                          style={{
                            backgroundColor: isCourse ? 'var(--cert-accent)' : 'var(--badge-bg)',
                            color: isCourse ? 'var(--action-accent-fg)' : 'var(--badge-fg)',
                          }}
                          data-testid={`preview-cert-xp-badge-${cert.id}`}
                          aria-label="Edit XP badge style"
                        >
                          +{cert.xpEarned} XP
                        </ClickableElement>
                      </div>
                    </div>

                    <div>
                      <ClickableElement
                        editKey="--cert-title"
                        as="h3"
                        className="text-lg font-bold"
                        style={{ color: isCourse ? 'var(--cert-accent)' : 'var(--text-primary)', fontFamily: 'var(--font-heading)', marginBottom: 'var(--space-xs)' }}
                        data-testid={`preview-cert-title-${cert.id}`}
                        aria-label="Edit certificate title style"
                      >
                        {cert.title}
                      </ClickableElement>
                      <p className="text-sm" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
                        {cert.organization}
                      </p>
                    </div>

                    <ClickableElement
                      editKey="--muted"
                      className="p-3 rounded-lg border space-y-2"
                      style={{
                        backgroundColor: isCourse ? 'color-mix(in srgb, var(--game-gold) 8%, transparent)' : 'var(--surface-muted)',
                        borderColor: isCourse ? 'color-mix(in srgb, var(--game-gold) 30%, transparent)' : 'var(--stroke-default)',
                      }}
                      data-testid={`preview-cert-details-${cert.id}`}
                      aria-label="Edit certificate details card style"
                    >
                      <div className="flex items-center gap-2 text-xs">
                        <Hash className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
                        <span style={{ color: 'var(--text-muted)' }}>Certificate ID:</span>
                        <span className="font-mono" style={{ color: isCourse ? 'var(--cert-accent)' : 'var(--text-primary)' }}>
                          {cert.certificateId}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <Calendar className="w-3 h-3" style={{ color: 'var(--text-muted)' }} />
                        <span style={{ color: 'var(--text-muted)' }}>Completed:</span>
                        <span style={{ color: isCourse ? 'var(--cert-accent)' : 'var(--text-primary)' }}>
                          {cert.completedAt}
                        </span>
                      </div>
                    </ClickableElement>

                    <div className="flex items-center gap-2 flex-wrap">
                      <ClickableElement
                        editKey="--success"
                        className="flex items-center gap-1 px-2 py-1 rounded-full text-xs"
                        style={{
                          backgroundColor: 'var(--alert-success-bg)',
                          color: 'var(--success)',
                        }}
                        data-testid={`preview-cert-verified-${cert.id}`}
                        aria-label="Edit verified badge style"
                      >
                        <CheckCircle className="w-3 h-3" />
                        Verified
                      </ClickableElement>
                      
                      {cert.sharedPlatforms.length > 0 && (
                        <div className="flex gap-1">
                          {cert.sharedPlatforms.map((platform) => (
                            <span
                              key={platform}
                              className="px-2 py-1 rounded-full text-xs border"
                              style={{
                                backgroundColor: 'var(--alert-success-bg)',
                                borderColor: 'var(--alert-success-border)',
                                color: 'var(--success)',
                              }}
                            >
                              Shared on {platform}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2 pt-2">
                      <ClickableElement
                        editKey="--btn-outline-bg"
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors"
                        style={{
                          backgroundColor: 'var(--btn-outline-bg)',
                          borderColor: isCourse ? 'var(--cert-accent)' : 'var(--btn-outline-border)',
                          color: isCourse ? 'var(--cert-accent)' : 'var(--btn-outline-fg)',
                        }}
                        data-testid={`preview-cert-download-${cert.id}`}
                        aria-label="Download PDF button style"
                      >
                        <Download className="w-4 h-4" />
                        Download
                      </ClickableElement>
                      <ClickableElement
                        editKey="--btn-outline-bg"
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors"
                        style={{
                          backgroundColor: 'var(--btn-outline-bg)',
                          borderColor: isCourse ? 'var(--cert-accent)' : 'var(--btn-outline-border)',
                          color: isCourse ? 'var(--cert-accent)' : 'var(--btn-outline-fg)',
                        }}
                        data-testid={`preview-cert-share-${cert.id}`}
                        aria-label="Share certificate button style"
                      >
                        <Share2 className="w-4 h-4" />
                        Share
                      </ClickableElement>
                    </div>
                  </div>
                </ClickableElement>
              );
            })}
          </div>
        ) : (
          <div className="space-y-6" data-testid="preview-certificates-detail">
            <div className="flex justify-center">
              <Tabs value={selectedCertType} onValueChange={() => setSelectedCertType('course')}>
                <TabsList data-testid="preview-certificates-type-tabs">
                  <TabsTrigger value="course" data-testid="preview-certificates-type-course">
                    <Crown className="w-4 h-4 mr-2" />
                    Course Certificate
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <ClickableElement
              editKey="--cert-bg"
              className="relative mx-auto max-w-3xl aspect-[1.4/1] rounded-xl overflow-hidden"
              style={{
                backgroundColor: selectedCertType === 'course' 
                  ? 'var(--game-surface-base)' 
                  : 'var(--cert-bg)',
                border: selectedCertType === 'course'
                  ? '4px solid var(--cert-accent)'
                  : '4px solid var(--cert-border)',
                boxShadow: selectedCertType === 'course'
                  ? '0 0 30px color-mix(in srgb, var(--game-gold) 30%, transparent), inset 0 0 60px color-mix(in srgb, var(--game-glow) 50%, transparent)'
                  : '0 10px 40px var(--card-shadow)',
              }}
              data-testid="preview-certificates-full-view"
              aria-label="Edit full certificate style"
            >
              {selectedCertType === 'course' && (
                <>
                  <div className="absolute top-4 left-4 w-12 h-12 border-t-2 border-l-2" style={{ borderColor: 'var(--cert-accent)' }} />
                  <div className="absolute top-4 right-4 w-12 h-12 border-t-2 border-r-2" style={{ borderColor: 'var(--cert-accent)' }} />
                  <div className="absolute bottom-4 left-4 w-12 h-12 border-b-2 border-l-2" style={{ borderColor: 'var(--cert-accent)' }} />
                  <div className="absolute bottom-4 right-4 w-12 h-12 border-b-2 border-r-2" style={{ borderColor: 'var(--cert-accent)' }} />
                </>
              )}

              <ClickableElement
                editKey="--gradient-primary-from"
                className="absolute top-0 left-0 right-0 h-20"
                style={{
                  background: selectedCertType === 'course'
                    ? 'linear-gradient(135deg, color-mix(in srgb, var(--game-gold) 30%, transparent), color-mix(in srgb, var(--game-gold-light) 15%, transparent))'
                    : 'linear-gradient(135deg, var(--gradient-primary-from), var(--gradient-primary-to))',
                }}
                data-testid="preview-certificates-gradient-header"
                aria-label="Edit certificate header gradient"
              >
                <span className="sr-only">Certificate Header</span>
              </ClickableElement>

              <div className="absolute top-4 left-4 z-10" data-testid="preview-certificates-logo-container">
                <ClickableElement
                  editKey="brand-identity"
                  className="flex items-center gap-2"
                  data-testid="preview-certificates-org-logo"
                  aria-label="Edit organization branding"
                >
                  {state.logoUrl ? (
                    <img src={state.logoUrl} alt="Logo" className="h-10 object-contain" data-testid="preview-certificates-logo" />
                  ) : (
                    <div 
                      className="h-10 px-4 rounded flex items-center justify-center font-bold text-sm"
                      style={{ backgroundColor: 'var(--action-primary)', color: 'var(--action-primary-fg)' }}
                    >
                      {brandName}
                    </div>
                  )}
                </ClickableElement>
              </div>

              <ClickableElement
                editKey="--cert-accent"
                className="absolute top-4 right-4 w-16 h-16 rounded-full flex items-center justify-center z-10"
                style={{
                  backgroundColor: selectedCertType === 'course' ? 'var(--cert-accent)' : 'var(--action-accent)',
                  border: '3px solid',
                  borderColor: selectedCertType === 'course' ? 'var(--game-gold-light)' : 'var(--action-primary-fg)',
                  boxShadow: '0 4px 12px var(--card-shadow)',
                }}
                data-testid="preview-certificates-trophy-badge"
                aria-label="Edit trophy badge style"
              >
                {selectedCertType === 'course' ? (
                  <Crown className="w-8 h-8" style={{ color: 'var(--action-accent-fg)' }} />
                ) : (
                  <Award className="w-8 h-8" style={{ color: 'var(--action-accent-fg)' }} />
                )}
              </ClickableElement>

              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8 pt-24" data-testid="preview-certificates-content">
                <ClickableElement
                  editKey="--muted-foreground"
                  as="p"
                  className="text-xs uppercase tracking-widest mb-2"
                  style={{ color: selectedCertType === 'course' ? 'var(--cert-accent)' : 'var(--cert-body)' }}
                  data-testid="preview-certificates-type-label"
                  aria-label="Edit certificate type label"
                >
                  {selectedCertType === 'course' ? '★ COURSE MASTERY ★' : 'Certificate of Achievement'}
                </ClickableElement>
                
                <ClickableElement 
                  editKey="brand-identity" 
                  as="h2" 
                  className="text-3xl font-bold mb-1" 
                  style={{ color: selectedCertType === 'course' ? 'var(--fg-strong)' : 'var(--cert-title)' }}
                  data-testid="preview-certificates-brand-name"
                  aria-label="Edit brand name on certificate"
                >
                  {brandName}
                </ClickableElement>
                
                <p className="text-sm mb-4" style={{ color: selectedCertType === 'course' ? 'var(--fg-muted)' : 'var(--cert-body)' }} data-testid="preview-certificates-certify-text">
                  This is to certify that
                </p>
                
                <ClickableElement 
                  editKey="--primary"
                  as="p" 
                  className="text-4xl font-bold mb-4"
                  style={{ color: selectedCertType === 'course' ? 'var(--text-primary)' : 'var(--action-primary)' }}
                  data-testid="preview-certificates-recipient-name"
                  aria-label="Edit recipient name style"
                >
                  John Doe
                </ClickableElement>
                
                <p className="text-sm mb-2" style={{ color: selectedCertType === 'course' ? 'var(--cert-accent)' : 'var(--cert-body)' }} data-testid="preview-certificates-completion-text">
                  has successfully completed {selectedCertType === 'course' ? 'all assessments in' : 'the lesson'}
                </p>
                
                <ClickableElement 
                  editKey="--cert-accent"
                  as="p" 
                  className="text-2xl font-semibold mb-6"
                  style={{ color: selectedCertType === 'course' ? 'var(--cert-accent)' : 'var(--cert-title)' }}
                  data-testid="preview-certificates-course-name"
                  aria-label="Edit course name style"
                >
                  {selectedCertType === 'course' ? '"Python for Data Science"' : 'Introduction to Variables'}
                </ClickableElement>

                {selectedCertType === 'course' && (
                  <div className="flex items-center justify-center gap-12 mb-4">
                    <div className="text-center">
                      <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--fg-subtle)' }}>Quizzes Passed</p>
                      <p className="text-xl font-bold" style={{ color: 'var(--cert-accent)' }}>8/8</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--fg-subtle)' }}>XP Earned</p>
                      <p className="text-xl font-bold" style={{ color: 'var(--cert-accent)' }}>+500</p>
                    </div>
                  </div>
                )}
                
                <ClickableElement
                  editKey="--border"
                  className="flex items-center gap-8 text-sm"
                  style={{ color: selectedCertType === 'course' ? 'var(--fg-subtle)' : 'var(--cert-body)' }}
                  data-testid="preview-certificates-meta"
                  aria-label="Edit certificate metadata style"
                >
                  <div data-testid="preview-certificates-date" className="text-center">
                    <p className="flex items-center gap-1 justify-center">
                      <Calendar className="w-3 h-3" />
                      Date Issued
                    </p>
                    <p className="font-medium" style={{ color: selectedCertType === 'course' ? 'var(--fg-default)' : 'var(--cert-title)' }}>
                      December 4, 2024
                    </p>
                  </div>
                  <div 
                    className="w-px h-8"
                    style={{ backgroundColor: 'var(--stroke-default)' }}
                    data-testid="preview-certificates-divider"
                  />
                  <div data-testid="preview-certificates-id" className="text-center">
                    <p className="flex items-center gap-1 justify-center">
                      <Hash className="w-3 h-3" />
                      Certificate ID
                    </p>
                    <p className="font-mono font-medium" style={{ color: selectedCertType === 'course' ? 'var(--fg-default)' : 'var(--cert-title)' }}>
                      {selectedCertType === 'course' ? 'COURSE-2024-ABC123' : 'CERT-2024-12345'}
                    </p>
                  </div>
                </ClickableElement>

                <div className="mt-6 flex items-center gap-12" data-testid="preview-certificates-signature">
                  <div className="text-center">
                    <div 
                      className="w-32 border-b mb-1" 
                      style={{ borderColor: selectedCertType === 'course' ? 'var(--cert-accent)' : 'var(--stroke-default)' }}
                    />
                    <p className="text-xs" style={{ color: selectedCertType === 'course' ? 'var(--fg-subtle)' : 'var(--cert-body)' }}>
                      Instructor Signature
                    </p>
                  </div>
                  <ClickableElement
                    editKey="--success"
                    className="flex items-center gap-1 px-3 py-1 rounded-full text-xs"
                    style={{
                      backgroundColor: 'var(--alert-success-bg)',
                      color: 'var(--success)',
                      border: '1px solid var(--success)',
                    }}
                    data-testid="preview-certificates-verified-badge"
                    aria-label="Edit verification badge style"
                  >
                    <Shield className="w-3 h-3" />
                    Blockchain Verified
                  </ClickableElement>
                </div>
              </div>

              <ClickableElement
                editKey="--primary"
                className="absolute bottom-0 left-0 right-0 h-2"
                style={{ backgroundColor: selectedCertType === 'course' ? 'var(--cert-accent)' : 'var(--action-primary)' }}
                data-testid="preview-certificates-footer-bar"
                aria-label="Edit certificate footer bar"
              >
                <span className="sr-only">Certificate Footer</span>
              </ClickableElement>
            </ClickableElement>

            <div className="flex justify-center gap-4 flex-wrap" data-testid="preview-certificates-actions">
              <ClickableElement 
                editKey="--btn-primary-bg"
                className="flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors"
                style={{ backgroundColor: 'var(--btn-primary-bg)', color: 'var(--btn-primary-fg)' }}
                data-testid="preview-certificates-download-pdf"
                aria-label="Download PDF button"
              >
                <Download className="w-5 h-5" />
                Download PDF
              </ClickableElement>
              
              <ClickableElement 
                editKey="--btn-secondary-bg"
                className="flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-colors"
                style={{ backgroundColor: 'var(--btn-secondary-bg)', color: 'var(--btn-secondary-fg)' }}
                data-testid="preview-certificates-print"
                aria-label="Print certificate button"
              >
                <Printer className="w-5 h-5" />
                Print
              </ClickableElement>

              <ClickableElement 
                editKey="--btn-outline-border"
                className="flex items-center gap-2 px-6 py-3 rounded-lg font-medium border transition-colors"
                style={{ 
                  backgroundColor: 'var(--btn-outline-bg)', 
                  borderColor: 'var(--btn-outline-border)',
                  color: 'var(--btn-outline-fg)' 
                }}
                data-testid="preview-certificates-verify"
                aria-label="Verify certificate button"
              >
                <Shield className="w-5 h-5" />
                Verify Certificate
              </ClickableElement>
            </div>

            <div className="flex justify-center gap-3" data-testid="preview-certificates-social-share">
              <ClickableElement
                editKey="--btn-primary-bg"
                className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm"
                style={{ backgroundColor: 'var(--social-linkedin, hsl(201, 100%, 35%))', color: 'var(--on-primary)' }}
                data-testid="preview-certificates-share-linkedin"
                aria-label="Share on LinkedIn"
              >
                <SiLinkedin className="w-4 h-4" />
                Share on LinkedIn
              </ClickableElement>
              
              <ClickableElement
                editKey="--btn-primary-bg"
                className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm"
                style={{ backgroundColor: 'var(--social-x, hsl(0, 0%, 0%))', color: 'var(--on-primary)' }}
                data-testid="preview-certificates-share-twitter"
                aria-label="Share on X"
              >
                <SiX className="w-4 h-4" />
                Share on X
              </ClickableElement>
              
              <ClickableElement
                editKey="--btn-primary-bg"
                className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm"
                style={{ backgroundColor: 'var(--social-facebook, hsl(220, 46%, 48%))', color: 'var(--on-primary)' }}
                data-testid="preview-certificates-share-facebook"
                aria-label="Share on Facebook"
              >
                <SiFacebook className="w-4 h-4" />
                Share on Facebook
              </ClickableElement>
            </div>
          </div>
        )}

        <div className="mt-8 border-t pt-8" style={{ borderColor: 'var(--stroke-default)' }}>
          <p className="text-sm mb-4 text-center" style={{ color: 'var(--text-muted)' }}>
            Empty State Preview:
          </p>
          <ClickableElement
            editKey="--card-bg"
            className="p-12 rounded-xl border text-center"
            style={{
              backgroundColor: 'var(--card-bg)',
              borderColor: 'var(--card-border)',
            }}
            data-testid="preview-certificates-empty-state"
            aria-label="Edit empty state card style"
          >
            <div className="relative inline-block mb-6">
              <Award className="w-20 h-20" style={{ color: 'var(--text-muted)' }} />
              <Sparkles 
                className="absolute -top-2 -right-2 w-8 h-8 animate-pulse" 
                style={{ color: 'var(--action-primary)' }} 
              />
            </div>
            <ClickableElement
              editKey="--foreground"
              as="h3"
              className="text-2xl font-bold mb-3"
              style={{ color: 'var(--text-primary)' }}
              data-testid="preview-certificates-empty-title"
              aria-label="Edit empty state title"
            >
              No certificates yet
            </ClickableElement>
            <p className="mb-6 max-w-md mx-auto" style={{ color: 'var(--text-muted)' }}>
              Complete course assessments to earn certificates and showcase your achievements!
            </p>
            <ClickableElement
              editKey="--cta-gradient-from"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-medium"
              style={{
                background: 'linear-gradient(to right, var(--cta-gradient-from), var(--cta-gradient-to))',
                color: 'var(--action-primary-fg)',
              }}
              data-testid="preview-certificates-empty-cta"
              aria-label="Edit browse lessons CTA button"
            >
              <GraduationCap className="w-5 h-5" />
              Browse Lessons
            </ClickableElement>
          </ClickableElement>
        </div>
      </div>
    </PreviewFrame>
  );
}

export default PreviewCertificates;
