interface CourseWithThumbnail {
  thumbnailSignedUrl?: string;
  thumbnailUrl?: string | null;
  imageUrl?: string | null;
}

const DEFAULT_PLACEHOLDER = '/placeholder-course.svg';

export function getCourseThumbnail(course: CourseWithThumbnail | null | undefined): string {
  if (!course) {
    return DEFAULT_PLACEHOLDER;
  }
  
  return course.thumbnailSignedUrl || course.thumbnailUrl || course.imageUrl || DEFAULT_PLACEHOLDER;
}

export function hasThumbnail(course: CourseWithThumbnail | null | undefined): boolean {
  if (!course) {
    return false;
  }
  
  return !!(course.thumbnailSignedUrl || course.thumbnailUrl || course.imageUrl);
}

export const PLACEHOLDER_THUMBNAIL = DEFAULT_PLACEHOLDER;
