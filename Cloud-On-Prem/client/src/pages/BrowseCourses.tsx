import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Search, Filter, Star, BookOpen, TrendingUp, Calendar, CheckCircle2, Globe, Sparkles } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { PaginatedList } from '@/components/PaginatedList';
import { Skeleton } from '@/components/ui/skeleton';
import { PremiumHeader } from '@/pages/landing';
import { useUser } from '@/hooks/use-user';
import { useAuth } from '@/hooks/useAuth';
import { useCurrencyPreference } from "@/hooks/useCurrencyPreference";
import { getCourseThumbnail, hasThumbnail } from '@/lib/thumbnailResolver';
import { formatCurrency, getCurrencySymbol } from '@/lib/currency';
import { usePlatformMode } from '@/hooks/usePlatformMode';
import { buildCourseHref } from '@/lib/courseLanguageRouting';

type CurrencyCode = 'ZAR' | 'USD' | 'EUR';

const GUEST_CURRENCY_KEY = 'guest_currency_preference';

const CURRENCY_OPTIONS: { value: CurrencyCode; label: string; symbol: string }[] = [
  { value: 'ZAR', label: 'South African Rand', symbol: 'R' },
  { value: 'USD', label: 'US Dollar', symbol: '$' },
  { value: 'EUR', label: 'Euro', symbol: '€' },
];

type Course = {
  id: string;
  title: string;
  description: string;
  category?: string;
  categoryId?: string;
  difficultyLevel: string;
  currency: string;
  price: string;
  isPaid: boolean;
  imageUrl?: string;
  thumbnailUrl?: string;
  thumbnailSignedUrl?: string;
  averageRating: string;
  totalReviews: number;
  totalEnrollments: number;
  organizationId: string;
  organizationName?: string;
  organizationLogoUrl?: string;
  organizationType?: 'education' | 'business' | 'elearning';
  status: string;
  publishedAt?: Date;
  isAssigned?: boolean;
  dueDate?: string;
  completionStatus?: 'not_started' | 'in_progress' | 'completed';
  percentComplete?: number;
  isShowcaseCourse?: boolean;
};

type CategoryItem = {
  id: string;
  name: string;
  type: string;
  group?: string;
};

export default function BrowseCourses() {
  const { user } = useUser();
  const { isAdmin, isSuperAdmin, isAdminLoading: adminLoading } = useAuth();
  const { paymentGatewayEnabled } = usePlatformMode();
  const { 
    formatPrice: authFormatPrice, 
    userCurrency: authUserCurrency, 
    convertToUserCurrency, 
    hasRates,
    rates 
  } = useCurrencyPreference();
  const [currentPage, setCurrentPage] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [difficultyLevel, setDifficultyLevel] = useState<string>('');
  const [completionStatus, setCompletionStatus] = useState<string>('');
  const [guestCurrency, setGuestCurrency] = useState<CurrencyCode | ''>('');
  const [selectedVariantByCourseId, setSelectedVariantByCourseId] = useState<Record<string, string>>({});

  const pageSize = 20;
  const isAuthenticated = !!user;

  useEffect(() => {
    if (!isAuthenticated) {
      const savedCurrency = localStorage.getItem(GUEST_CURRENCY_KEY) as CurrencyCode | null;
      if (savedCurrency && CURRENCY_OPTIONS.some(o => o.value === savedCurrency)) {
        setGuestCurrency(savedCurrency);
      }
    }
  }, [isAuthenticated]);

  const handleGuestCurrencyChange = (value: string) => {
    const currency = value as CurrencyCode;
    setGuestCurrency(currency);
    localStorage.setItem(GUEST_CURRENCY_KEY, currency);
  };

  const selectedCurrency: CurrencyCode = isAuthenticated 
    ? authUserCurrency 
    : (guestCurrency || 'ZAR');

  const getConvertedPrice = (amount: string | number, fromCurrency: CurrencyCode): { 
    formattedPrice: string; 
    isConverted: boolean; 
    originalCurrency: CurrencyCode;
    conversionFailed: boolean;
  } => {
    const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
    
    if (fromCurrency === selectedCurrency) {
      return {
        formattedPrice: formatCurrency({ currency: selectedCurrency, amount: numAmount }),
        isConverted: false,
        originalCurrency: fromCurrency,
        conversionFailed: false,
      };
    }

    if (!hasRates) {
      return {
        formattedPrice: formatCurrency({ currency: fromCurrency, amount: numAmount }),
        isConverted: false,
        originalCurrency: fromCurrency,
        conversionFailed: true,
      };
    }

    const getRateForGuestCurrency = (from: CurrencyCode, to: CurrencyCode): number | null => {
      if (from === to) return 1;
      
      if (from === 'USD') {
        const rate = rates.find(r => r.baseCurrency === 'USD' && r.targetCurrency === to && r.isActive);
        return rate ? parseFloat(rate.rate) : null;
      }
      
      if (to === 'USD') {
        const rate = rates.find(r => r.baseCurrency === 'USD' && r.targetCurrency === from && r.isActive);
        return rate ? 1 / parseFloat(rate.rate) : null;
      }
      
      const fromToUSD = rates.find(r => r.baseCurrency === 'USD' && r.targetCurrency === from && r.isActive);
      const usdToTarget = rates.find(r => r.baseCurrency === 'USD' && r.targetCurrency === to && r.isActive);
      
      if (!fromToUSD || !usdToTarget) return null;
      
      return parseFloat(usdToTarget.rate) / parseFloat(fromToUSD.rate);
    };

    const rate = getRateForGuestCurrency(fromCurrency, selectedCurrency);
    
    if (rate === null) {
      return {
        formattedPrice: formatCurrency({ currency: fromCurrency, amount: numAmount }),
        isConverted: false,
        originalCurrency: fromCurrency,
        conversionFailed: true,
      };
    }

    const convertedAmount = numAmount * rate;
    return {
      formattedPrice: formatCurrency({ currency: selectedCurrency, amount: convertedAmount }),
      isConverted: true,
      originalCurrency: fromCurrency,
      conversionFailed: false,
    };
  };

  const { data: categoriesData } = useQuery<{ categories: CategoryItem[] }>({
    queryKey: ['/api/courses/categories/public'],
  });

  const { data, isLoading } = useQuery({
    queryKey: ['/api/public/courses', { page: currentPage, search: searchQuery, categoryId: categoryFilter, difficultyLevel: difficultyLevel }],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('page', currentPage.toString());
      params.append('limit', pageSize.toString());
      if (searchQuery) params.append('search', searchQuery);
      if (categoryFilter) params.append('categoryId', categoryFilter);
      if (difficultyLevel) params.append('difficultyLevel', difficultyLevel);

      // Use public endpoint - NO AUTH REQUIRED
      // This shows ONLY public courses from the marketplace
      const response = await fetch(`/api/public/courses?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch courses');
      }
      return response.json();
    },
    enabled: true,
    staleTime: 0,
  });

  const rawCourses = (data as { courses: Course[]; total: number })?.courses || [];
  const total = (data as { courses: Course[]; total: number })?.total || 0;
  const categories = categoriesData?.categories || [];

  const courseIds = useMemo(() => {
    return rawCourses.map((c: Course) => c.id);
  }, [rawCourses]);

  const { data: courseLanguages } = useQuery<Record<string, { languages: Array<{ code: string; courseId?: string; isDefault?: boolean }> }>>({
    queryKey: ['/api/courses/batch-languages', courseIds],
    queryFn: async () => {
      if (courseIds.length === 0) return {};
      const res = await fetch('/api/courses/batch-languages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseIds }),
        credentials: 'include',
      });
      if (!res.ok) return {};
      return res.json();
    },
    enabled: courseIds.length > 0,
  });

  // Apply client-side filtering for completion status (only for authenticated users)
  const courses = completionStatus
    ? rawCourses.filter(course => course.completionStatus === completionStatus)
    : rawCourses;

  useEffect(() => {
    if (!courseLanguages || rawCourses.length === 0) return;
    setSelectedVariantByCourseId((prev) => {
      const next = { ...prev };
      for (const course of rawCourses) {
        if (next[course.id]) continue;
        next[course.id] = course.id;
      }
      return next;
    });
  }, [courseLanguages, rawCourses]);

  const getCategoryName = (course: Course): string => {
    if (course.categoryId) {
      const category = categories.find(c => c.id === course.categoryId);
      if (category) return category.name;
    }
    if (course.category) return course.category;
    return 'Uncategorized';
  };

  const handleSearch = (value: string) => {
    setSearchQuery(value);
    setCurrentPage(1);
  };

  const handleFilterChange = () => {
    setCurrentPage(1);
  };

  const getDueDateColor = (dueDate: string) => {
    const now = new Date();
    const due = new Date(dueDate);
    const daysUntilDue = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysUntilDue < 0) return 'text-destructive';
    if (daysUntilDue <= 7) return 'text-warning';
    return 'text-muted-foreground';
  };

  const formatDueDate = (dueDate: string) => {
    return new Date(dueDate).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getCompletionBadgeVariant = (status: string) => {
    switch (status) {
      case 'completed': return 'default';
      case 'in_progress': return 'secondary';
      case 'not_started': return 'outline';
      default: return 'outline';
    }
  };

  const getCompletionLabel = (status: string) => {
    switch (status) {
      case 'completed': return 'Completed';
      case 'in_progress': return 'In Progress';
      case 'not_started': return 'Not Started';
      default: return status;
    }
  };

  const renderCourseCard = (course: Course, index: number) => (
    <Card
      key={course.id}
      className="flex flex-col bg-surface-raised shadow-card hover:shadow-card-hover transition-shadow duration-200 h-full"
      style={{
        backgroundColor: "var(--course-card-bg)",
        color: "var(--course-card-fg)",
        borderColor: "var(--course-card-border)",
      }}
      data-testid={`course-card-${course.id}`}
    >
      {hasThumbnail(course) ? (
        <div className="h-40 sm:h-48 w-full overflow-hidden rounded-t-lg bg-muted relative">
          <img
            src={getCourseThumbnail(course)}
            alt={course.title}
            className="h-full w-full object-cover"
            data-testid={`course-image-${course.id}`}
          />
          {course.isShowcaseCourse && (
            <div className="absolute top-2 right-2">
              <Badge variant="warning" className="border-0 shadow-lg" data-testid={`showcase-badge-${course.id}`} >
                <Sparkles className="h-3 w-3 mr-1" />
                Showcase
              </Badge>
            </div>
          )}
        </div>
      ) : (
        <div className="h-40 sm:h-48 w-full bg-primary/20 dark:from-primary/30 dark:to-primary/10 rounded-t-lg flex items-center justify-center relative">
          <BookOpen className="h-12 w-12 sm:h-16 sm:w-16 text-primary/40" />
          {course.isShowcaseCourse && (
            <div className="absolute top-2 right-2">
              <Badge variant="warning" className="border-0 shadow-lg" data-testid={`showcase-badge-${course.id}`} >
                <Sparkles className="h-3 w-3 mr-1" />
                Showcase
              </Badge>
            </div>
          )}
        </div>
      )}

      <CardHeader className="flex-1 p-[var(--card-padding)]">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
          <CardTitle className="text-lg sm:text-xl line-clamp-2" data-testid={`course-title-${course.id}`}>
            {course.title}
          </CardTitle>
          <Badge variant="secondary" className="w-fit flex-shrink-0" data-testid={`course-difficulty-${course.id}`}>
            {course.difficultyLevel}
          </Badge>
        </div>
        <CardDescription className="line-clamp-3 text-sm" data-testid={`course-description-${course.id}`}>
          {course.description}
        </CardDescription>
        {course.organizationName && (
          <div className="flex items-center gap-2 pt-3" data-testid={`course-org-${course.id}`}>
            {course.organizationLogoUrl ? (
              <img 
                src={course.organizationLogoUrl} 
                alt={`${course.organizationName} logo`}
                className="h-8 w-8 rounded-full object-contain flex-shrink-0 border border-border bg-background p-0.5"
              />
            ) : (
              <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0 border border-border">
                <Globe className="h-4 w-4 text-muted-foreground" />
              </div>
            )}
            <span className="text-sm text-muted-foreground">
              by <span className="font-medium text-foreground">{course.organizationName}</span>
            </span>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs sm:text-sm text-muted-foreground pt-2">
          <div className="flex items-center gap-1">
            <Star className="h-3 w-3 sm:h-4 sm:w-4 fill-[var(--warning)] text-warning" />
            <span data-testid={`course-rating-${course.id}`}>
              {parseFloat(course.averageRating).toFixed(1)} ({course.totalReviews})
            </span>
          </div>
          <div className="flex items-center gap-1">
            <TrendingUp className="h-3 w-3 sm:h-4 sm:w-4" />
            <span data-testid={`course-enrollments-${course.id}`}>{course.totalEnrollments} students</span>
          </div>
        </div>
        {(course.isAssigned && course.dueDate) && (
          <div className={`flex items-center gap-1 text-xs sm:text-sm pt-2 ${getDueDateColor(course.dueDate)}`} data-testid={`course-due-date-${course.id}`}>
            <Calendar className="h-3 w-3 sm:h-4 sm:w-4" />
            <span>Due: {formatDueDate(course.dueDate)}</span>
          </div>
        )}
        {course.completionStatus && (
          <div className="pt-2" data-testid={`course-completion-${course.id}`}>
            <Badge variant={getCompletionBadgeVariant(course.completionStatus) as "default" | "secondary" | "outline" | "destructive"} className="flex items-center gap-1 w-fit" >
              {course.completionStatus === 'completed' && <CheckCircle2 className="h-3 w-3" />}
              {getCompletionLabel(course.completionStatus)}
              {course.percentComplete !== undefined && course.completionStatus !== 'completed' && ` (${course.percentComplete}%)`}
            </Badge>
          </div>
        )}
      </CardHeader>

      <CardFooter className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-[var(--space-md)] pt-4 border-t p-[var(--card-padding)]">
        <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto">
          <Badge variant="outline" className="w-fit" data-testid={`course-category-${course.id}`}>
            {getCategoryName(course)}
          </Badge>
          {(() => {
            const variants = courseLanguages?.[course.id]?.languages || [];
            if (variants.length === 0) return null;
            const selectedVariantId = selectedVariantByCourseId[course.id] || course.id;
            return (
              <div className="space-y-1">
                <div className="flex min-w-0 flex-wrap items-center gap-1">
                  <Globe className="h-3 w-3 text-muted-foreground" />
                  {variants.slice(0, 5).map(lang => (
                    <Badge key={`${course.id}-${lang.courseId || lang.code}`} variant="outline" className="min-h-[36px] px-2 py-1 uppercase touch-manipulation" >
                      {lang.code}
                    </Badge>
                  ))}
                </div>
                <Select
                  value={selectedVariantId}
                  onValueChange={(value) => setSelectedVariantByCourseId((prev) => ({ ...prev, [course.id]: value }))}
                >
                  <SelectTrigger className="min-h-[44px] h-11 w-full text-xs touch-manipulation sm:h-8 sm:min-w-[170px]">
                    <SelectValue placeholder="Select language" />
                  </SelectTrigger>
                  <SelectContent>
                    {variants.map((variant) => (
                      <SelectItem key={`course-variant-${course.id}-${variant.courseId || variant.code}`} value={String(variant.courseId || course.id)}>
                        {String(variant.code || 'en').toUpperCase()}
                        {variant.isDefault ? ' (Source)' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            );
          })()}
          <div className="flex flex-col gap-0.5" data-testid={`course-price-${course.id}`}>
            {paymentGatewayEnabled ? (
              course.isPaid ? (
                (() => {
                  const priceInfo = getConvertedPrice(course.price, course.currency as CurrencyCode);
                  return (
                    <>
                      <span className="text-base sm:text-lg font-bold">
                        {priceInfo.formattedPrice}
                      </span>
                      {priceInfo.isConverted && (
                        <span className="text-xs text-muted-foreground">
                          Converted from {priceInfo.originalCurrency}
                        </span>
                      )}
                      {priceInfo.conversionFailed && priceInfo.originalCurrency !== selectedCurrency && (
                        <span className="text-xs text-muted-foreground italic">
                          (Rate unavailable)
                        </span>
                      )}
                    </>
                  );
                })()
              ) : (
                <span className="text-base sm:text-lg font-bold text-success">FREE</span>
              )
            ) : (
              course.isPaid ? (
                <Badge variant="secondary" className="text-sm">Included</Badge>
              ) : (
                <span className="text-base sm:text-lg font-bold text-success">FREE</span>
              )
            )}
          </div>
        </div>
        {(() => {
          const variants = courseLanguages?.[course.id]?.languages || [];
          const selectedVariantId = selectedVariantByCourseId[course.id] || course.id;
          const selectedVariant = variants.find((variant) => String(variant.courseId || course.id) === String(selectedVariantId));
          const selectedLanguageCode = String(selectedVariant?.code || 'en').toLowerCase();
          return (
            <Link href={buildCourseHref(String(selectedVariantId), selectedLanguageCode)} className="w-full sm:w-auto sm:self-end">
              <Button variant="default" className="w-full sm:w-auto min-h-[44px] touch-manipulation" data-testid={`button-view-course-${course.id}`} >
                {course.isPaid ? 'View Course' : 'Start Free Course'}
              </Button>
            </Link>
          );
        })()}
      </CardFooter>
    </Card>
  );

  const renderSkeleton = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[var(--card-gap)]">
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i} className="flex flex-col">
          <Skeleton className="h-40 sm:h-48 w-full rounded-t-lg" />
          <CardHeader className="flex-1 p-[var(--card-padding)]">
            <Skeleton className="h-6 w-3/4 mb-2" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </CardHeader>
          <CardFooter className="flex items-center justify-between pt-4 border-t p-[var(--card-padding)]">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-11 w-28" />
          </CardFooter>
        </Card>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-surface-base text-foreground relative overflow-hidden">
      <PremiumHeader isAuthenticated={isAuthenticated} isAdmin={isAdmin} isSuperAdmin={isSuperAdmin} user={user} isAdminLoading={adminLoading} />
      
      <div className="container mx-auto p-[var(--container-padding)] pt-24 sm:pt-32 max-w-7xl relative z-10">
        <div className="mb-6 sm:mb-8">
          <h1 
            className="font-bold mb-2 text-foreground drop-shadow-elevated text-[length:var(--text-3xl)] sm:text-[length:var(--text-4xl)]"
            data-testid="page-title"
          >
            Course Marketplace
          </h1>
          <p 
            className="text-muted-foreground text-[length:var(--text-base)] sm:text-[length:var(--text-lg)]"
            data-testid="page-description"
          >
            Explore our curated collection of public courses from expert creators
          </p>
        </div>

        <div className="mb-6 sm:mb-8 bg-surface-raised shadow-card rounded-lg p-4 space-y-4">
          <div className="flex flex-col sm:flex-row gap-[var(--space-md)]">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                placeholder="Search courses by title or description..."
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-10 min-h-[44px]"
                data-testid="input-search"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-5 gap-[var(--space-sm)]">
            <Select
              value={categoryFilter}
              onValueChange={(value) => {
                setCategoryFilter(value === 'all' ? '' : value);
                handleFilterChange();
              }}
            >
              <SelectTrigger className="min-h-[44px] touch-manipulation" data-testid="select-category">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={difficultyLevel}
              onValueChange={(value) => {
                setDifficultyLevel(value === 'all' ? '' : value);
                handleFilterChange();
              }}
            >
              <SelectTrigger className="min-h-[44px] touch-manipulation" data-testid="select-difficulty">
                <SelectValue placeholder="All Levels" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Levels</SelectItem>
                <SelectItem value="beginner">Beginner</SelectItem>
                <SelectItem value="intermediate">Intermediate</SelectItem>
                <SelectItem value="advanced">Advanced</SelectItem>
                <SelectItem value="expert">Expert</SelectItem>
              </SelectContent>
            </Select>

            {isAuthenticated && (
              <Select
                value={completionStatus}
                onValueChange={(value) => {
                  setCompletionStatus(value === 'all' ? '' : value);
                  handleFilterChange();
                }}
              >
                <SelectTrigger className="min-h-[44px] touch-manipulation" data-testid="select-completion-status">
                  <SelectValue placeholder="All Progress" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Progress</SelectItem>
                  <SelectItem value="not_started">Not Started</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            )}

            {!isAuthenticated && (
              <Select
                value={guestCurrency || 'default'}
                onValueChange={(value) => {
                  if (value === 'default') {
                    setGuestCurrency('');
                    localStorage.removeItem(GUEST_CURRENCY_KEY);
                  } else {
                    handleGuestCurrencyChange(value);
                  }
                }}
              >
                <SelectTrigger className="min-h-[44px] touch-manipulation" data-testid="select-currency">
                  <Globe className="h-4 w-4 mr-2 flex-shrink-0" />
                  <SelectValue placeholder="Currency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Base Currency</SelectItem>
                  {CURRENCY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.symbol} {option.value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Button variant="outline" className="min-h-[44px] touch-manipulation" onClick={() => {
                setSearchQuery('');
                setCategoryFilter('');
                setDifficultyLevel('');
                setCompletionStatus('');
                if (!isAuthenticated) {
                  setGuestCurrency('');
                  localStorage.removeItem(GUEST_CURRENCY_KEY);
                }
                setCurrentPage(1);
              }}
              data-testid="button-clear-filters"
            >
              <Filter className="h-4 w-4 mr-2" />
              Clear
            </Button>
          </div>
        </div>

        <PaginatedList
          items={courses}
          total={total}
          pageSize={pageSize}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          renderItem={renderCourseCard}
          emptyMessage="No courses found. Try adjusting your filters."
          gridClassName="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-[var(--card-gap)]"
          isLoading={isLoading}
          loadingComponent={renderSkeleton()}
        />
      </div>
    </div>
  );
}
