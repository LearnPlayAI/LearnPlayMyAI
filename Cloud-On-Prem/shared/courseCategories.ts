export interface CourseCategory {
  slug: string;
  label: string;
  group?: string;
}

export const COURSE_CATEGORIES: CourseCategory[] = [
  { slug: 'programming', label: 'Programming & Development', group: 'Technology' },
  { slug: 'web-development', label: 'Web Development', group: 'Technology' },
  { slug: 'mobile-development', label: 'Mobile Development', group: 'Technology' },
  { slug: 'data-science', label: 'Data Science & Analytics', group: 'Technology' },
  { slug: 'ai-machine-learning', label: 'AI & Machine Learning', group: 'Technology' },
  { slug: 'cybersecurity', label: 'Cybersecurity', group: 'Technology' },
  { slug: 'cloud-computing', label: 'Cloud Computing & DevOps', group: 'Technology' },
  { slug: 'game-development', label: 'Game Development', group: 'Technology' },
  
  { slug: 'business', label: 'Business & Management', group: 'Business' },
  { slug: 'entrepreneurship', label: 'Entrepreneurship', group: 'Business' },
  { slug: 'marketing', label: 'Marketing & Sales', group: 'Business' },
  { slug: 'finance', label: 'Finance & Accounting', group: 'Business' },
  { slug: 'project-management', label: 'Project Management', group: 'Business' },
  { slug: 'leadership', label: 'Leadership & Strategy', group: 'Business' },
  
  { slug: 'design', label: 'Graphic Design', group: 'Creative' },
  { slug: 'ui-ux', label: 'UI/UX Design', group: 'Creative' },
  { slug: 'video-production', label: 'Video Production & Editing', group: 'Creative' },
  { slug: 'photography', label: 'Photography', group: 'Creative' },
  { slug: 'music', label: 'Music & Audio Production', group: 'Creative' },
  { slug: 'creative-writing', label: 'Creative Writing', group: 'Creative' },
  
  { slug: 'science', label: 'Science & Engineering', group: 'Science' },
  { slug: 'mathematics', label: 'Mathematics & Statistics', group: 'Science' },
  { slug: 'physics', label: 'Physics', group: 'Science' },
  { slug: 'chemistry', label: 'Chemistry', group: 'Science' },
  { slug: 'biology', label: 'Biology & Life Sciences', group: 'Science' },
  
  { slug: 'health', label: 'Health & Wellness', group: 'Health' },
  { slug: 'fitness', label: 'Fitness & Exercise', group: 'Health' },
  { slug: 'nutrition', label: 'Nutrition & Diet', group: 'Health' },
  { slug: 'mental-health', label: 'Mental Health & Mindfulness', group: 'Health' },
  { slug: 'medical', label: 'Medical & Healthcare', group: 'Health' },
  
  { slug: 'language', label: 'Language Learning', group: 'Languages' },
  { slug: 'english', label: 'English Language', group: 'Languages' },
  { slug: 'spanish', label: 'Spanish Language', group: 'Languages' },
  { slug: 'mandarin', label: 'Mandarin Chinese', group: 'Languages' },
  { slug: 'french', label: 'French Language', group: 'Languages' },
  
  { slug: 'personal-development', label: 'Personal Development', group: 'Personal' },
  { slug: 'productivity', label: 'Productivity & Time Management', group: 'Personal' },
  { slug: 'communication', label: 'Communication Skills', group: 'Personal' },
  { slug: 'career-development', label: 'Career Development', group: 'Personal' },
  
  { slug: 'lifestyle', label: 'Lifestyle & Hobbies', group: 'Lifestyle' },
  { slug: 'cooking', label: 'Cooking & Culinary Arts', group: 'Lifestyle' },
  { slug: 'gardening', label: 'Gardening & Agriculture', group: 'Lifestyle' },
  { slug: 'travel', label: 'Travel & Tourism', group: 'Lifestyle' },
  
  { slug: 'test-prep', label: 'Test Preparation', group: 'Education' },
  { slug: 'academic', label: 'Academic Skills & Study Methods', group: 'Education' },
  { slug: 'certifications', label: 'Professional Certifications', group: 'Education' },
  
  { slug: 'kids-teens', label: 'Kids & Teens Education', group: 'Family' },
  { slug: 'parenting', label: 'Parenting & Family', group: 'Family' },
  
  { slug: 'other', label: 'Other', group: 'Other' },
];

export const COURSE_CATEGORY_SLUGS = COURSE_CATEGORIES.map(c => c.slug);

export function getCategoryLabel(slug: string | null | undefined): string {
  if (!slug) return 'Uncategorized';
  const category = COURSE_CATEGORIES.find(c => c.slug === slug);
  return category?.label || slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

export function isValidCategorySlug(slug: string): boolean {
  return COURSE_CATEGORY_SLUGS.includes(slug);
}
