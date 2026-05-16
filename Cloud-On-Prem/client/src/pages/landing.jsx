import { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'wouter';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Settings, Crown, User, X, GraduationCap, Sparkles, ArrowRight, Trophy, BarChart3, BookOpen, Shield, MessageSquare, Youtube, ChevronDown, CreditCard, Home, Server, Building2, PenTool, Mail, ExternalLink, FileCheck, Store, Share2, Smartphone, Zap, Award, FileText, ChevronLeft, ChevronRight, Star, TrendingUp } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { PlayerAvatar } from '@/components/ui/PlayerAvatar';
import { FloatingCloseButton } from '@/components/FloatingCloseButton';
import { apiRequest } from '@/lib/queryClient';
import { SalesInquiryModal } from '@/components/SalesInquiryModal';
import { useToast } from '@/hooks/use-toast';
import { TrialStatusIndicator, TrialStatusMobileItem } from '@/components/TrialStatusIndicator';
import { CreditStatusBar } from '@/components/CreditCenter';
import { useAuth } from '@/hooks/useAuth';
import { useBrandingLogo, useBranding } from '@/contexts/BrandingContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { getCourseThumbnail } from '@/lib/thumbnailResolver';
import { buildCourseHref } from '@/lib/courseLanguageRouting';

export const PremiumHeader = ({ isAuthenticated, isAdmin, isSuperAdmin, user, isAdminLoading }) => {
  const [, setLocation] = useLocation();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showUserMenuTooltip, setShowUserMenuTooltip] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isImpersonating, impersonatedOrganization, isOrgAdmin: authIsOrgAdmin, isTeacher } = useAuth();
  const { orgName, logoUrl } = useBrandingLogo();
  
  const exitImpersonationMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/superadmin/impersonation', {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/check'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user/roles'] });
      toast({
        title: 'Exited impersonation',
        description: 'You are no longer acting as an organization admin.',
      });
      setShowUserMenu(false);
    },
    onError: (error) => {
      console.error('Exit impersonation error:', error);
      toast({
        title: 'Error',
        description: 'Failed to exit impersonation',
        variant: 'destructive',
      });
    },
  });

  useEffect(() => {
    if (isAuthenticated && typeof window !== 'undefined') {
      const hasSeenTooltip = localStorage.getItem('user-menu-tooltip-seen');
      if (!hasSeenTooltip) {
        const timer = setTimeout(() => {
          setShowUserMenuTooltip(true);
          setTimeout(() => {
            setShowUserMenuTooltip(false);
            localStorage.setItem('user-menu-tooltip-seen', 'true');
          }, 5000);
        }, 1000);
        return () => clearTimeout(timer);
      }
    }
  }, [isAuthenticated]);

  const logoutMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/auth/logout', {
        method: 'POST',
      });
    },
    onSuccess: () => {
      queryClient.clear();
      window.location.href = '/';
    },
    onError: (error) => {
      console.error('Logout error:', error);
    },
  });

  return (
    <motion.header
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="fixed top-0 left-0 right-0 z-40 backdrop-blur-xl border-b"
      style={{ 
        backgroundColor: 'var(--nav-bg)', 
        borderColor: 'var(--nav-border)' 
      }}
      data-testid="header-banner"
    >
      <div className="max-w-7xl mx-auto p-[var(--container-padding)] sm:px-4 py-3 sm:py-4">
        <div className="flex items-center justify-between gap-[var(--space-sm)]">
          <Link href="/">
            <motion.div
              className="cursor-pointer group"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 md:w-20 md:h-20 rounded-xl flex items-center justify-center shadow-elevated group-hover:shadow-dialog group-hover:shadow-[var(--game-glow)] transition-all overflow-hidden">
                  <img src={logoUrl || "/icons/learnplay-logo.jpg"} alt={`${orgName} Logo`} className="max-h-full max-w-full object-contain p-1" />
                </div>
                
                <div className="flex flex-col">
                  <h1 className="text-2xl md:text-3xl font-black tracking-tight">
                    <span className="bg-primary hover:bg-primary/90 bg-clip-text text-transparent drop-shadow-elevated">
                      {orgName}
                    </span>
                  </h1>
                  <span className="text-xs text-muted-foreground font-semibold tracking-wide flex items-center gap-1.5">
                    <span className="fi fi-za" style={{ fontSize: '14px' }}></span>
                    Learning made easy for everyone
                  </span>
                </div>
              </div>
            </motion.div>
          </Link>

          <nav className="hidden md:flex items-center gap-6">
            {isAuthenticated ? (
              <>
                <Link href="/">
                  <button 
                    className="px-4 py-2 min-h-[44px] text-sm font-semibold transition-colors flex items-center gap-2 touch-manipulation" 
                    style={{ color: 'var(--nav-link)' }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--nav-link-hover)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--nav-link)'}
                    data-testid="nav-home"
                  >
                    <Home className="w-4 h-4" />
                    <span>Home</span>
                  </button>
                </Link>
                <Link href="/quiz-lobby">
                  <button 
                    className="px-4 py-2 min-h-[44px] text-sm font-semibold transition-colors touch-manipulation" 
                    style={{ color: 'var(--nav-link)' }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--nav-link-hover)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--nav-link)'}
                    data-testid="nav-quizzes"
                  >
                    Gamification
                  </button>
                </Link>
                {(isAdmin || authIsOrgAdmin || isTeacher) && (
                  <button 
                    onClick={() => {
                      if (isAdminLoading) {
                        toast({
                          title: "Loading...",
                          description: "Please wait while we verify your permissions",
                        });
                        return;
                      }
                      setLocation(isSuperAdmin ? '/super-admin' : '/course-builder');
                    }}
                    className="px-4 py-2 min-h-[44px] text-sm font-semibold transition-colors flex items-center gap-2 touch-manipulation" 
                    style={{ color: 'var(--nav-link)' }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--nav-link-hover)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--nav-link)'}
                    data-testid="nav-admin"
                  >
                    <Settings className="w-4 h-4" />
                    <span>Admin</span>
                  </button>
                )}
                
                <TrialStatusIndicator variant="compact" showDismiss={false} />
                
                <div className="relative">
                  <button
                    onClick={() => {
                      setShowUserMenu(!showUserMenu);
                      setShowUserMenuTooltip(false);
                      localStorage.setItem('user-menu-tooltip-seen', 'true');
                    }}
                    className="flex items-center gap-2 px-4 py-2 min-h-[44px] hover:opacity-90 font-bold rounded-lg transition-all hover:scale-105 shadow-elevated touch-manipulation"
                    style={{ backgroundColor: 'var(--cta-bg)', color: 'var(--cta-fg)' }}
                    aria-expanded={showUserMenu}
                    aria-controls="user-menu-dropdown"
                    aria-haspopup="true"
                    data-testid="nav-user-menu"
                  >
                    <PlayerAvatar user={user} size="sm" className="!w-6 !h-6" />
                    <span className="max-w-[100px] truncate">{user?.gamerName}</span>
                    {(isAdmin || authIsOrgAdmin || isTeacher) && <Crown className="w-4 h-4" />}
                    <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${showUserMenu ? 'rotate-180' : ''}`} />
                  </button>

                  <AnimatePresence>
                    {showUserMenuTooltip && (
                      <motion.div
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        className="absolute top-full right-0 mt-2 w-64 bg-secondary text-secondary-foreground text-sm p-3 rounded-lg shadow-elevated z-50"
                        role="tooltip"
                      >
                        <div className="relative">
                          <div className="absolute -top-7 right-4 w-0 h-0 border-l-8 border-r-8 border-b-8 border-transparent border-b-secondary"></div>
                          <p className="font-semibold mb-1">👋 Welcome!</p>
                          <p>Click here to access your profile, settings, and more.</p>
                          <button
                            onClick={() => {
                              setShowUserMenuTooltip(false);
                              localStorage.setItem('user-menu-tooltip-seen', 'true');
                            }}
                            className="absolute top-0 right-0 text-secondary-foreground/80 hover:text-secondary-foreground"
                            aria-label="Close tooltip"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <AnimatePresence>
                    {showUserMenu && (
                      <motion.div
                        id="user-menu-dropdown"
                        role="menu"
                        aria-label="User menu"
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="absolute right-0 mt-2 w-56 bg-card border border-border rounded-xl shadow-dialog overflow-hidden"
                      >
                        <div className="p-2 space-y-1">
                          <div 
                            className="px-2 py-2" 
                            onClick={(e) => e.stopPropagation()}
                            data-testid="nav-credits-status"
                          >
                            <CreditStatusBar className="w-full" />
                          </div>
                          
                          {isSuperAdmin && isImpersonating && impersonatedOrganization && (
                            <>
                              <div className="border-t border-border my-1"></div>
                              <div 
                                className="px-2 py-2" 
                                onClick={(e) => e.stopPropagation()}
                                data-testid="nav-impersonation-status"
                              >
                                <div className="flex items-center justify-between p-2 rounded-lg bg-warning/10 border border-[var(--warning)]/30">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <Building2 className="w-4 h-4 text-warning shrink-0" />
                                    <div className="min-w-0">
                                      <p className="text-[10px] text-warning font-medium">Acting as</p>
                                      <p className="text-xs text-foreground font-semibold truncate">{impersonatedOrganization.name}</p>
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => exitImpersonationMutation.mutate()}
                                    disabled={exitImpersonationMutation.isPending}
                                    className="px-2 py-1 text-[10px] font-medium text-warning hover:text-warning/80 hover:bg-warning/20 rounded transition-colors shrink-0 disabled:text-[var(--input-disabled-fg)]"
                                    data-testid="nav-exit-impersonation"
                                  >
                                    {exitImpersonationMutation.isPending ? 'Exiting...' : 'Exit'}
                                  </button>
                                </div>
                              </div>
                            </>
                          )}
                          
                          <div className="border-t border-border my-1"></div>
                          
                          <Link href="/browse-courses">
                            <button
                              className="w-full px-4 py-3 text-left text-foreground hover:bg-muted rounded-lg transition-colors flex items-center gap-3"
                              data-testid="nav-browse-marketplace"
                              onClick={() => setShowUserMenu(false)}
                            >
                              <Store className="w-4 h-4" />
                              <span>Browse Marketplace</span>
                            </button>
                          </Link>
                          <Link href="/my-courses">
                            <button
                              className="w-full px-4 py-3 text-left text-foreground hover:bg-muted rounded-lg transition-colors flex items-center gap-3"
                              data-testid="nav-my-courses"
                              onClick={() => setShowUserMenu(false)}
                            >
                              <BookOpen className="w-4 h-4" />
                              <span>My Courses</span>
                            </button>
                          </Link>
                          <Link href="/profile">
                            <button
                              className="w-full px-4 py-3 text-left text-foreground hover:bg-muted rounded-lg transition-colors flex items-center gap-3"
                              data-testid="nav-profile"
                              onClick={() => setShowUserMenu(false)}
                            >
                              <User className="w-4 h-4" />
                              <span>My Profile</span>
                            </button>
                          </Link>
                          <Link href="/certificates">
                            <button
                              className="w-full px-4 py-3 text-left text-foreground hover:bg-muted rounded-lg transition-colors flex items-center gap-3"
                              data-testid="nav-certificates"
                              onClick={() => setShowUserMenu(false)}
                            >
                              <Award className="w-4 h-4" />
                              <span>My Certificates</span>
                            </button>
                          </Link>
                          <Link href="/invoices">
                            <button
                              className="w-full px-4 py-3 text-left text-foreground hover:bg-muted rounded-lg transition-colors flex items-center gap-3"
                              data-testid="nav-invoices"
                              onClick={() => setShowUserMenu(false)}
                            >
                              <FileText className="w-4 h-4" />
                              <span>Invoices</span>
                            </button>
                          </Link>
                          {isAdmin && (
                            <>
                              <div className="border-t border-border my-1"></div>
                              <Link href="/subscriptions">
                                <button
                                  className="w-full px-4 py-3 text-left text-foreground hover:bg-muted rounded-lg transition-colors flex items-center gap-3"
                                  data-testid="nav-subscriptions"
                                  onClick={() => setShowUserMenu(false)}
                                >
                                  <CreditCard className="w-4 h-4" />
                                  <span>Subscriptions</span>
                                </button>
                              </Link>
                            </>
                          )}
                          
                          <div className="border-t border-border my-1"></div>
                          
                          <a 
                            href="https://www.youtube.com/@learnplay-coza" 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="w-full px-4 py-3 text-left text-destructive hover:bg-destructive/10 rounded-lg transition-colors flex items-center gap-3 font-semibold"
                            data-testid="nav-tutorials-dropdown"
                            onClick={() => setShowUserMenu(false)}
                          >
                            <Youtube className="w-4 h-4" />
                            <span>Tutorials</span>
                          </a>
                          
                          {isSuperAdmin && (
                            <Link href="/webhooks">
                              <button
                                className="w-full px-4 py-3 text-left text-foreground hover:bg-muted rounded-lg transition-colors flex items-center gap-3"
                                data-testid="nav-webhooks-dropdown"
                                onClick={() => setShowUserMenu(false)}
                              >
                                <Server className="w-4 h-4" />
                                <span>Webhooks</span>
                              </button>
                            </Link>
                          )}
                          
                          <div className="border-t border-border my-1"></div>
                          <button
                            onClick={() => {
                              setShowUserMenu(false);
                              logoutMutation.mutate();
                            }}
                            disabled={logoutMutation.isPending}
                            className="w-full px-4 py-3 text-left text-destructive hover:bg-destructive/10 rounded-lg transition-colors flex items-center gap-3 disabled:text-[var(--input-disabled-fg)]"
                            data-testid="nav-logout"
                          >
                            <X className="w-4 h-4" />
                            <span>{logoutMutation.isPending ? 'Signing Out...' : 'Sign Out'}</span>
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </>
            ) : (
              <>
                <Link href="/">
                  <Button variant="ghost" size="sm" className="min-h-[44px] text-sm font-semibold touch-manipulation" data-testid="nav-home-guest">
                    <Home className="w-4 h-4" />
                    <span>Home</span>
                  </Button>
                </Link>
                
                <Link href="/browse-courses">
                  <Button variant="ghost" size="sm" className="min-h-[44px] text-sm font-semibold touch-manipulation flex items-center gap-2" data-testid="nav-browse-courses">
                    <BookOpen className="w-5 h-5" />
                    <span>Browse Courses</span>
                  </Button>
                </Link>
                
                <Link href="/login">
                  <Button variant="ghost" size="sm" className="min-h-[44px] text-sm font-semibold touch-manipulation text-nav-link" data-testid="nav-login" >
                    Sign In
                  </Button>
                </Link>
                <Link href="/register">
                  <Button size="sm" className="min-h-[44px] font-bold rounded-lg transition-all hover:scale-105 shadow-elevated touch-manipulation text-cta-fg hover:opacity-90" data-testid="nav-register" >
                    Get Started
                  </Button>
                </Link>
              </>
            )}
          </nav>

          <div className="md:hidden flex items-center gap-[var(--space-xs)] sm:gap-[var(--space-sm)]">
            {isAuthenticated ? (
              <button
                onClick={() => setShowMobileMenu(!showMobileMenu)}
                className="flex items-center gap-1.5 px-2 py-2 font-semibold rounded-lg text-xs sm:text-sm sm:px-3 min-h-[44px] touch-manipulation"
                style={{ backgroundColor: 'var(--cta-bg)', color: 'var(--cta-fg)' }}
                aria-expanded={showMobileMenu}
                aria-controls="mobile-menu"
                aria-haspopup="true"
                data-testid="nav-mobile-menu"
              >
                <PlayerAvatar user={user} size="sm" className="!w-5 !h-5 sm:!w-6 sm:!h-6" />
                <span className="max-w-[50px] sm:max-w-[80px] truncate">{user?.gamerName}</span>
                <ChevronDown className={`w-3 h-3 sm:w-4 sm:h-4 transition-transform duration-200 ${showMobileMenu ? 'rotate-180' : ''}`} />
              </button>
            ) : (
              <div className="flex gap-[var(--space-xs)] sm:gap-[var(--space-sm)]">
                <Link href="/login">
                  <Button variant="ghost" size="sm" className="min-h-[44px] font-semibold rounded-lg text-xs sm:text-sm sm:px-4 touch-manipulation" data-testid="nav-login-mobile">
                    Sign In
                  </Button>
                </Link>
                <Link href="/register">
                  <Button size="sm" className="min-h-[44px] font-semibold rounded-lg text-xs sm:text-sm sm:px-4 whitespace-nowrap touch-manipulation text-cta-fg" data-testid="nav-register-mobile" >
                    Register
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
      <AnimatePresence>
        {showMobileMenu && isAuthenticated && (
          <motion.div
            id="mobile-menu"
            role="menu"
            aria-label="Mobile navigation menu"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-card/95 border-t border-border overflow-hidden max-h-[calc(100vh-100px)]"
          >
            <div className="px-4 py-4 space-y-2 overflow-y-auto max-h-[calc(100vh-120px)]">
              <TrialStatusMobileItem />
              
              <div 
                className="py-1" 
                onClick={(e) => e.stopPropagation()}
                data-testid="nav-credits-status-mobile"
              >
                <CreditStatusBar className="w-full" />
              </div>
              
              <div className="border-t border-border my-2"></div>
              
              <Link href="/quiz-lobby">
                <button
                  className="w-full px-4 py-3 min-h-[44px] text-left text-foreground hover:bg-muted rounded-lg transition-colors touch-manipulation"
                  onClick={() => setShowMobileMenu(false)}
                  data-testid="nav-quizzes-mobile"
                >
                  Gamification
                </button>
              </Link>
              
              <div className="border-t border-border my-2"></div>
              
              {(isAdmin || authIsOrgAdmin) && (
                <button
                  className="w-full px-4 py-3 min-h-[44px] text-left text-foreground hover:bg-muted rounded-lg transition-colors flex items-center gap-2 touch-manipulation"
                  onClick={() => {
                    if (isAdminLoading) {
                      toast({
                        title: "Loading...",
                        description: "Please wait while we verify your permissions",
                      });
                      return;
                    }
                    setShowMobileMenu(false);
                    setLocation(isSuperAdmin ? '/super-admin' : '/management-hub');
                  }}
                  data-testid="nav-admin-mobile"
                >
                  <Settings className="w-4 h-4" />
                  <span>Admin</span>
                </button>
              )}
              {isSuperAdmin && (
                <Link href="/webhooks">
                  <button
                    className="w-full px-4 py-3 min-h-[44px] text-left text-foreground hover:bg-muted rounded-lg transition-colors flex items-center gap-3 touch-manipulation"
                    onClick={() => setShowMobileMenu(false)}
                    data-testid="nav-webhooks-mobile"
                  >
                    <Server className="w-4 h-4" />
                    <span>Webhooks</span>
                  </button>
                </Link>
              )}
              
              <Link href="/browse-courses">
                <button
                  className="w-full px-4 py-3 min-h-[44px] text-left text-foreground hover:bg-muted rounded-lg transition-colors flex items-center gap-3 touch-manipulation"
                  onClick={() => setShowMobileMenu(false)}
                  data-testid="nav-browse-courses-mobile"
                >
                  <BookOpen className="w-4 h-4" />
                  <span>Browse Courses</span>
                </button>
              </Link>
              
              <div className="border-t border-border my-2"></div>
              <Link href="/browse-courses">
                <button
                  className="w-full px-4 py-3 min-h-[44px] text-left text-foreground hover:bg-muted rounded-lg transition-colors flex items-center gap-3 touch-manipulation"
                  onClick={() => setShowMobileMenu(false)}
                  data-testid="nav-browse-marketplace-mobile"
                >
                  <Store className="w-4 h-4" />
                  <span>Browse Marketplace</span>
                </button>
              </Link>
              <Link href="/my-courses">
                <button
                  className="w-full px-4 py-3 min-h-[44px] text-left text-foreground hover:bg-muted rounded-lg transition-colors flex items-center gap-3 touch-manipulation"
                  onClick={() => setShowMobileMenu(false)}
                  data-testid="nav-my-courses-mobile"
                >
                  <BookOpen className="w-4 h-4" />
                  <span>My Courses</span>
                </button>
              </Link>
              <Link href="/profile">
                <button
                  className="w-full px-4 py-3 min-h-[44px] text-left text-foreground hover:bg-muted rounded-lg transition-colors flex items-center gap-3 touch-manipulation"
                  onClick={() => setShowMobileMenu(false)}
                  data-testid="nav-profile-mobile"
                >
                  <User className="w-4 h-4" />
                  <span>My Profile</span>
                </button>
              </Link>
              <Link href="/certificates">
                <button
                  className="w-full px-4 py-3 min-h-[44px] text-left text-foreground hover:bg-muted rounded-lg transition-colors flex items-center gap-3 touch-manipulation"
                  onClick={() => setShowMobileMenu(false)}
                  data-testid="nav-certificates-mobile"
                >
                  <Award className="w-4 h-4" />
                  <span>My Certificates</span>
                </button>
              </Link>
              <Link href="/invoices">
                <button
                  className="w-full px-4 py-3 min-h-[44px] text-left text-foreground hover:bg-muted rounded-lg transition-colors flex items-center gap-3 touch-manipulation"
                  onClick={() => setShowMobileMenu(false)}
                  data-testid="nav-invoices-mobile"
                >
                  <FileText className="w-4 h-4" />
                  <span>Invoices</span>
                </button>
              </Link>
              {isAdmin && (
                <>
                  <div className="border-t border-border my-1"></div>
                  <Link href="/subscriptions">
                    <button
                      className="w-full px-4 py-3 min-h-[44px] text-left text-foreground hover:bg-muted rounded-lg transition-colors flex items-center gap-3 touch-manipulation"
                      onClick={() => setShowMobileMenu(false)}
                      data-testid="nav-subscriptions-mobile"
                    >
                      <CreditCard className="w-4 h-4" />
                      <span>Subscriptions</span>
                    </button>
                  </Link>
                </>
              )}
              <div className="border-t border-border my-1"></div>
              <button
                onClick={() => {
                  setShowMobileMenu(false);
                  logoutMutation.mutate();
                }}
                disabled={logoutMutation.isPending}
                className="w-full px-4 py-3 min-h-[44px] text-left text-destructive hover:bg-destructive/10 rounded-lg transition-colors flex items-center gap-3 disabled:text-[var(--input-disabled-fg)] touch-manipulation"
                data-testid="nav-logout-mobile"
              >
                <X className="w-4 h-4" />
                <span>{logoutMutation.isPending ? 'Signing Out...' : 'Sign Out'}</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
};

const HeroSection = () => {
  return (
    <section
      className="w-full pt-32 pb-20 relative"
      style={{ backgroundColor: 'var(--hero-bg)' }}
    >
      <div
        className="absolute inset-0"
        style={{
          backgroundColor: 'var(--hero-bg)',
          opacity: 0.6,
        }}
      />
      <div className="relative max-w-4xl mx-auto px-4 text-center">
        <motion.h2
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6"
          style={{ color: 'var(--section-heading)', fontFamily: 'var(--font-heading)' }}
        >
          Smart Learning Made Easy
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="text-lg md:text-xl mb-10 max-w-2xl mx-auto"
          style={{ color: 'var(--section-subheading)' }}
        >
          Create AI-powered courses, engage learners with gamification, and track progress — all in one platform.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="flex flex-col sm:flex-row gap-4 justify-center"
        >
          <Link href="/org-registration">
            <button
              className="px-8 py-4 font-bold rounded-xl transition-all hover:scale-105 hover:opacity-90 flex items-center justify-center gap-3 text-lg shadow-elevated"
              style={{ backgroundColor: 'var(--cta-bg)', color: 'var(--cta-fg)' }}
            >
              <Building2 className="w-5 h-5" />
                  Register Your Organization
            </button>
          </Link>
          <Link href="/browse-courses">
            <button
              className="px-8 py-4 font-bold rounded-xl transition-all hover:scale-105 flex items-center justify-center gap-3 text-lg"
              style={{ border: '2px solid var(--action-primary)', color: 'var(--action-primary)', backgroundColor: 'transparent' }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = 'var(--action-primary)';
                e.currentTarget.style.color = 'var(--cta-fg)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = 'transparent';
                e.currentTarget.style.color = 'var(--action-primary)';
              }}
            >
              <BookOpen className="w-5 h-5" />
              Browse Courses
            </button>
          </Link>
        </motion.div>
      </div>
    </section>
  );
};

const ShowcaseCoursesSection = () => {
  const carouselRef = useRef(null);
  const { data, isLoading } = useQuery({
    queryKey: ['/api/public/courses', { showcase: true, all: true }],
    queryFn: async () => {
      const courses = [];
      let page = 1;
      let totalPages = 1;

      do {
        const params = new URLSearchParams({
          showcase: 'true',
          limit: '50',
          page: String(page),
          sortBy: 'newest',
        });
        const response = await fetch(`/api/public/courses?${params.toString()}`);
        if (!response.ok) {
          throw new Error('Failed to fetch showcase courses');
        }
        const pageData = await response.json();
        courses.push(...(Array.isArray(pageData?.courses) ? pageData.courses : []));
        totalPages = Number(pageData?.totalPages || 1);
        page += 1;
      } while (page <= totalPages);

      return { courses };
    },
    staleTime: 60000,
    retry: false,
  });

  const courses = Array.isArray(data?.courses) ? data.courses : [];

  if (!isLoading && courses.length === 0) {
    return null;
  }

  const scrollByCard = (direction) => {
    const node = carouselRef.current;
    if (!node) return;
    const firstCard = node.querySelector('[data-showcase-course-card]');
    const cardWidth = firstCard?.getBoundingClientRect?.().width || 360;
    node.scrollBy({
      left: direction * (cardWidth + 24),
      behavior: 'smooth',
    });
  };

  const renderSkeletons = () => (
    Array.from({ length: 3 }).map((_, index) => (
      <div
        key={`showcase-skeleton-${index}`}
        className="min-w-[280px] sm:min-w-[340px] lg:min-w-[360px] rounded-lg border p-4"
        style={{ backgroundColor: 'var(--course-card-bg)', borderColor: 'var(--course-card-border)' }}
      >
        <div className="h-40 rounded-md bg-muted mb-4" />
        <div className="h-5 w-2/3 rounded bg-muted mb-3" />
        <div className="h-4 w-full rounded bg-muted mb-2" />
        <div className="h-4 w-4/5 rounded bg-muted" />
      </div>
    ))
  );

  return (
    <section className="w-full pb-16 px-4" style={{ backgroundColor: 'var(--hero-bg)' }} data-testid="homepage-showcase-courses">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-6"
        >
          <div className="text-center sm:text-left">
            <Badge variant="warning" className="mb-3 border-0">
              <Sparkles className="h-3.5 w-3.5 mr-1" />
              Showcase Courses
            </Badge>
            <h3 className="text-2xl md:text-3xl font-bold" style={{ color: 'var(--section-heading)' }}>
              Try a LearnPlay Course for Free
            </h3>
            <p className="mt-2 text-sm md:text-base max-w-2xl" style={{ color: 'var(--section-subheading)' }}>
              Explore selected public showcase courses before creating an account.
            </p>
          </div>
          {courses.length > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button type="button" variant="outline" size="icon" onClick={() => scrollByCard(-1)} aria-label="Previous showcase courses">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button type="button" variant="outline" size="icon" onClick={() => scrollByCard(1)} aria-label="Next showcase courses">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </motion.div>

        <div
          ref={carouselRef}
          className="flex gap-6 overflow-x-auto scroll-smooth pb-3 [scrollbar-width:thin] snap-x snap-mandatory"
          aria-label="Showcase course carousel"
        >
          {isLoading ? renderSkeletons() : courses.map((course) => (
            <motion.article
              key={course.id}
              data-showcase-course-card
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45 }}
              className="min-w-[280px] sm:min-w-[340px] lg:min-w-[360px] max-w-[380px] snap-start rounded-lg border overflow-hidden flex flex-col shadow-card"
              style={{
                backgroundColor: 'var(--course-card-bg)',
                color: 'var(--course-card-fg)',
                borderColor: 'var(--course-card-border)',
              }}
              data-testid={`homepage-showcase-card-${course.id}`}
            >
              <div className="relative h-40 sm:h-48 bg-muted overflow-hidden">
                <img
                  src={getCourseThumbnail(course)}
                  alt={course.title}
                  className="h-full w-full object-cover"
                />
                <div className="absolute top-3 right-3">
                  <Badge variant="warning" className="border-0 shadow-elevated">
                    <Sparkles className="h-3 w-3 mr-1" />
                    Showcase
                  </Badge>
                </div>
              </div>
              <div className="p-5 flex-1 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-3">
                  <h4 className="text-xl font-bold line-clamp-2" style={{ color: 'var(--course-card-title, var(--course-card-fg))' }}>
                    {course.title}
                  </h4>
                  {course.difficultyLevel && (
                    <Badge variant="secondary" className="shrink-0">
                      {course.difficultyLevel}
                    </Badge>
                  )}
                </div>
                {course.description && (
                  <p className="text-sm line-clamp-3" style={{ color: 'var(--text-muted)' }}>
                    {course.description}
                  </p>
                )}
                <div className="flex items-center gap-3 text-sm" style={{ color: 'var(--text-muted)' }}>
                  <span className="inline-flex items-center gap-1">
                    <Star className="h-4 w-4 fill-[var(--warning)] text-warning" />
                    {Number.parseFloat(course.averageRating || '0').toFixed(1)}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <TrendingUp className="h-4 w-4" />
                    {course.totalEnrollments || 0} students
                  </span>
                </div>
                <div className="mt-auto pt-3 flex items-center justify-between gap-3">
                  <span className="font-bold text-success">FREE</span>
                  <Link href={buildCourseHref(course.id, course.languageCode || 'en')}>
                    <Button className="min-h-[44px] touch-manipulation" data-testid={`button-try-showcase-${course.id}`}>
                      Try now for free
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>
                </div>
              </div>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
};

const ValuePillarsSection = () => {
  const pillars = [
    {
      icon: <Sparkles className=" text-primary" />,
      title: 'Create Courses in Minutes',
      text: 'Use AI to build complete courses, lessons, and quizzes from your existing documents or from scratch.',
    },
    {
      icon: <Trophy className=" text-primary" />,
      title: 'Engage Through Gamification',
      text: 'Leaderboards, achievements, and quizzes that make learning fun and competitive.',
    },
    {
      icon: <BarChart3 className=" text-primary" />,
      title: 'Real-Time Analytics',
      text: 'Monitor learner progress, completion rates, and performance with detailed reports and dashboards.',
    },
  ];

  return (
    <section className="w-full py-20 px-4" style={{ backgroundColor: 'var(--section-bg)' }}>
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h3
            className="text-3xl md:text-4xl font-bold mb-4"
            style={{ color: 'var(--section-heading)' }}
          >
            Everything You Need
          </h3>
          <p
            className="text-lg max-w-2xl mx-auto"
            style={{ color: 'var(--section-subheading)' }}
          >
            A complete platform for creating, delivering, and measuring learning experiences.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {pillars.map((pillar, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.15 }}
              className="rounded-xl p-8 transition-transform duration-300 hover:scale-[1.02]"
              style={{
                backgroundColor: 'var(--glass-card-bg)',
                border: '1px solid var(--glass-card-border)',
              }}
            >
              <div className="mb-5">{pillar.icon}</div>
              <h4
                className="text-xl font-bold mb-3"
                style={{ color: 'var(--glass-card-title)' }}
              >
                {pillar.title}
              </h4>
              <p
                className="text-sm leading-relaxed"
                style={{ color: 'var(--glass-card-text)' }}
              >
                {pillar.text}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

const EnterpriseSection = () => {
  const features = [
    {
      icon: <Shield className="w-8 h-8" />,
      title: 'Your Data in Your Control',
      text: 'Host LearnPlay on your own servers. Your data never leaves your infrastructure — full ownership, full privacy.',
    },
    {
      icon: <FileCheck className="w-8 h-8" />,
      title: 'Strict EU Security Standards',
      text: 'Built to comply with EU data protection regulations. Enterprise-grade encryption, audit trails, and access controls.',
    },
    {
      icon: <Server className="w-8 h-8" />,
      title: 'Free Development Server',
      text: 'Get started with a free development instance — no license required. Evaluate and test with your team before going live.',
    },
    {
      icon: <Crown className="w-8 h-8" />,
      title: 'Licensed Production Server',
      text: 'Unlock the full platform with uncapped users, courses, and features. Production licenses include priority support.',
    },
  ];

  return (
    <section className="w-full py-20 px-4" style={{ backgroundColor: 'var(--section-alt-bg, var(--section-bg))' }}>
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-6" style={{ backgroundColor: 'var(--badge-bg, color-mix(in srgb, var(--action-primary) 12%, transparent))', color: 'var(--action-primary)' }}>
            <Server className="w-4 h-4" />
            <span className="text-sm font-semibold">On-Premise Deployment</span>
          </div>
          <h3
            className="text-3xl md:text-4xl font-bold mb-4"
            style={{ color: 'var(--section-heading)' }}
          >
            Deploy LearnPlay On Your Own Servers
          </h3>
          <p
            className="text-lg max-w-2xl mx-auto"
            style={{ color: 'var(--section-subheading)' }}
          >
            Take full control of your learning platform with an on-premise installation. 
            Perfect for organizations that require data sovereignty and regulatory compliance.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          {features.map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="rounded-xl p-6 flex gap-5 items-start transition-transform duration-300 hover:scale-[1.02]"
              style={{
                backgroundColor: 'var(--feature-card-bg)',
                color: 'var(--feature-card-fg)',
                border: '1px solid var(--feature-card-border)',
              }}
            >
              <div
                className="w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: 'var(--feature-card-icon-bg)', color: 'var(--feature-card-icon-fg)' }}
              >
                {feature.icon}
              </div>
              <div>
                <h4
                  className="text-lg font-bold mb-1.5"
                  style={{ color: 'var(--feature-card-title)' }}
                >
                  {feature.title}
                </h4>
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: 'var(--feature-card-body)' }}
                >
                  {feature.text}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="rounded-xl p-8 text-center"
          style={{
            backgroundColor: 'var(--glass-card-bg)',
            border: '1px solid var(--glass-card-border)',
          }}
        >
          <Building2 className=" text-primary" />
          <h4
            className="text-xl font-bold mb-2"
            style={{ color: 'var(--glass-card-title)' }}
          >
            Enterprise Customer Portal
          </h4>
          <p
            className="text-sm mb-6 max-w-lg mx-auto"
            style={{ color: 'var(--glass-card-text)' }}
          >
            Enterprise customer onboarding and ongoing license management are now handled directly from your on-premise custSuper portal.
          </p>
          <p className="text-xs mt-4" style={{ color: 'var(--glass-card-text)', opacity: 0.7 }}>
            Contact LearnPlay support if your on-prem deployment needs enterprise onboarding assistance.
          </p>
        </motion.div>
      </div>
    </section>
  );
};

const CacheClearButton = () => {
  const [isClearing, setIsClearing] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleClearCache = () => {
    setIsClearing(true);
    
    try {
      localStorage.clear();
      sessionStorage.clear();
      
      if ('caches' in window) {
        caches.keys().then(names => {
          names.forEach(name => {
            caches.delete(name);
          });
        });
      }
      
      setTimeout(() => {
        setIsClearing(false);
        setShowConfirm(false);
        window.location.reload(true);
      }, 500);
    } catch (error) {
      console.error('Error clearing cache:', error);
      setIsClearing(false);
      setShowConfirm(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50" data-testid="cache-clear-container">
      {showConfirm ? (
        <motion.div 
          className="bg-card border border-border rounded-lg shadow-dialog p-4 max-w-xs"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
        >
          <p className="text-sm text-foreground mb-3">Clear all site cache and reload? This will sign you out.</p>
          <div className="flex gap-2">
            <button
              onClick={handleClearCache}
              disabled={isClearing}
              className="flex-1 px-3 py-2 bg-destructive hover:bg-destructive/90 text-destructive-foreground text-sm font-medium rounded-lg transition-all disabled:text-[var(--input-disabled-fg)]"
              data-testid="button-confirm-clear"
            >
              {isClearing ? 'Clearing...' : 'Clear Cache'}
            </button>
            <Button type="button" variant="secondary" onClick={() => setShowConfirm(false)}
              className="flex-1 px-3 py-2 text-sm font-medium rounded-lg transition-all"
              data-testid="button-cancel-clear"
            >
              Cancel
            </Button>
          </div>
        </motion.div>
      ) : (
        <Button type="button" variant="outline" onClick={() => setShowConfirm(true)}
          className="px-3 py-2 text-xs font-medium rounded-lg transition-all shadow-elevated"
          data-testid="button-open-clear-cache"
          title="Clear site cache"
        >
          🗑️ Clear Cache
        </Button>
      )}
    </div>
  );
};

const Landing = () => {
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [, setLocation] = useLocation();
  const { branding } = useBranding();
  const orgName = branding?.orgName || 'LearnPlay';
  const logoUrl = branding?.logoUrl;
  
  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ["/api/auth/user"],
    retry: false,
    queryFn: async () => {
      const res = await fetch('/api/auth/user', { credentials: 'include' });
      if (res.status === 401) return null;
      if (!res.ok) throw new Error('Failed to fetch user');
      return res.json();
    },
  });

  const { data: adminCheck, isLoading: adminLoading } = useQuery({
    queryKey: ["/api/admin/check"],
    retry: false,
    enabled: !!user,
  });

  const isAuthenticated = !!user;
  const isAdmin = adminCheck?.isAdmin || false;
  const isSuperAdmin = adminCheck?.isSuperAdmin || false;
  const isOrgAdmin = adminCheck?.isOrgAdmin || false;

  useEffect(() => {
    if (!userLoading && isAuthenticated) {
      setLocation('/home');
    }
  }, [userLoading, isAuthenticated, setLocation]);

  if (userLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden">
      <PremiumHeader isAuthenticated={isAuthenticated} isAdmin={isAdmin} isSuperAdmin={isSuperAdmin} user={user} isAdminLoading={adminLoading} />
      
      <HeroSection />

      <ShowcaseCoursesSection />
      
      <ValuePillarsSection />
      
      <EnterpriseSection />
      
      <section className="w-full py-12 text-center" style={{ backgroundColor: 'var(--section-bg)' }}>
        <Button type="button" onClick={() => setIsRequestModalOpen(true)}
          className="px-8 py-4 font-bold rounded-xl transition-all hover:scale-105 hover:opacity-90 inline-flex items-center gap-3 text-lg shadow-elevated bg-[var(--cta-bg)] text-cta-fg"
        >
          <MessageSquare className="w-5 h-5" />
          Request Help or Enhancement
        </Button>
      </section>

      <footer 
        className="w-full border-t" 
        style={{ 
          backgroundColor: 'var(--footer-bg)',
          borderColor: 'var(--footer-border)'
        }}
        data-testid="footer-section"
      >
        <div className="max-w-7xl mx-auto px-4 py-12">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-8">
            <div className="text-center md:text-left" data-testid="footer-brand-section">
              <div className="flex items-center gap-3 justify-center md:justify-start mb-3">
                {logoUrl ? (
                  <img 
                    src={logoUrl} 
                    alt={`${orgName} Logo`} 
                    className="w-10 h-10 rounded-lg object-contain bg-background p-0.5"
                    data-testid="footer-org-logo"
                  />
                ) : (
                  <div 
                    className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-lg"
                    data-testid="footer-org-initials"
                  >
                    {orgName.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase()}
                  </div>
                )}
                <h3 className=" text-footer-heading">
                  <span className="text-[var(--text-primary)]">
                    {orgName}
                  </span>
                </h3>
              </div>
              <p className=" text-footer-fg" data-testid="text-footer-tagline">
                Smart Learning Management - Create courses, lessons, and quizzes in minutes
              </p>
            </div>

            <div className="text-center md:text-left" data-testid="footer-quick-links">
              <h4 className=" text-footer-heading">Quick Links</h4>
              <div className="flex flex-col gap-2">
                <Link href="/browse-courses">
                  <span 
                    className="text-sm transition-colors cursor-pointer flex items-center gap-2 justify-center md:justify-start" 
                    style={{ color: 'var(--footer-link)' }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--footer-link-hover)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--footer-link)'}
                    data-testid="footer-link-browse-courses"
                  >
                    <GraduationCap className="w-4 h-4" />
                    Browse Courses
                  </span>
                </Link>
                <Link href="/create-course">
                  <span 
                    className="text-sm transition-colors cursor-pointer flex items-center gap-2 justify-center md:justify-start" 
                    style={{ color: 'var(--footer-link)' }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--footer-link-hover)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--footer-link)'}
                    data-testid="footer-link-create-courses"
                  >
                    <Sparkles className="w-4 h-4" />
                    Create Courses
                  </span>
                </Link>
                <Link href="/register">
                  <span 
                    className="text-sm transition-colors cursor-pointer flex items-center gap-2 justify-center md:justify-start" 
                    style={{ color: 'var(--footer-link)' }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--footer-link-hover)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--footer-link)'}
                    data-testid="footer-link-free-trial"
                  >
                    <Zap className="w-4 h-4" />
                    Start Free Trial
                  </span>
                </Link>
                <span 
                  onClick={() => setIsRequestModalOpen(true)}
                  className="text-sm transition-colors cursor-pointer flex items-center gap-2 justify-center md:justify-start" 
                  style={{ color: 'var(--footer-link)' }}
                  onMouseEnter={(e) => e.currentTarget.style.color = 'var(--footer-link-hover)'}
                  onMouseLeave={(e) => e.currentTarget.style.color = 'var(--footer-link)'}
                  data-testid="footer-link-pricing"
                >
                  <CreditCard className="w-4 h-4" />
                  Request Pricing
                </span>
                <Link href="/login">
                  <span 
                    className="text-sm transition-colors cursor-pointer flex items-center gap-2 justify-center md:justify-start" 
                    style={{ color: 'var(--footer-link)' }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--footer-link-hover)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--footer-link)'}
                    data-testid="footer-link-login"
                  >
                    <User className="w-4 h-4" />
                    Sign In
                  </span>
                </Link>
                <Link href="/register">
                  <span 
                    className="text-sm transition-colors cursor-pointer flex items-center gap-2 justify-center md:justify-start" 
                    style={{ color: 'var(--footer-link)' }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--footer-link-hover)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--footer-link)'}
                    data-testid="footer-link-register"
                  >
                    <ArrowRight className="w-4 h-4" />
                    Get Started
                  </span>
                </Link>
              </div>
            </div>

            <div className="text-center md:text-left" data-testid="footer-organizations">
              <h4 className=" text-footer-heading">For Organizations</h4>
              <div className="flex flex-col gap-2">
                <Link href="/register?type=business">
                  <span 
                    className="text-sm transition-colors cursor-pointer flex items-center gap-2 justify-center md:justify-start" 
                    style={{ color: 'var(--footer-link)' }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--footer-link-hover)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--footer-link)'}
                    data-testid="footer-link-businesses"
                  >
                    <Building2 className="w-4 h-4" />
                    Businesses & Corporates
                  </span>
                </Link>
                <Link href="/register?type=creator">
                  <span 
                    className="text-sm transition-colors cursor-pointer flex items-center gap-2 justify-center md:justify-start" 
                    style={{ color: 'var(--footer-link)' }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--footer-link-hover)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--footer-link)'}
                    data-testid="footer-link-creators"
                  >
                    <PenTool className="w-4 h-4" />
                    Course Creators
                  </span>
                </Link>
              </div>
            </div>

            <div className="text-center md:text-left" data-testid="footer-mobile-share">
              <h4 className=" text-footer-heading">Learn & Create Anywhere</h4>
              <div className="flex flex-col gap-3 mb-4">
                <div className=" text-footer-fg" data-testid="footer-pwa-info">
                  <Smartphone className="w-4 h-4 text-primary" />
                  <span>Install as app on any device</span>
                </div>
                <div className=" text-footer-fg" data-testid="footer-share-info">
                  <Share2 className="w-4 h-4 text-secondary" />
                  <span>Share courses with a link</span>
                </div>
              </div>
              
              <h4 className=" text-footer-heading">Resources</h4>
              <div className="flex justify-center md:justify-start gap-4 mb-3">
                <a 
                  href="https://www.youtube.com/@learnplay-coza" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 rounded-lg transition-all hover:scale-105"
                  style={{ 
                    backgroundColor: 'var(--footer-social-bg)', 
                    color: 'var(--footer-social-fg)'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--footer-social-hover-bg)';
                    e.currentTarget.style.color = 'var(--footer-social-hover-fg)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--footer-social-bg)';
                    e.currentTarget.style.color = 'var(--footer-social-fg)';
                  }}
                  data-testid="footer-youtube-button"
                >
                  <Youtube className="w-5 h-5" />
                  <span className="text-sm font-semibold">Watch Tutorials</span>
                </a>
              </div>
              <p className=" text-footer-fg">
                Tutorials, tips, and platform guides
              </p>
            </div>
          </div>

          <div className="border-t pt-6 mb-6" style={{ borderColor: 'var(--footer-border)' }}>
            <div className="flex flex-wrap items-center justify-center gap-4 md:gap-6">
              {branding?.supportUrl && (
                <a 
                  href={branding.supportUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm transition-colors flex items-center gap-2"
                  style={{ color: 'var(--footer-link)' }}
                  onMouseEnter={(e) => e.currentTarget.style.color = 'var(--footer-link-hover)'}
                  onMouseLeave={(e) => e.currentTarget.style.color = 'var(--footer-link)'}
                  data-testid="footer-link-support"
                >
                  <ExternalLink className="w-4 h-4" />
                  Support
                </a>
              )}
              {branding?.supportEmail && (
                <a 
                  href={`mailto:${branding.supportEmail}`}
                  className="text-sm transition-colors flex items-center gap-2"
                  style={{ color: 'var(--footer-link)' }}
                  onMouseEnter={(e) => e.currentTarget.style.color = 'var(--footer-link-hover)'}
                  onMouseLeave={(e) => e.currentTarget.style.color = 'var(--footer-link)'}
                  data-testid="footer-link-contact"
                >
                  <Mail className="w-4 h-4" />
                  Contact Us
                </a>
              )}
              {branding?.termsUrl ? (
                <a 
                  href={branding.termsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm transition-colors flex items-center gap-2"
                  style={{ color: 'var(--footer-link)' }}
                  onMouseEnter={(e) => e.currentTarget.style.color = 'var(--footer-link-hover)'}
                  onMouseLeave={(e) => e.currentTarget.style.color = 'var(--footer-link)'}
                  data-testid="footer-link-terms"
                >
                  <FileCheck className="w-4 h-4" />
                  Terms of Service
                </a>
              ) : (
                <Link href="/terms">
                  <span 
                    className="text-sm transition-colors cursor-pointer flex items-center gap-2" 
                    style={{ color: 'var(--footer-link)' }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--footer-link-hover)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--footer-link)'}
                    data-testid="footer-link-terms"
                  >
                    <FileCheck className="w-4 h-4" />
                    Terms of Service
                  </span>
                </Link>
              )}
              {branding?.privacyUrl ? (
                <a 
                  href={branding.privacyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm transition-colors flex items-center gap-2"
                  style={{ color: 'var(--footer-link)' }}
                  onMouseEnter={(e) => e.currentTarget.style.color = 'var(--footer-link-hover)'}
                  onMouseLeave={(e) => e.currentTarget.style.color = 'var(--footer-link)'}
                  data-testid="footer-link-privacy"
                >
                  <Shield className="w-4 h-4" />
                  Privacy Policy
                </a>
              ) : (
                <Link href="/privacy">
                  <span 
                    className="text-sm transition-colors cursor-pointer flex items-center gap-2" 
                    style={{ color: 'var(--footer-link)' }}
                    onMouseEnter={(e) => e.currentTarget.style.color = 'var(--footer-link-hover)'}
                    onMouseLeave={(e) => e.currentTarget.style.color = 'var(--footer-link)'}
                    data-testid="footer-link-privacy"
                  >
                    <Shield className="w-4 h-4" />
                    Privacy Policy
                  </span>
                </Link>
              )}
            </div>
          </div>

          <div className="border-t pt-6" style={{ borderColor: 'var(--footer-border)' }}>
            <p className=" text-footer-fg" data-testid="text-footer">
              © 2025 {orgName} - Smart Learning Platform. All rights reserved.
            </p>
          </div>
        </div>
      </footer>

      <CacheClearButton />
      
      <SalesInquiryModal open={isRequestModalOpen} onOpenChange={setIsRequestModalOpen} />
    </div>
  );
};

export default Landing;
