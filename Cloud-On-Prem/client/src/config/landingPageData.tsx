import {
  GraduationCap,
  BookOpen,
  Briefcase,
  Sparkles,
  Users,
  Brain,
  Trophy,
  Zap,
  Play,
  CheckCircle,
  Star,
  Flame,
  Crown,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';

export type AudienceId = 'schools' | 'universities' | 'businesses' | 'course-creators';

export interface AudienceData {
  id: AudienceId;
  label: string;
  title: string;
  icon: LucideIcon;
  gradient: string;
  glowColor: string;
  heroTagline: string;
  features: string[];
  cta: string;
  ctaLink: string;
}

export interface HeroMessage {
  id: string;
  headline: string[];
  subheadline: string;
  emphasis: string;
}

export interface FeatureStep {
  id: string;
  step: string;
  title: string;
  subtitle: string;
  gradient: string;
  iconGradient: string;
}

export const AUDIENCES: AudienceData[] = [
  {
    id: 'schools',
    label: 'Schools',
    title: 'Schools',
    icon: GraduationCap,
    gradient: 'from-primary to-accent',
    glowColor: 'primary',
    heroTagline: 'Boost student engagement with gamified lessons',
    features: [
      'Create curriculum-aligned courses and quizzes',
      'Track student progress with real-time analytics',
      'Gamified learning with XP, levels & leaderboards',
      '30-day free trial with full access',
    ],
    cta: 'Start Free Trial',
    ctaLink: '/org-registration',
  },
  {
    id: 'universities',
    label: 'Universities',
    title: 'Universities',
    icon: BookOpen,
    gradient: 'from-secondary to-primary',
    glowColor: 'secondary',
    heroTagline: 'Scale course creation across departments',
    features: [
      'Scale course creation across departments',
      'AI-assisted lecture materials & assessments',
      'Research & academic content support',
      'Enterprise pricing with volume discounts',
    ],
    cta: 'Contact Sales',
    ctaLink: '/org-registration',
  },
  {
    id: 'businesses',
    label: 'Businesses',
    title: 'Businesses',
    icon: Briefcase,
    gradient: 'from-primary to-accent',
    glowColor: 'primary',
    heroTagline: 'Cut training costs by 60% with AI',
    features: [
      'Corporate training & onboarding made easy',
      'Compliance courses with certification',
      'Track team performance & completion',
      'Custom branding & white-label options',
    ],
    cta: 'Get Started',
    ctaLink: '/org-registration',
  },
  {
    id: 'course-creators',
    label: 'Course Creators',
    title: 'Course Creators',
    icon: Sparkles,
    gradient: 'from-yellow-500 to-orange-500',
    glowColor: 'yellow',
    heroTagline: 'Launch courses in minutes, earn 80% revenue',
    features: [
      'Launch courses in minutes, not weeks',
      'Sell to a global audience instantly',
      'AI does 95% of the content work',
      'Keep 80% of course revenue',
    ],
    cta: 'Start Creating',
    ctaLink: '/register',
  },
];

export const HERO_MESSAGES: HeroMessage[] = [
  {
    id: 'business-roi',
    headline: ['Cut Training Costs', 'by 60% with AI-Powered', 'Course Creation'],
    subheadline: 'From weeks of content development to minutes',
    emphasis: 'For Businesses & Enterprises',
  },
  {
    id: 'education-engagement',
    headline: ['Boost Student', 'Engagement by 3x', 'with Gamified Learning'],
    subheadline: 'XP, levels, leaderboards & rewards that motivate',
    emphasis: 'For Schools & Universities',
  },
  {
    id: 'creator-revenue',
    headline: ['Launch Courses', 'in Minutes, Keep up to', '80% of Revenue'],
    subheadline: 'AI creates content, you add expertise',
    emphasis: 'For Course Creators',
  },
  {
    id: 'time-savings',
    headline: ['Create Complete', 'Learning Programs', 'in Minutes, Not Days'],
    subheadline: 'AI gets you 95% ready, only 5% polish needed',
    emphasis: 'For Everyone',
  },
];

export const FEATURE_STEPS: FeatureStep[] = [
  {
    id: 'course-builder',
    step: 'Course Builder',
    title: 'AI-Assisted Course Builder',
    subtitle: 'Describe your course and get an instant framework',
    gradient: 'from-primary to-secondary',
    iconGradient: 'from-primary/80 to-secondary/80',
  },
  {
    id: 'lesson-creator',
    step: 'Lesson Creator',
    title: 'AI-Assisted Lesson Creator',
    subtitle: 'Upload Word Doc or PPT, get interactive lessons',
    gradient: 'from-secondary to-accent',
    iconGradient: 'from-secondary/80 to-accent/80',
  },
  {
    id: 'quiz-generator',
    step: 'Quiz Generator',
    title: 'AI-Assisted Quiz Generator',
    subtitle: 'Generate quizzes from any lesson content',
    gradient: 'from-primary to-primary/80',
    iconGradient: 'from-primary/80 to-primary/60',
  },
  {
    id: 'video-creator',
    step: 'Video Creator',
    title: 'PowerPoint to Video',
    subtitle: 'Transform presentations into engaging videos',
    gradient: 'from-yellow-500 to-orange-500',
    iconGradient: 'from-yellow-400 to-orange-400',
  },
  {
    id: 'gamification',
    step: 'Gamification',
    title: 'Gamification & Rewards',
    subtitle: 'Make learning addictively fun',
    gradient: 'from-amber-500 to-red-500',
    iconGradient: 'from-amber-400 to-red-400',
  },
];

export const TRUST_INDICATORS = [
  { icon: CheckCircle, text: 'Used by educators worldwide', color: 'text-success' },
  { icon: Users, text: 'Secure & Private', color: 'text-secondary' },
  { icon: Zap, text: 'AI-Assisted', color: 'text-accent' },
] as const;

export const GAMIFICATION_FEATURES = [
  { icon: Flame, label: 'XP & Levels', desc: 'Earn XP for learning', color: 'text-accent' },
  { icon: Zap, label: 'Power-Ups', desc: '2x & 3x XP boosts', color: 'text-accent' },
  { icon: Star, label: 'Cosmetics', desc: 'Unlock avatars', color: 'text-primary' },
  { icon: Crown, label: 'Season Pass', desc: 'Exclusive rewards', color: 'text-accent' },
] as const;

export function getAudienceById(id: AudienceId): AudienceData | undefined {
  return AUDIENCES.find((a) => a.id === id);
}

export function getAudienceIcon(id: AudienceId): LucideIcon {
  const audience = getAudienceById(id);
  return audience?.icon ?? GraduationCap;
}

export function getFeatureStepById(id: string): FeatureStep | undefined {
  return FEATURE_STEPS.find((f) => f.id === id);
}
