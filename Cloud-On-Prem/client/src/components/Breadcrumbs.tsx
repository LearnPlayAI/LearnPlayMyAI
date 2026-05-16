import { useLocation, Link } from 'wouter';
import { Home } from 'lucide-react';
import {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
} from '@/components/ui/breadcrumb';
import { cn } from '@/lib/utils';
import {
  getNavItemByPath,
  getSectionByPath,
  type BreadcrumbMeta,
} from '@/config/adminNavConfig';

interface BreadcrumbsProps {
  className?: string;
}

const STATIC_BREADCRUMBS: Record<string, BreadcrumbMeta[]> = {
  '/quiz-lobby': [{ label: 'Quizzes' }],
  '/game-lobby': [{ label: 'Games' }],
  '/leaderboard': [{ label: 'Leaderboard' }],
  '/quiz-leaderboard': [{ label: 'Quiz Leaderboard' }],
  '/student-dashboard': [{ label: 'Student Dashboard' }],
  '/teacher-dashboard': [{ label: 'Teacher Dashboard' }],
  '/teacher': [{ label: 'Teacher Dashboard' }],
  '/org-admin-dashboard': [{ label: 'Organization Admin' }],
  '/org-admin': [{ label: 'Organization Admin' }],
  '/notifications': [{ label: 'Notifications' }],
  '/game-history': [{ label: 'Account' }, { label: 'Game History' }],
  '/certificates': [{ label: 'Account' }, { label: 'Certificates' }],
  '/invoices': [{ label: 'Account' }, { label: 'Invoices' }],
  '/credits': [{ label: 'Account' }, { label: 'Credits' }],
  '/admin': [{ label: 'Admin Dashboard' }],
  '/admin/collections': [
    { label: 'Admin', path: '/admin' },
    { label: 'Collections' },
  ],
  '/admin/cards': [
    { label: 'Admin', path: '/admin' },
    { label: 'Cards' },
  ],
  '/admin/quiz-questions': [
    { label: 'Learning Operations' },
    { label: 'Quiz Questions' },
  ],
  '/grades-manager': [
    { label: 'Learning Operations' },
    { label: 'Grades Manager' },
  ],
  '/quiz-wizard': [
    { label: 'Learning Operations' },
    { label: 'Quiz Wizard' },
  ],
  '/lessons/new': [
    { label: 'Learning Operations' },
    { label: 'Course Builder', path: '/course-builder' },
    { label: 'New Lesson' },
  ],
  '/course-builder/new': [
    { label: 'Learning Operations' },
    { label: 'Course Builder', path: '/course-builder' },
    { label: 'New Course' },
  ],
};

function getBreadcrumbsFromConfig(pathname: string): BreadcrumbMeta[] {
  const item = getNavItemByPath(pathname);
  if (!item) return [];

  const section = getSectionByPath(pathname);
  const breadcrumbs: BreadcrumbMeta[] = [];

  if (section) {
    const firstItemInSection = section.groups[0]?.items[0];
    breadcrumbs.push({
      label: section.label,
      path: firstItemInSection?.path !== pathname ? firstItemInSection?.path : undefined,
      section: section.id,
    });
  }

  breadcrumbs.push({
    label: item.breadcrumbLabel || item.label,
  });

  return breadcrumbs;
}

function getBreadcrumbsForPath(pathname: string): BreadcrumbMeta[] {
  if (STATIC_BREADCRUMBS[pathname]) {
    return STATIC_BREADCRUMBS[pathname];
  }

  const configBreadcrumbs = getBreadcrumbsFromConfig(pathname);
  if (configBreadcrumbs.length > 0) {
    return configBreadcrumbs;
  }

  if (pathname.startsWith('/quiz-single/')) {
    return [
      { label: 'Quizzes', path: '/quiz-lobby' },
      { label: 'Single Player' },
    ];
  }
  if (pathname.startsWith('/quiz-1v1/')) {
    return [
      { label: 'Quizzes', path: '/quiz-lobby' },
      { label: '1v1 Battle' },
    ];
  }
  if (pathname.startsWith('/quiz-wizard/')) {
    return [
      { label: 'Learning Operations' },
      { label: 'Quiz Drafts', path: '/quiz-drafts' },
      { label: 'Edit Quiz' },
    ];
  }
  if (pathname.startsWith('/lessons/')) {
    return [
      { label: 'Learning Operations' },
      { label: 'Course Builder', path: '/course-builder' },
      { label: 'View Lesson' },
    ];
  }
  if (pathname.startsWith('/courses/')) {
    if (pathname.includes('/purchase-success')) {
      return [
        { label: 'Learning Operations' },
        { label: 'Browse Courses', path: '/browse-courses' },
        { label: 'Purchase Success' },
      ];
    }
    if (pathname.includes('/purchase')) {
      return [
        { label: 'Learning Operations' },
        { label: 'Browse Courses', path: '/browse-courses' },
        { label: 'Purchase' },
      ];
    }
    if (pathname.includes('/rate')) {
      return [
        { label: 'Account' },
        { label: 'My Courses', path: '/my-courses' },
        { label: 'Rate Course' },
      ];
    }
    return [
      { label: 'Learning Operations' },
      { label: 'Browse Courses', path: '/browse-courses' },
      { label: 'Course Details' },
    ];
  }
  if (pathname.match(/^\/course-builder\/\d+\/edit$/)) {
    return [
      { label: 'Learning Operations' },
      { label: 'Course Builder', path: '/course-builder' },
      { label: 'Edit Course' },
    ];
  }
  if (pathname.match(/^\/course-builder\/\d+\/lessons$/)) {
    return [
      { label: 'Learning Operations' },
      { label: 'Course Builder', path: '/course-builder' },
      { label: 'Course Lessons' },
    ];
  }
  if (pathname.match(/^\/course-builder\/\d+\/upload\/\d+$/)) {
    return [
      { label: 'Learning Operations' },
      { label: 'Course Builder', path: '/course-builder' },
      { label: 'Upload Content' },
    ];
  }
  if (pathname.startsWith('/game-room/') || pathname.startsWith('/game/')) {
    return [
      { label: 'Games', path: '/game-lobby' },
      { label: 'Game Room' },
    ];
  }
  if (pathname.startsWith('/play/')) {
    return [
      { label: 'Games', path: '/game-lobby' },
      { label: 'Playing' },
    ];
  }
  if (pathname.startsWith('/single-player/')) {
    return [
      { label: 'Games', path: '/game-lobby' },
      { label: 'Single Player' },
    ];
  }
  if (pathname.startsWith('/multiplayer-1v1/')) {
    return [
      { label: 'Games', path: '/game-lobby' },
      { label: '1v1 Battle' },
    ];
  }

  return [];
}

export function Breadcrumbs({ className }: BreadcrumbsProps) {
  const [location] = useLocation();
  const breadcrumbs = getBreadcrumbsForPath(location);

  if (breadcrumbs.length === 0 || location === '/') {
    return null;
  }

  const allItems: BreadcrumbMeta[] = [
    { label: 'Home', path: '/' },
    ...breadcrumbs,
  ];

  const maxVisibleItems = 3;
  const shouldCollapse = allItems.length > maxVisibleItems;
  
  const getVisibleItems = () => {
    if (!shouldCollapse) {
      return { start: allItems, middle: [], end: [] };
    }
    
    return {
      start: [allItems[0]],
      middle: allItems.slice(1, -1),
      end: [allItems[allItems.length - 1]],
    };
  };

  const { start, middle, end } = getVisibleItems();

  return (
    <Breadcrumb className={cn('mb-4', className)}>
      <BreadcrumbList>
        {start.map((item, index) => (
          <BreadcrumbItem key={`start-${index}`}>
            {item.path ? (
              <BreadcrumbLink asChild>
                <Link
                  href={item.path}
                  className="text-muted-foreground/70 hover:text-primary transition-colors flex items-center gap-1.5"
                  data-testid={`breadcrumb-link-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  {item.path === '/' && <Home className="w-3.5 h-3.5" />}
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              </BreadcrumbLink>
            ) : (
              <BreadcrumbPage className="text-foreground font-medium truncate max-w-[120px] sm:max-w-[200px]">
                {item.label}
              </BreadcrumbPage>
            )}
          </BreadcrumbItem>
        ))}

        {shouldCollapse && middle.length > 0 && (
          <>
            <BreadcrumbSeparator className="text-muted-foreground/50" />
            <BreadcrumbItem className="sm:hidden">
              <BreadcrumbEllipsis className="h-6 w-6 text-muted-foreground/50" />
            </BreadcrumbItem>
            {middle.map((item, index) => (
              <BreadcrumbItem key={`middle-${index}`} className="hidden sm:inline-flex">
                {index > 0 && <BreadcrumbSeparator className="text-muted-foreground/50 mr-1.5" />}
                {item.path ? (
                  <BreadcrumbLink asChild>
                    <Link
                      href={item.path}
                      className="text-muted-foreground/70 hover:text-primary transition-colors"
                      data-testid={`breadcrumb-link-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      {item.label}
                    </Link>
                  </BreadcrumbLink>
                ) : (
                  <span className="text-muted-foreground/70">{item.label}</span>
                )}
              </BreadcrumbItem>
            ))}
          </>
        )}

        {!shouldCollapse &&
          allItems.slice(1).map((item, index) => (
            <span key={`all-${index}`} className="contents">
              <BreadcrumbSeparator className="text-muted-foreground/50" />
              <BreadcrumbItem>
                {item.path ? (
                  <BreadcrumbLink asChild>
                    <Link
                      href={item.path}
                      className="text-muted-foreground/70 hover:text-primary transition-colors"
                      data-testid={`breadcrumb-link-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      {item.label}
                    </Link>
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage
                    className="text-foreground font-medium truncate max-w-[120px] sm:max-w-[200px]"
                    data-testid={`breadcrumb-page-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    {item.label}
                  </BreadcrumbPage>
                )}
              </BreadcrumbItem>
            </span>
          ))}

        {shouldCollapse && end.length > 0 && (
          <>
            <BreadcrumbSeparator className="text-muted-foreground/50" />
            {end.map((item, index) => (
              <BreadcrumbItem key={`end-${index}`}>
                <BreadcrumbPage
                  className="text-foreground font-medium truncate max-w-[120px] sm:max-w-[200px]"
                  data-testid={`breadcrumb-page-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  {item.label}
                </BreadcrumbPage>
              </BreadcrumbItem>
            ))}
          </>
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

export default Breadcrumbs;
