import {
  LayoutDashboard,
  Building2,
  BarChart3,
  MessageSquare,
  Webhook,
  FolderTree,
  UserCheck,
  Users,
  DollarSign,
  CreditCard,
  Receipt,
  RefreshCcw,
  TrendingUp,
  Settings,
  Crown,
  Wand2,
  Coins,
  Palette,
  Layers,
  Presentation,
  FileQuestion,
  BookOpen,
  Store,
  UserCog,
  Gamepad2,
  Wallet,
  Award,
  ArrowLeftRight,
  KeyRound,
  BrainCircuit,
  type LucideIcon,
} from 'lucide-react';

export type UserRole = 'superadmin' | 'custsuper' | 'orgadmin' | 'teacher' | 'teamlead' | 'authenticated';
export type OrgType = 'education' | 'business' | 'elearning';
export type FeatureFlag = 'ENABLE_QUIZ_CREDIT_CHARGING' | 'MARKETPLACE_ENABLED' | 'PAYMENT_GATEWAY_ENABLED';

export interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
  path: string;
  description: string;
  roles: UserRole[];
  orgTypes?: OrgType[];
  featureFlag?: FeatureFlag;
  badge?: 'joinRequests' | 'pendingPayouts' | 'pendingRefunds';
  breadcrumbLabel?: string;
  keywords?: string[];
  hidden?: boolean;
  hideOnPrem?: boolean;
  onpremOnly?: boolean;
  onPremLabel?: string;
  onPremDescription?: string;
  isExternal?: boolean;
  externalUrl?: string;
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

export interface NavSection {
  id: string;
  label: string;
  icon: LucideIcon;
  color: string;
  groups: NavGroup[];
  roles: UserRole[];
  defaultExpanded?: boolean;
  onpremOnly?: boolean;
}

export interface BreadcrumbMeta {
  label: string;
  path?: string;
  section?: string;
}

export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'platform-settings',
    label: 'Platform Settings',
    icon: Settings,
    color: 'text-primary',
    roles: ['superadmin', 'custsuper'],
    defaultExpanded: true,
    groups: [
      {
        id: 'platform-dashboard',
        label: 'Dashboard',
        items: [
          {
            id: 'super-admin-dashboard',
            label: 'Super Admin Dashboard',
            icon: LayoutDashboard,
            path: '/super-admin',
            description: 'Platform Overview',
            roles: ['superadmin'],
            breadcrumbLabel: 'Super Admin',
            keywords: ['dashboard', 'overview', 'admin'],
          },
          {
            id: 'impersonate',
            label: 'Act as Organization',
            icon: Building2,
            path: '/superadmin/impersonate',
            description: 'Impersonate Org Admin',
            roles: ['superadmin'],
            breadcrumbLabel: 'Impersonate',
            keywords: ['impersonate', 'act as', 'organization'],
          },
          {
            id: 'organization-analytics',
            label: 'Organization Analytics',
            icon: BarChart3,
            path: '/organization-analytics',
            description: 'All Organizations',
            roles: ['superadmin', 'custsuper'],
            breadcrumbLabel: 'Organization Analytics',
            keywords: ['analytics', 'organizations', 'metrics'],
          },
          {
            id: 'enterprise-management',
            label: 'Enterprise Management',
            icon: Building2,
            path: '/superadmin/enterprise',
            description: 'Customers, Licenses & Revenue',
            roles: ['superadmin'],
            hideOnPrem: true,
            breadcrumbLabel: 'Enterprise Management',
            keywords: ['enterprise', 'customers', 'licenses', 'management'],
          },
        ],
      },
      {
        id: 'platform-config',
        label: 'Configuration',
        items: [
          {
            id: 'platform-config',
            label: 'Platform Config',
            icon: Settings,
            path: '/superadmin/config',
            description: 'Commission & System Settings',
            roles: ['superadmin'],
            breadcrumbLabel: 'Configuration',
            keywords: ['config', 'settings', 'system', 'yoco', 'commission'],
          },
          {
            id: 'platform-pricing',
            label: 'Platform Pricing',
            icon: DollarSign,
            path: '/admin/platform-pricing',
            description: 'Pricing Rules',
            roles: ['superadmin'],
            hideOnPrem: true,
            breadcrumbLabel: 'Platform Pricing',
            keywords: ['pricing', 'platform', 'costs'],
          },
          {
            id: 'currency-management',
            label: 'Currency Management',
            icon: DollarSign,
            path: '/superadmin/currency',
            description: 'Exchange Rates',
            roles: ['superadmin'],
            breadcrumbLabel: 'Currency',
            keywords: ['currency', 'exchange', 'rates'],
          },
          {
            id: 'integration-settings',
            label: 'Integration Settings',
            icon: KeyRound,
            path: '/admin/integration-settings',
            description: 'API Keys & Defaults',
            roles: ['superadmin', 'custsuper'],
            breadcrumbLabel: 'Integration Settings',
            keywords: ['integration', 'settings', 'api', 'keys', 'defaults'],
          },
          {
            id: 'system-changes',
            label: 'System Changes',
            icon: Settings,
            path: '/admin/system-changes',
            description: 'Critical Settings Audit',
            roles: ['superadmin', 'custsuper'],
            breadcrumbLabel: 'System Changes',
            keywords: ['audit', 'settings', 'changes', 'history', 'events'],
          },
          {
            id: 'lesson-credits',
            label: 'LP Credits',
            icon: Coins,
            path: '/lesson-credits',
            description: 'LPC Pricing',
            roles: ['superadmin', 'custsuper'],
            breadcrumbLabel: 'LP Credits',
            keywords: ['lp', 'credits', 'lpc', 'pricing'],
          },
          {
            id: 'demo-data-manager',
            label: 'Demo Data',
            icon: Wand2,
            path: '/admin/demo-data',
            description: 'Generate & Purge Demo Data',
            roles: ['superadmin', 'custsuper'],
            breadcrumbLabel: 'Demo Data',
            keywords: ['demo', 'seed', 'generate', 'reset', 'purge'],
          },
          {
            id: 'gamification-settings',
            label: 'Gamification',
            icon: Crown,
            path: '/admin/gamification-settings',
            description: 'Economy & Rewards',
            roles: ['superadmin', 'custsuper'],
            breadcrumbLabel: 'Gamification',
            keywords: ['gamification', 'economy', 'rewards'],
          },
          {
            id: 'gamma-themes',
            label: 'Presentation Themes',
            icon: Palette,
            path: '/gamma-themes',
            description: 'AI Themes',
            roles: ['superadmin', 'custsuper'],
            breadcrumbLabel: 'Presentation Themes',
            keywords: ['themes', 'presentation', 'gamma'],
          },
          {
            id: 'brand-editor-superadmin',
            label: 'Brand Editor',
            icon: Palette,
            path: '/theme-editor',
            description: 'White-Label Branding',
            roles: ['superadmin', 'custsuper', 'orgadmin'],
            breadcrumbLabel: 'Brand Editor',
            keywords: ['brand', 'theme', 'white-label', 'branding', 'colors', 'logo'],
          },
        ],
      },
      {
        id: 'platform-revenue',
        label: 'Platform Revenue',
        items: [
          {
            id: 'lpc-analytics',
            label: 'LPC Analytics',
            icon: Coins,
            path: '/superadmin/platform-revenue',
            description: 'Credit Revenue & Spend',
            roles: ['superadmin', 'custsuper'],
            breadcrumbLabel: 'LPC Analytics',
            keywords: ['lpc', 'credits', 'analytics', 'revenue', 'spend'],
          },
          {
            id: 'cost-management',
            label: 'Cost Management',
            icon: DollarSign,
            path: '/superadmin/platform-revenue',
            description: 'Platform Costs',
            roles: ['superadmin', 'custsuper'],
            breadcrumbLabel: 'Cost Management',
            keywords: ['costs', 'expenses', 'monthly', 'recurring'],
          },
          {
            id: 'platform-revenue-reports',
            label: 'Revenue Reports',
            icon: BarChart3,
            path: '/superadmin/platform-revenue',
            description: 'Financial Analytics',
            roles: ['superadmin', 'custsuper'],
            breadcrumbLabel: 'Revenue Reports',
            keywords: ['revenue', 'reports', 'analytics'],
          },
          {
            id: 'e-learning-revenue',
            label: 'E-Learning Revenue',
            icon: BarChart3,
            path: '/admin/e-learning-revenue',
            description: 'Course Sales',
            roles: ['superadmin', 'custsuper'],
            breadcrumbLabel: 'E-Learning Revenue',
            keywords: ['elearning', 'revenue', 'sales'],
          },
          {
            id: 'payout-management',
            label: 'Payout Management',
            icon: TrendingUp,
            path: '/payout-management',
            description: 'Creator Payouts',
            roles: ['superadmin'],
            badge: 'pendingPayouts',
            breadcrumbLabel: 'Payout Management',
            keywords: ['payouts', 'creators', 'payments'],
          },
        ],
      },
      {
        id: 'platform-operations',
        label: 'Operations',
        items: [
          {
            id: 'sales-inquiries',
            label: 'Sales Inquiries',
            icon: MessageSquare,
            path: '/sales-inquiries',
            description: 'Customer Inquiries',
            roles: ['superadmin'],
            breadcrumbLabel: 'Sales Inquiries',
            keywords: ['sales', 'inquiries', 'leads'],
          },
          {
            id: 'webhooks',
            label: 'Webhook Admin',
            icon: Webhook,
            path: '/webhooks',
            description: 'Payment Webhooks',
            roles: ['superadmin'],
            breadcrumbLabel: 'Webhooks',
            keywords: ['webhooks', 'payments', 'integrations'],
          },
        ],
      },
    ],
  },
  {
    id: 'onprem-management',
    label: 'Platform Management',
    icon: Settings,
    color: 'text-primary',
    roles: ['custsuper', 'superadmin'],
    onpremOnly: true,
    defaultExpanded: true,
    groups: [
      {
        id: 'onprem-pricing',
        label: 'Pricing & Credits',
        items: [
          {
            id: 'manage-pricing',
            label: 'Manage Pricing',
            icon: DollarSign,
            path: '/custsuper/manage-pricing',
            description: 'Configure LPC pricing for AI features',
            roles: ['custsuper', 'superadmin'],
            breadcrumbLabel: 'Manage Pricing',
            keywords: ['pricing', 'credits', 'cost', 'lpc'],
          },
          {
            id: 'manage-credits',
            label: 'Manage LPC Balance',
            icon: Wallet,
            path: '/custsuper/manage-credits',
            description: 'Adjust organization and user credit balances',
            roles: ['custsuper', 'superadmin'],
            breadcrumbLabel: 'Manage Credits',
            keywords: ['credits', 'balance', 'lpc', 'wallet'],
          },
        ],
      },
      {
        id: 'onprem-enrollments',
        label: 'Enrollments',
        items: [
          {
            id: 'enrollment-management',
            label: 'Enrollment Management',
            icon: Users,
            path: '/admin/enrollment-management',
            description: 'Course Enrollments',
            roles: ['custsuper', 'superadmin'],
            breadcrumbLabel: 'Enrollment Management',
            keywords: ['enrollments', 'courses', 'students', 'paid'],
          },
          {
            id: 'onprem-course-reviews',
            label: 'Course Ratings & Reviews',
            icon: MessageSquare,
            path: '/admin/course-reviews',
            description: 'View course feedback',
            roles: ['custsuper', 'superadmin'],
            breadcrumbLabel: 'Course Ratings & Reviews',
            keywords: ['course', 'ratings', 'reviews', 'feedback'],
            onpremOnly: true,
          },
        ],
      },
      {
        id: 'onprem-licensing',
        label: 'Licensing',
        items: [
          {
            id: 'license-management',
            label: 'License Management',
            icon: Crown,
            path: '/custsuper/license-management',
            description: 'Manage on-premises license',
            roles: ['custsuper', 'superadmin'],
            breadcrumbLabel: 'License Management',
            keywords: ['license', 'hardware', 'key', 'activation', 'onprem'],
            onpremOnly: true,
          },
        ],
      },
      {
        id: 'onprem-organizations',
        label: 'Organizations',
        items: [
          {
            id: 'organization-analytics',
            label: 'Organization Management',
            icon: Building2,
            path: '/organization-analytics',
            description: 'Manage organizations & user counts',
            roles: ['custsuper', 'superadmin'],
            breadcrumbLabel: 'Organization Management',
            keywords: ['organizations', 'manage', 'users', 'counts', 'packages'],
          },
          {
            id: 'interorg-config',
            label: 'Cross-Org Course Sharing',
            icon: ArrowLeftRight,
            path: '/custsuper/interorg-config',
            description: 'Manage inter-organization course assignment rules',
            roles: ['custsuper', 'superadmin'],
            breadcrumbLabel: 'Cross-Org Sharing',
            keywords: ['inter-org', 'cross', 'organization', 'sharing', 'assignment', 'rules'],
            onpremOnly: true,
          },
        ],
      },
    ],
  },
  {
    id: 'game-content',
    label: 'Game Content',
    icon: Gamepad2,
    color: 'text-accent',
    roles: ['superadmin'],
    groups: [
      {
        id: 'game-management',
        label: 'Card Management',
        items: [
          {
            id: 'collections-manager',
            label: 'Card Collections',
            icon: Layers,
            path: '/collections-manager',
            description: 'Game Collections',
            roles: ['superadmin'],
            breadcrumbLabel: 'Card Collections',
            keywords: ['collections', 'cards', 'game'],
          },
          {
            id: 'cards-manager',
            label: 'Manage Cards',
            icon: CreditCard,
            path: '/cards-manager',
            description: 'Create & Edit Cards',
            roles: ['superadmin'],
            breadcrumbLabel: 'Manage Cards',
            keywords: ['cards', 'manage', 'edit'],
          },
        ],
      },
    ],
  },
  {
    id: 'organization-management',
    label: 'Organization',
    icon: Building2,
    color: 'text-secondary',
    roles: ['superadmin', 'orgadmin', 'teacher'],
    groups: [
      {
        id: 'org-structure',
        label: 'Structure & Access',
        items: [
          {
            id: 'org-management',
            label: 'Central Management Hub',
            icon: FolderTree,
            path: '/org-management',
            description: 'Structure, Users & Settings',
            roles: ['superadmin', 'orgadmin', 'teacher'],
            breadcrumbLabel: 'Central Management Hub',
            keywords: ['organization', 'structure', 'units', 'teams', 'hierarchy'],
          },
          {
            id: 'org-structure',
            label: 'Organization Structure (Legacy)',
            icon: FolderTree,
            path: '/org-structure',
            description: 'Units & Hierarchy',
            roles: ['orgadmin', 'teacher'],
            breadcrumbLabel: 'Organization Structure',
            keywords: ['organization', 'structure', 'units'],
          },
          {
            id: 'user-management',
            label: 'User Management',
            icon: Users,
            path: '/user-management',
            description: 'Manage Users',
            roles: ['superadmin', 'orgadmin'],
            breadcrumbLabel: 'User Management',
            keywords: ['users', 'management', 'accounts'],
          },
          {
            id: 'join-requests',
            label: 'Join Requests',
            icon: UserCheck,
            path: '/join-requests',
            description: 'Pending Approvals',
            roles: ['orgadmin', 'teacher'],
            badge: 'joinRequests',
            breadcrumbLabel: 'Join Requests',
            keywords: ['join', 'requests', 'approvals'],
          },
          {
            id: 'brand-editor-orgadmin',
            label: 'Brand Editor',
            icon: Palette,
            path: '/theme-editor',
            description: 'Customize Branding',
            roles: ['orgadmin'],
            breadcrumbLabel: 'Brand Editor',
            keywords: ['brand', 'theme', 'branding', 'colors', 'logo', 'customize'],
          },
          {
            id: 'source-intelligence',
            label: 'Source Intelligence',
            icon: BrainCircuit,
            path: '/source-intelligence',
            description: 'NotebookLM Connection',
            roles: ['superadmin', 'custsuper', 'orgadmin'],
            breadcrumbLabel: 'Source Intelligence',
            keywords: ['source', 'intelligence', 'notebooklm', 'google', 'documents', 'extraction'],
          },
        ],
      },
      {
        id: 'org-billing',
        label: 'Billing & Finance',
        items: [
          {
            id: 'billing',
            label: 'Billing Dashboard',
            icon: CreditCard,
            path: '/billing',
            description: 'Invoices & Payments',
            roles: ['orgadmin'],
            breadcrumbLabel: 'Billing',
            keywords: ['billing', 'invoices', 'payments'],
            hideOnPrem: true,
          },
          {
            id: 'billing-audit',
            label: 'Billing Audit Log',
            icon: Receipt,
            path: '/billing/audit-log',
            description: 'Transaction History',
            roles: ['orgadmin'],
            breadcrumbLabel: 'Audit Log',
            keywords: ['audit', 'log', 'transactions'],
          },
          {
            id: 'invoices',
            label: 'Invoice History',
            icon: Receipt,
            path: '/invoices',
            description: 'View & Download Invoices',
            roles: ['superadmin', 'orgadmin', 'teacher', 'authenticated'],
            breadcrumbLabel: 'Invoices',
            keywords: ['invoices', 'receipts', 'download', 'history'],
            hideOnPrem: true,
          },
          {
            id: 'org-credit-usage',
            label: 'Credit Usage Report',
            icon: Wallet,
            path: '/org-credit-usage',
            description: 'Credit Spending Analytics',
            roles: ['orgadmin'],
            breadcrumbLabel: 'Credit Usage Report',
            keywords: ['credit', 'usage', 'report', 'wallet', 'spending'],
          },
          {
            id: 'revenue-analytics',
            label: 'Revenue Analytics',
            icon: BarChart3,
            path: '/admin/revenue-analytics',
            description: 'Sales Metrics',
            roles: ['superadmin'],
            breadcrumbLabel: 'Revenue Analytics',
            keywords: ['revenue', 'analytics', 'metrics'],
            hideOnPrem: true,
          },
          {
            id: 'subscription-console',
            label: 'Subscription Console',
            icon: CreditCard,
            path: '/admin/subscription-console',
            description: 'Manage Subscriptions',
            roles: ['superadmin'],
            breadcrumbLabel: 'Subscription Console',
            keywords: ['subscriptions', 'console', 'manage'],
            hideOnPrem: true,
          },
        ],
      },
      {
        id: 'marketplace-commerce',
        label: 'Marketplace',
        items: [
          {
            id: 'sales-dashboard',
            label: 'Sales Dashboard',
            icon: TrendingUp,
            path: '/admin/sales-dashboard',
            description: 'Course Sales & Revenue',
            roles: ['orgadmin'],
            breadcrumbLabel: 'Sales Dashboard',
            keywords: ['sales', 'revenue', 'courses sold', 'earnings'],
          },
          {
            id: 'marketplace-revenue',
            label: 'Marketplace Revenue',
            icon: Store,
            path: '/marketplace-revenue',
            description: 'Sales & Analytics',
            roles: ['orgadmin'],
            orgTypes: ['elearning'],
            breadcrumbLabel: 'Marketplace Revenue',
            keywords: ['marketplace', 'revenue', 'sales'],
          },
          {
            id: 'course-refunds',
            label: 'Course Refunds',
            icon: RefreshCcw,
            path: '/course-refunds',
            description: 'Refund Requests',
            roles: ['orgadmin'],
            orgTypes: ['elearning'],
            badge: 'pendingRefunds',
            breadcrumbLabel: 'Course Refunds',
            keywords: ['refunds', 'courses', 'requests'],
          },
          {
            id: 'course-reviews-admin',
            label: 'Course Ratings & Reviews',
            icon: MessageSquare,
            path: '/admin/course-reviews',
            description: 'View course feedback',
            roles: ['superadmin', 'orgadmin', 'teacher'],
            breadcrumbLabel: 'Course Ratings & Reviews',
            keywords: ['course', 'ratings', 'reviews', 'feedback'],
          },
          {
            id: 'credit-wallet',
            label: 'LP Credits Wallet',
            icon: Coins,
            path: '/buy-credits',
            description: 'Purchase LPC',
            roles: ['orgadmin'],
            featureFlag: 'PAYMENT_GATEWAY_ENABLED' as FeatureFlag,
            breadcrumbLabel: 'LP Credits Wallet',
            keywords: ['credits', 'wallet', 'lp', 'lpc'],
          },
        ],
      },
    ],
  },
  {
    id: 'learning-content',
    label: 'Learning & Content',
    icon: BookOpen,
    color: 'text-accent',
    roles: ['superadmin', 'orgadmin', 'teacher'],
    groups: [
      {
        id: 'course-management',
        label: 'Course Management',
        items: [
          {
            id: 'course-builder',
            label: 'Course Builder',
            icon: BookOpen,
            path: '/course-builder',
            description: 'Create Courses',
            roles: ['superadmin', 'orgadmin', 'teacher'],
            breadcrumbLabel: 'Course Builder',
            keywords: ['course', 'builder', 'create'],
          },
          {
            id: 'browse-courses',
            label: 'Browse Courses',
            icon: Store,
            path: '/browse-courses',
            description: 'Course Marketplace',
            roles: ['superadmin', 'orgadmin', 'teacher'],
            breadcrumbLabel: 'Browse Courses',
            keywords: ['browse', 'courses', 'marketplace'],
          },
          {
            id: 'course-assignments',
            label: 'Publications & Assignments',
            icon: UserCheck,
            path: '/course-assignments',
            description: 'Manage Publishing',
            roles: ['superadmin', 'orgadmin', 'teacher'],
            breadcrumbLabel: 'Publications & Assignments',
            keywords: ['course', 'assignments', 'assign', 'learners', 'publications', 'publish'],
          },
        ],
      },
      {
        id: 'content-creation',
        label: 'Content Creation',
        items: [
          {
            id: 'management-hub',
            label: 'Management Hub',
            icon: Layers,
            path: '/management-hub',
            description: 'Unified Management',
            roles: ['superadmin', 'orgadmin', 'teacher'],
            breadcrumbLabel: 'Management Hub',
            keywords: ['management', 'hub', 'unified'],
            hidden: true,
          },
          {
            id: 'lessons',
            label: 'Lessons',
            icon: Presentation,
            path: '/course-builder',
            description: 'Managed via Course Builder',
            roles: ['superadmin', 'orgadmin', 'teacher'],
            breadcrumbLabel: 'Course Builder',
            keywords: ['lessons', 'ai', 'content'],
            hidden: true,
          },
          {
            id: 'quiz-drafts',
            label: 'AI Quiz Generator',
            icon: Wand2,
            path: '/course-builder',
            description: 'Managed via Course Builder',
            roles: ['superadmin', 'orgadmin', 'teacher'],
            breadcrumbLabel: 'Course Builder',
            keywords: ['quiz', 'ai', 'generator'],
            hidden: true,
          },
          {
            id: 'quiz-card-manager',
            label: 'Quiz Questions',
            icon: FileQuestion,
            path: '/course-builder',
            description: 'Managed via Course Builder',
            roles: ['superadmin', 'orgadmin', 'teacher'],
            breadcrumbLabel: 'Course Builder',
            keywords: ['quiz', 'questions', 'cards'],
            hidden: true,
          },
        ],
      },
      {
        id: 'learning-analytics',
        label: 'Analytics',
        items: [
          {
            id: 'reports',
            label: 'Reports',
            icon: BarChart3,
            path: '/reports',
            description: 'Performance Analytics',
            roles: ['superadmin', 'orgadmin', 'teacher'],
            breadcrumbLabel: 'Reports',
            keywords: ['reports', 'analytics', 'performance'],
          },
          {
            id: 'sales-dashboard-learning',
            label: 'Sales Dashboard',
            icon: TrendingUp,
            path: '/admin/sales-dashboard',
            description: 'Course Sales & Revenue',
            roles: ['orgadmin'],
            breadcrumbLabel: 'Sales Dashboard',
            keywords: ['sales', 'revenue', 'courses sold', 'earnings'],
          },
        ],
      },
    ],
  },
];

export const ACCOUNT_NAV_ITEMS: NavItem[] = [
  {
    id: 'subscriptions',
    label: 'Subscriptions',
    icon: CreditCard,
    path: '/subscriptions',
    description: 'Manage Subscriptions',
    roles: ['superadmin', 'orgadmin'],
    breadcrumbLabel: 'Subscriptions',
    keywords: ['subscriptions', 'manage'],
    hideOnPrem: true,
  },
  {
    id: 'my-courses',
    label: 'My Courses',
    icon: BookOpen,
    path: '/my-courses',
    description: 'Enrolled Courses',
    roles: ['authenticated'],
    breadcrumbLabel: 'My Courses',
    keywords: ['my', 'courses', 'enrolled'],
  },
  {
    id: 'browse-marketplace',
    label: 'Browse Marketplace',
    icon: Store,
    path: '/browse-courses',
    description: 'Explore Available Courses',
    roles: ['authenticated'],
    breadcrumbLabel: 'Browse Marketplace',
    keywords: ['browse', 'marketplace', 'courses', 'explore', 'shop'],
  },
  {
    id: 'quiz-lobby',
    label: 'Quiz Lobby',
    icon: Gamepad2,
    path: '/quiz-lobby',
    description: 'Play Quiz Games',
    roles: ['authenticated'],
    breadcrumbLabel: 'Quiz Lobby',
    keywords: ['quiz', 'lobby', 'games', 'play'],
  },
  {
    id: 'purchase-history',
    label: 'Purchase History',
    icon: Receipt,
    path: '/purchase-history',
    description: 'Course Purchases',
    roles: ['superadmin', 'orgadmin'],
    breadcrumbLabel: 'Purchase History',
    keywords: ['purchase', 'history'],
    onPremLabel: 'Enrollment History',
    onPremDescription: 'Course Enrollments',
  },
  {
    id: 'certificates',
    label: 'My Certificates',
    icon: Award,
    path: '/certificates',
    description: 'View Earned Certificates',
    roles: ['authenticated'],
    breadcrumbLabel: 'Certificates',
    keywords: ['certificates', 'achievements', 'awards', 'completed'],
  },
  {
    id: 'invoices',
    label: 'Invoices',
    icon: Receipt,
    path: '/invoices',
    description: 'View & Download Invoices',
    roles: ['authenticated'],
    breadcrumbLabel: 'Invoices',
    keywords: ['invoices', 'receipts', 'billing', 'purchases', 'payments'],
    hideOnPrem: true,
  },
  {
    id: 'profile',
    label: 'Profile & Settings',
    icon: UserCog,
    path: '/profile',
    description: 'Profile & Preferences',
    roles: ['authenticated'],
    breadcrumbLabel: 'Profile & Settings',
    keywords: ['profile', 'settings', 'preferences'],
  },
];

export function getAllNavItems(): NavItem[] {
  const items: NavItem[] = [];
  NAV_SECTIONS.forEach(section => {
    section.groups.forEach(group => {
      items.push(...group.items);
    });
  });
  items.push(...ACCOUNT_NAV_ITEMS);
  return items;
}

export function getNavItemByPath(path: string): NavItem | undefined {
  return getAllNavItems().find(item => item.path === path);
}

export function getSectionByPath(path: string): NavSection | undefined {
  for (const section of NAV_SECTIONS) {
    for (const group of section.groups) {
      if (group.items.some(item => item.path === path)) {
        return section;
      }
    }
  }
  return undefined;
}

export function getGroupByPath(path: string): NavGroup | undefined {
  for (const section of NAV_SECTIONS) {
    for (const group of section.groups) {
      if (group.items.some(item => item.path === path)) {
        return group;
      }
    }
  }
  return undefined;
}

export function getBreadcrumbsForPath(path: string): BreadcrumbMeta[] {
  const item = getNavItemByPath(path);
  if (!item) return [];
  
  const section = getSectionByPath(path);
  const breadcrumbs: BreadcrumbMeta[] = [];
  
  if (section) {
    const firstItemInSection = section.groups[0]?.items[0];
    if (firstItemInSection && firstItemInSection.path !== path) {
      breadcrumbs.push({
        label: section.label,
        path: firstItemInSection.path,
        section: section.id,
      });
    }
  }
  
  breadcrumbs.push({
    label: item.breadcrumbLabel || item.label,
  });
  
  return breadcrumbs;
}

export interface FilteredNavigation {
  sections: NavSection[];
  accountItems: NavItem[];
}

// Nav item IDs that should be hidden for demo organizations
const DEMO_ORG_HIDDEN_NAV_ITEMS = [
  'billing',
  'billing-audit',
  'subscription-console',
  'subscriptions',
  'license-seats',
  'credit-wallet',
];

export function filterNavigationByRole(
  isSuperAdmin: boolean,
  isOrgAdmin: boolean,
  isTeacher: boolean,
  organizationType: OrgType | null,
  featureFlags?: Record<FeatureFlag, boolean>,
  isImpersonating?: boolean,
  effectiveOrgAdmin?: boolean,
  isDemo?: boolean,
  isCustSuper?: boolean,
  onpremMode?: boolean
): FilteredNavigation {
  const isOnPrem = onpremMode === true;
  const effectiveSuperAdmin = isSuperAdmin && !isCustSuper;

  const canSeeOrgAdmin = Boolean(isOrgAdmin || effectiveOrgAdmin || ((isSuperAdmin || isCustSuper) && Boolean(isImpersonating)));
  const canSeeCustSuper = isOnPrem && (isCustSuper || effectiveSuperAdmin);
  const effectiveOrgAdminForCustSuper = Boolean(isCustSuper || canSeeOrgAdmin);
  const platformAdminMode = (effectiveSuperAdmin || canSeeCustSuper) && !isImpersonating;

  const canAccessRole = (role: UserRole): boolean => {
    switch (role) {
      case 'superadmin':
        return effectiveSuperAdmin && !isImpersonating;
      case 'custsuper':
        return canSeeCustSuper && !isImpersonating;
      case 'orgadmin':
        return effectiveOrgAdminForCustSuper;
      case 'teacher':
      case 'teamlead':
        return isTeacher || effectiveOrgAdminForCustSuper;
      case 'authenticated':
        return true;
      default:
        return false;
    }
  };

  const isPlatformOnly = (roles: UserRole[]) =>
    roles.some(r => r === 'superadmin' || r === 'custsuper') &&
    !roles.some(r => r === 'orgadmin' || r === 'teacher' || r === 'teamlead');
  const hasPlatformRole = (roles: UserRole[]) =>
    roles.some(r => r === 'superadmin' || r === 'custsuper');
  const platformOrOrgAwarePaths = new Set(['/theme-editor']);

  const filterItem = (item: NavItem): boolean => {
    if (item.hidden) {
      return false;
    }

    if (onpremMode && item.hideOnPrem) {
      return false;
    }
    if (!isOnPrem && item.onpremOnly) {
      return false;
    }
    
    if (isDemo && !isSuperAdmin && DEMO_ORG_HIDDEN_NAV_ITEMS.includes(item.id)) {
      return false;
    }
    
    if (item.orgTypes && organizationType && !item.orgTypes.includes(organizationType)) {
      return false;
    }
    
    if (item.featureFlag && featureFlags && !featureFlags[item.featureFlag]) {
      return false;
    }

    // Platform admins without impersonation should only see platform-oriented tasks.
    if (platformAdminMode && !hasPlatformRole(item.roles)) {
      return false;
    }

    if (platformAdminMode && !isPlatformOnly(item.roles) && !platformOrOrgAwarePaths.has(item.path)) {
      return false;
    }

    // During impersonation, hide platform-only tasks; all actions must apply to impersonated org.
    if (isImpersonating && isPlatformOnly(item.roles)) {
      return false;
    }

    return item.roles.some(canAccessRole);
  };

  const filteredSections = NAV_SECTIONS
    .filter(section => !(section.onpremOnly && !isOnPrem))
    .map(section => ({
      ...section,
      groups: section.groups
        .map(group => ({
          ...group,
          items: group.items.filter(filterItem),
        }))
        .filter(group => group.items.length > 0),
    }))
    .filter(section => section.groups.length > 0);

  const filteredAccountItems = ACCOUNT_NAV_ITEMS.filter(item => {
    if (onpremMode && item.hideOnPrem) {
      return false;
    }
    if (item.orgTypes && organizationType && !item.orgTypes.includes(organizationType)) {
      return false;
    }

    if (platformAdminMode && !hasPlatformRole(item.roles) && !item.roles.includes('authenticated')) {
      return false;
    }

    if (isImpersonating && isPlatformOnly(item.roles)) {
      return false;
    }

    return item.roles.some(canAccessRole);
  });

  return {
    sections: filteredSections,
    accountItems: filteredAccountItems,
  };
}

export const COLLAPSE_STATE_KEY = 'learnplay_nav_collapse_state';

export function getSavedCollapseState(): Record<string, boolean> {
  if (typeof window === 'undefined') return {};
  try {
    const stored = localStorage.getItem(COLLAPSE_STATE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

export function saveCollapseState(state: Record<string, boolean>): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(COLLAPSE_STATE_KEY, JSON.stringify(state));
  } catch {
  }
}
