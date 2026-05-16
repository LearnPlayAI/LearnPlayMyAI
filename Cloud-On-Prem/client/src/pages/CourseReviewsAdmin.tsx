import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import QuizAdminLayout from '@/components/QuizAdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { MessageSquare, Star, ChevronLeft, ChevronRight } from 'lucide-react';

type ReviewRow = {
  id: string;
  rating: string;
  comment: string | null;
  displayName: string;
  reviewerDisplayName?: string | null;
  createdAt: string;
  isHidden?: boolean | null;
  isVisible?: boolean | null;
  course?: {
    id: string;
    title: string;
  } | null;
  user?: {
    username?: string | null;
    gamerName?: string | null;
  } | null;
};

type ReviewsResponse = {
  reviews: ReviewRow[];
  total: number;
};

const PAGE_SIZE = 20;

export default function CourseReviewsAdmin() {
  const [page, setPage] = useState(1);
  const [minRating, setMinRating] = useState<string>('all');
  const [visibility, setVisibility] = useState<string>('all');
  const [search, setSearch] = useState('');

  const offset = (page - 1) * PAGE_SIZE;

  const { data, isLoading } = useQuery<ReviewsResponse>({
    queryKey: ['/api/admin/reviews', {
      limit: PAGE_SIZE,
      offset,
      minRating: minRating === 'all' ? undefined : minRating,
      isHidden: visibility === 'all' ? undefined : visibility === 'hidden' ? 'true' : 'false',
    }],
  });

  const allReviews = data?.reviews ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const filteredReviews = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allReviews;

    return allReviews.filter((review) => {
      const courseTitle = review.course?.title?.toLowerCase() || '';
      const displayName = (review.reviewerDisplayName || review.displayName || '').toLowerCase();
      const username = (review.user?.username || review.user?.gamerName || '').toLowerCase();
      const comment = (review.comment || '').toLowerCase();
      return courseTitle.includes(q) || displayName.includes(q) || username.includes(q) || comment.includes(q);
    });
  }, [allReviews, search]);

  const renderStars = (rating: string) => {
    const score = Math.max(0, Math.min(5, Number(rating) || 0));
    return (
      <div className="flex items-center gap-1">
        <Star className="h-4 w-4 text-warning fill-warning" />
        <span className="font-semibold">{score.toFixed(1)}</span>
      </div>
    );
  };

  return (
    <QuizAdminLayout title="Course Ratings & Reviews" description="View ratings and review feedback for your organization courses">
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Course Ratings & Reviews
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search course, reviewer, or comment..."
              />
              <Select
                value={minRating}
                onValueChange={(value) => {
                  setMinRating(value);
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Minimum rating" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All ratings</SelectItem>
                  <SelectItem value="1">1.0+</SelectItem>
                  <SelectItem value="2">2.0+</SelectItem>
                  <SelectItem value="3">3.0+</SelectItem>
                  <SelectItem value="4">4.0+</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={visibility}
                onValueChange={(value) => {
                  setVisibility(value);
                  setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Visibility" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All visibility</SelectItem>
                  <SelectItem value="visible">Visible</SelectItem>
                  <SelectItem value="hidden">Hidden</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : filteredReviews.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">No ratings or reviews found.</div>
            ) : (
              <div className="space-y-3">
                {filteredReviews.map((review) => {
                  const reviewerName = review.reviewerDisplayName || review.displayName || review.user?.gamerName || review.user?.username || 'Unknown';
                  const isReviewHidden = review.isHidden === true || review.isVisible === false;
                  return (
                    <div key={review.id} className="border rounded-lg p-4 space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{review.course?.title || 'Untitled course'}</p>
                          <p className="text-sm text-muted-foreground truncate">By {reviewerName}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {renderStars(review.rating)}
                          <Badge variant={isReviewHidden ? 'destructive' : 'secondary'}>
                            {isReviewHidden ? 'Hidden' : 'Visible'}
                          </Badge>
                        </div>
                      </div>
                      <p className="text-sm text-foreground/90">{review.comment?.trim() ? review.comment : 'No written comment.'}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(review.createdAt).toLocaleString()}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages} ({total} total reviews)
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Prev
                </Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </QuizAdminLayout>
  );
}
