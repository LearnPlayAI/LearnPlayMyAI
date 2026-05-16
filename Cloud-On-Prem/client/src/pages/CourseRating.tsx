import { useMemo, useRef, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useRoute, useLocation, Link } from 'wouter';
import { Star, ArrowLeft, Loader2, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Alert, AlertDescription } from '@/components/ui/alert';

type Course = {
  id: string;
  title: string;
  description: string;
  imageUrl?: string;
  thumbnailSignedUrl?: string;
  thumbnailUrl?: string;
};

export default function CourseRating() {
  const [, params] = useRoute('/courses/:id/rate');
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const courseId = params?.id;

  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [displayName, setDisplayName] = useState<'real_name' | 'gamer_name'>('real_name');
  const starButtonRefs = useRef<Record<number, HTMLButtonElement | null>>({});
  const ratingSteps = useMemo(() => Array.from({ length: 10 }, (_, idx) => (idx + 1) * 0.5), []);

  const moveRatingFocus = (current: number, direction: 'next' | 'prev') => {
    const currentIndex = ratingSteps.findIndex((step) => step === current);
    const fallbackIndex = rating > 0 ? ratingSteps.findIndex((step) => step === rating) : 0;
    const baseIndex = currentIndex >= 0 ? currentIndex : Math.max(0, fallbackIndex);
    const nextIndex =
      direction === 'next'
        ? (baseIndex + 1) % ratingSteps.length
        : (baseIndex - 1 + ratingSteps.length) % ratingSteps.length;
    const nextRating = ratingSteps[nextIndex];
    setRating(nextRating);
    setHoverRating(nextRating);
    starButtonRefs.current[nextRating]?.focus();
  };

  const { data: course, isLoading } = useQuery<Course>({
    queryKey: [`/api/courses/${courseId}`],
    enabled: !!courseId,
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (rating < 4.5 && !comment.trim()) {
        throw new Error('Please provide a comment for ratings below 4.5 stars');
      }

      return await apiRequest(`/api/courses/${courseId}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating: rating.toString(),
          comment: comment.trim() || null,
          displayName,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/courses/${courseId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/courses/${courseId}/reviews`] });
      toast({
        title: 'Review Submitted!',
        description: 'Thank you for your feedback.',
      });
      setLocation(`/courses/${courseId}`);
    },
    onError: (error) => {
      toast({
        title: 'Submission Failed',
        description: (error as Error).message,
        variant: 'destructive',
      });
    },
  });

  const renderStars = () => {
    const stars = [];
    for (const i of ratingSteps) {
      const isFullStar = i % 1 === 0;
      const isSelected = rating >= i;
      const isHovered = hoverRating >= i;

      stars.push(
        <button
          key={i}
          type="button"
          onClick={() => setRating(i)}
          onMouseEnter={() => setHoverRating(i)}
          onMouseLeave={() => setHoverRating(0)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
              e.preventDefault();
              moveRatingFocus(i, 'next');
              return;
            }
            if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
              e.preventDefault();
              moveRatingFocus(i, 'prev');
              return;
            }
            if (e.key === 'Home') {
              e.preventDefault();
              const first = ratingSteps[0];
              setRating(first);
              setHoverRating(first);
              starButtonRefs.current[first]?.focus();
              return;
            }
            if (e.key === 'End') {
              e.preventDefault();
              const last = ratingSteps[ratingSteps.length - 1];
              setRating(last);
              setHoverRating(last);
              starButtonRefs.current[last]?.focus();
            }
          }}
          ref={(el) => {
            starButtonRefs.current[i] = el;
          }}
          aria-label={`Rate ${i.toFixed(1)} out of 5 stars`}
          role="radio"
          aria-checked={rating === i}
          tabIndex={rating === i || (rating === 0 && i === ratingSteps[0]) ? 0 : -1}
          className="relative rounded-sm transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          data-testid={`star-${i}`}
        >
          {isFullStar ? (
            <Star
              className={`h-12 w-12 transition-colors ${
                isSelected || isHovered
                  ? 'fill-warning text-warning'
                  : 'text-muted-foreground/50'
              }`}
            />
          ) : (
            <div className="relative h-12 w-12">
              <Star
                className={`absolute h-12 w-12 transition-colors ${
                  isHovered ? 'text-warning' : 'text-muted-foreground/50'
                }`}
              />
              <Star
                className={`absolute h-12 w-12 transition-colors ${
                  isSelected || isHovered ? 'fill-warning text-warning' : 'text-transparent'
                }`}
                style={{ clipPath: 'inset(0 50% 0 0)' }}
              />
            </div>
          )}
        </button>
      );
    }
    return stars;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!course) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Course Not Found</h1>
          <Link href="/my-courses">
            <Button>My Courses</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Link href={`/courses/${course.id}`}>
          <Button variant="ghost" className="mb-6" data-testid="button-back">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Course
          </Button>
        </Link>

        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2 text-foreground" data-testid="page-title">
            Rate This Course
          </h1>
          <p className="text-muted-foreground" data-testid="page-description">
            Share your experience to help other learners
          </p>
        </div>

        <Card className="bg-card border-border">
          <CardHeader>
            <div className="flex gap-4 items-start">
              {(course.thumbnailSignedUrl || course.thumbnailUrl || course.imageUrl) ? (
                <img
                  src={course.thumbnailSignedUrl || course.thumbnailUrl || course.imageUrl}
                  alt={course.title}
                  className="w-24 h-24 rounded-lg object-cover"
                  data-testid="course-image"
                />
              ) : (
                <div className="w-24 h-24 bg-muted rounded-lg flex items-center justify-center">
                  <CheckCircle className="h-12 w-12 text-primary/40" />
                </div>
              )}
              <div className="flex-1">
                <CardTitle className="text-foreground" data-testid="course-title">{course.title}</CardTitle>
                <CardDescription className="mt-2 text-muted-foreground">{course.description}</CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="space-y-3">
              <Label className="text-lg font-semibold text-foreground">Your Rating *</Label>
              <div
                className="flex items-center gap-2 justify-center py-4"
                role="radiogroup"
                aria-label="Course rating"
                data-testid="star-rating-selector"
              >
                {renderStars()}
              </div>
              {rating > 0 && (
                <p className="text-center text-sm text-muted-foreground" aria-live="polite" data-testid="rating-value">
                  {rating.toFixed(1)} out of 5 stars
                </p>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="comment" className="text-lg font-semibold text-foreground">
                  Your Review {rating < 4.5 && rating > 0 && <span className="text-destructive">*</span>}
                </Label>
                <span className="text-sm text-muted-foreground">
                  {comment.length}/500
                </span>
              </div>
              <Textarea
                id="comment"
                placeholder="Share your thoughts about this course..."
                value={comment}
                onChange={(e) => setComment(e.target.value.slice(0, 500))}
                rows={6}
                data-testid="input-comment"
              />
              {rating < 4.5 && rating > 0 && (
                <p className="text-sm text-muted-foreground">
                  * Comment required for ratings below 4.5 stars
                </p>
              )}
            </div>

            <div className="space-y-3">
              <Label className="text-lg font-semibold text-foreground">Display Name</Label>
              <RadioGroup
                value={displayName}
                onValueChange={(value: 'real_name' | 'gamer_name') => setDisplayName(value)}
                data-testid="display-name-selector"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="real_name" id="real_name" data-testid="radio-real-name" />
                  <Label htmlFor="real_name" className="font-normal cursor-pointer">
                    Use my real name (username)
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="gamer_name" id="gamer_name" data-testid="radio-gamer-name" />
                  <Label htmlFor="gamer_name" className="font-normal cursor-pointer">
                    Use my gamer name
                  </Label>
                </div>
              </RadioGroup>
            </div>

            {rating > 0 && (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  Your review will be visible to all users after submission. Course ratings help
                  other learners make informed decisions.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>

          <CardFooter className="flex justify-between">
            <Link href={`/courses/${course.id}`}>
              <Button variant="outline" data-testid="button-cancel">
                Cancel
              </Button>
            </Link>
            <Button onClick={() => submitMutation.mutate()}
              disabled={rating === 0 || submitMutation.isPending}
              data-testid="button-submit-review"
            >
              {submitMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit Review'
              )}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
