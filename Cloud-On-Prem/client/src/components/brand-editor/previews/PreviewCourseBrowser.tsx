import { PreviewFrame, ClickableElement } from '../PreviewFrame';
import { Search, Star, TrendingUp, BookOpen, Filter, Grid, List, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';

export function PreviewCourseBrowser() {
  const courses = [
    { 
      title: 'Python for Beginners', 
      description: 'Learn Python from scratch with hands-on projects',
      category: 'Programming', 
      difficulty: 'Beginner',
      price: 49.99, 
      originalPrice: 79.99,
      rating: 4.8, 
      reviews: 234,
      students: 2340,
      instructor: 'Dr. Sarah Chen',
      isEnrolled: true,
      progress: 65,
      hasDiscount: true
    },
    { 
      title: 'Data Science Masterclass', 
      description: 'Master data analysis, visualization, and machine learning',
      category: 'Data Science', 
      difficulty: 'Intermediate',
      price: 79.99, 
      rating: 4.9, 
      reviews: 186,
      students: 1856,
      instructor: 'Prof. Michael Brown',
      isEnrolled: false,
      progress: 0,
      hasDiscount: false
    },
    { 
      title: 'Web Development Bootcamp', 
      description: 'Full-stack web development with modern technologies',
      category: 'Web Development', 
      difficulty: 'Beginner',
      price: 99.99, 
      rating: 4.7, 
      reviews: 342,
      students: 3421,
      instructor: 'Jessica Williams',
      isEnrolled: true,
      progress: 100,
      hasDiscount: false
    },
    { 
      title: 'Machine Learning A-Z', 
      description: 'Complete guide to ML algorithms and implementation',
      category: 'AI & ML', 
      difficulty: 'Advanced',
      price: 89.99, 
      rating: 4.6, 
      reviews: 123,
      students: 1234,
      instructor: 'Dr. James Lee',
      isEnrolled: false,
      progress: 0,
      hasDiscount: false
    },
    { 
      title: 'JavaScript Essentials', 
      description: 'Core JavaScript concepts for modern web development',
      category: 'Programming', 
      difficulty: 'Beginner',
      price: 0, 
      rating: 4.5, 
      reviews: 456,
      students: 4567,
      instructor: 'Emily Davis',
      isEnrolled: false,
      progress: 0,
      hasDiscount: false
    },
    { 
      title: 'React & Node.js', 
      description: 'Build full-stack apps with React and Node.js',
      category: 'Web Development', 
      difficulty: 'Intermediate',
      price: 69.99, 
      originalPrice: 99.99,
      rating: 4.8, 
      reviews: 289,
      students: 2890,
      instructor: 'Alex Johnson',
      isEnrolled: true,
      progress: 32,
      hasDiscount: true
    },
  ];

  const categories = ['All', 'Programming', 'Data Science', 'Web Development', 'AI & ML', 'Business'];
  const difficulties = ['All Levels', 'Beginner', 'Intermediate', 'Advanced'];
  const priceFilters = ['All Prices', 'Free', 'Paid'];

  return (
    <PreviewFrame className="min-h-[900px]" data-testid="preview-courses">
      <div className="p-6 space-y-6" style={{ backgroundColor: 'var(--surface-primary)' }}>
        
        {/* Page Header */}
        <div className="space-y-2" data-testid="preview-courses-header">
          <ClickableElement 
            editKey="--foreground" 
            as="h1" 
            className="text-2xl font-bold" 
            style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}
            data-testid="preview-courses-title"
            aria-label="Edit page title color"
          >
            Browse Courses
          </ClickableElement>
          <ClickableElement 
            editKey="--muted-foreground"
            as="p"
            className="text-sm"
            style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}
            data-testid="preview-courses-subtitle"
            aria-label="Edit subtitle color"
          >
            Discover and enroll in courses from expert instructors worldwide
          </ClickableElement>
        </div>

        {/* Search Bar */}
        <ClickableElement 
          editKey="--search-bg"
          className="flex items-center gap-3 px-4 py-3 rounded-lg border transition-all"
          style={{ 
            backgroundColor: 'var(--search-bg)', 
            borderColor: 'var(--search-border)',
          }}
          data-testid="preview-courses-search"
          aria-label="Edit search input style"
        >
          <Search className="w-5 h-5" style={{ color: 'var(--text-muted)' }} />
          <span className="text-sm flex-1" style={{ color: 'var(--text-muted)' }}>
            Search courses by title or description...
          </span>
        </ClickableElement>

        {/* Filter Pills Section */}
        <div className="space-y-4" data-testid="preview-courses-filters">
          {/* Category Filters */}
          <div className="space-y-2">
            <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Categories</span>
            <div className="flex gap-2 flex-wrap" data-testid="preview-courses-categories">
              {categories.map((cat, i) => (
                <ClickableElement
                  key={cat}
                  editKey={i === 0 ? '--filter-pill-active-bg' : '--filter-pill-bg'}
                  className="px-4 py-2 rounded-full text-sm font-medium transition-all"
                  style={{ 
                    backgroundColor: i === 0 ? 'var(--filter-pill-active-bg)' : 'var(--filter-pill-bg)',
                    color: i === 0 ? 'var(--filter-pill-active-fg)' : 'var(--filter-pill-fg)'
                  }}
                  data-testid={`preview-courses-category-${cat.toLowerCase().replace(/\s+/g, '-')}`}
                  aria-label={`${i === 0 ? 'Active' : 'Inactive'} filter: ${cat}`}
                >
                  {cat}
                </ClickableElement>
              ))}
            </div>
          </div>

          {/* Difficulty & Price Filters Row */}
          <div className="flex flex-wrap gap-4">
            <div className="space-y-2">
              <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Difficulty</span>
              <div className="flex gap-2 flex-wrap">
                {difficulties.map((diff, i) => (
                  <ClickableElement
                    key={diff}
                    editKey={i === 0 ? '--filter-pill-active-bg' : '--filter-pill-bg'}
                    className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                    style={{ 
                      backgroundColor: i === 0 ? 'var(--filter-pill-active-bg)' : 'var(--filter-pill-bg)',
                      color: i === 0 ? 'var(--filter-pill-active-fg)' : 'var(--filter-pill-fg)'
                    }}
                    data-testid={`preview-courses-difficulty-${diff.toLowerCase().replace(/\s+/g, '-')}`}
                    aria-label={`${i === 0 ? 'Active' : 'Inactive'} difficulty filter: ${diff}`}
                  >
                    {diff}
                  </ClickableElement>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Price</span>
              <div className="flex gap-2 flex-wrap">
                {priceFilters.map((price, i) => (
                  <ClickableElement
                    key={price}
                    editKey={i === 0 ? '--filter-pill-active-bg' : '--filter-pill-bg'}
                    className="px-3 py-1.5 rounded-full text-xs font-medium transition-all"
                    style={{ 
                      backgroundColor: i === 0 ? 'var(--filter-pill-active-bg)' : 'var(--filter-pill-bg)',
                      color: i === 0 ? 'var(--filter-pill-active-fg)' : 'var(--filter-pill-fg)'
                    }}
                    data-testid={`preview-courses-price-${price.toLowerCase().replace(/\s+/g, '-')}`}
                    aria-label={`${i === 0 ? 'Active' : 'Inactive'} price filter: ${price}`}
                  >
                    {price}
                  </ClickableElement>
                ))}
              </div>
            </div>
          </div>

          {/* View Toggle & Clear Filters */}
          <div className="flex items-center justify-between pt-2">
            <div className="flex gap-2">
              <ClickableElement
                editKey="--filter-pill-active-bg"
                className="p-2 rounded-lg"
                style={{ 
                  backgroundColor: 'var(--filter-pill-active-bg)',
                  color: 'var(--filter-pill-active-fg)'
                }}
                data-testid="preview-courses-view-grid"
                aria-label="Grid view (active)"
              >
                <Grid className="w-4 h-4" />
              </ClickableElement>
              <ClickableElement
                editKey="--filter-pill-bg"
                className="p-2 rounded-lg"
                style={{ 
                  backgroundColor: 'var(--filter-pill-bg)',
                  color: 'var(--filter-pill-fg)'
                }}
                data-testid="preview-courses-view-list"
                aria-label="List view"
              >
                <List className="w-4 h-4" />
              </ClickableElement>
            </div>
            <ClickableElement
              editKey="--btn-ghost-bg"
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border"
              style={{ 
                backgroundColor: 'var(--btn-ghost-bg)',
                color: 'var(--text-primary)',
                borderColor: 'var(--stroke-default)'
              }}
              data-testid="preview-courses-clear-filters"
              aria-label="Clear filters button"
            >
              <Filter className="w-4 h-4" />
              Clear Filters
            </ClickableElement>
          </div>
        </div>

        {/* Course Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="preview-courses-grid">
          {courses.map((course, i) => (
            <ClickableElement
              key={i}
              editKey="--course-card-bg"
              className="rounded-xl overflow-hidden group flex flex-col"
              style={{ 
                backgroundColor: 'var(--course-card-bg)', 
                border: '1px solid var(--course-card-border)' 
              }}
              data-testid={`preview-courses-card-${i}`}
              aria-label={`Edit ${course.title} course card style`}
            >
              {/* Course Image */}
              <div 
                className="h-36 flex items-center justify-center relative"
                style={{ backgroundColor: 'var(--surface-muted)' }}
                data-testid={`preview-courses-card-image-${i}`}
              >
                <BookOpen className="w-10 h-10" style={{ color: 'var(--text-muted)' }} />
                
                {/* Discount Badge */}
                {course.hasDiscount && (
                  <ClickableElement 
                    editKey="--destructive"
                    className="absolute top-2 left-2 px-2 py-1 rounded text-xs font-bold"
                    style={{ 
                      backgroundColor: 'var(--destructive)', 
                      color: 'var(--destructive-foreground)' 
                    }}
                    data-testid={`preview-courses-card-discount-${i}`}
                    aria-label="Discount badge"
                  >
                    SALE
                  </ClickableElement>
                )}
                
                {/* Difficulty Badge */}
                <ClickableElement 
                  editKey="--course-card-badge-bg"
                  className="absolute top-2 right-2 px-2 py-1 rounded text-xs font-medium"
                  style={{ 
                    backgroundColor: 'var(--course-card-badge-bg)', 
                    color: 'var(--course-card-badge-fg)' 
                  }}
                  data-testid={`preview-courses-card-difficulty-${i}`}
                  aria-label={`Difficulty: ${course.difficulty}`}
                >
                  {course.difficulty}
                </ClickableElement>
              </div>

              {/* Course Content */}
              <div className="p-4 space-y-3 flex-1 flex flex-col">
                {/* Category Tag */}
                <ClickableElement 
                  editKey="--accent"
                  className="self-start px-2 py-0.5 rounded text-xs font-medium"
                  style={{ 
                    backgroundColor: 'var(--action-accent)', 
                    color: 'var(--action-accent-fg)' 
                  }}
                  data-testid={`preview-courses-card-category-${i}`}
                  aria-label={`Category: ${course.category}`}
                >
                  {course.category}
                </ClickableElement>

                {/* Title & Description */}
                <div className="space-y-1">
                  <h3 className="font-semibold line-clamp-2" style={{ color: 'var(--course-card-fg)', fontFamily: 'var(--font-heading)' }} data-testid={`preview-courses-card-title-${i}`}>
                    {course.title}
                  </h3>
                  <p className="text-xs line-clamp-2" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }} data-testid={`preview-courses-card-description-${i}`}>
                    {course.description}
                  </p>
                </div>

                {/* Instructor */}
                <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }} data-testid={`preview-courses-card-instructor-${i}`}>
                  <div 
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold"
                    style={{ backgroundColor: 'var(--action-primary)', color: 'var(--action-primary-fg)' }}
                  >
                    {course.instructor.charAt(0)}
                  </div>
                  <span>{course.instructor}</span>
                </div>

                {/* Rating & Students */}
                <div className="flex items-center gap-4 text-sm" data-testid={`preview-courses-card-meta-${i}`}>
                  <ClickableElement
                    editKey="--accent"
                    className="flex items-center gap-1"
                    data-testid={`preview-courses-card-rating-${i}`}
                    aria-label="Course rating"
                  >
                    <Star className="w-4 h-4 fill-current" style={{ color: 'var(--action-accent)' }} />
                    <span style={{ color: 'var(--text-primary)' }}>{course.rating}</span>
                    <span style={{ color: 'var(--text-muted)' }}>({course.reviews})</span>
                  </ClickableElement>
                  <span className="flex items-center gap-1" style={{ color: 'var(--text-muted)' }} data-testid={`preview-courses-card-students-${i}`}>
                    <TrendingUp className="w-4 h-4" />
                    {course.students.toLocaleString()} students
                  </span>
                </div>

                {/* Progress Bar (for enrolled courses) */}
                {course.isEnrolled && (
                  <div className="space-y-1" data-testid={`preview-courses-card-progress-${i}`}>
                    <div className="flex justify-between text-xs">
                      <span style={{ color: 'var(--text-muted)' }}>Progress</span>
                      <span style={{ color: course.progress === 100 ? 'var(--success)' : 'var(--action-primary)' }}>
                        {course.progress}%
                      </span>
                    </div>
                    <ClickableElement
                      editKey="--progress-bar-bg"
                      className="h-2 rounded-full overflow-hidden"
                      style={{ backgroundColor: 'var(--progress-bar-bg)' }}
                      data-testid={`preview-courses-card-progress-bar-${i}`}
                      aria-label="Edit progress bar style"
                    >
                      <div 
                        className="h-full rounded-full transition-all"
                        style={{ 
                          width: `${course.progress}%`,
                          backgroundColor: course.progress === 100 ? 'var(--success)' : 'var(--progress-bar-fill)'
                        }}
                      />
                    </ClickableElement>
                  </div>
                )}

                {/* Price & Action */}
                <div className="flex items-center justify-between pt-2 mt-auto border-t" style={{ borderColor: 'var(--stroke-default)' }}>
                  <div className="flex items-baseline gap-2">
                    {course.price === 0 ? (
                      <ClickableElement 
                        editKey="--success"
                        className="text-lg font-bold"
                        style={{ color: 'var(--success)' }}
                        data-testid={`preview-courses-card-price-${i}`}
                        aria-label="Free course"
                      >
                        FREE
                      </ClickableElement>
                    ) : (
                      <>
                        <ClickableElement 
                          editKey="--primary"
                          className="text-lg font-bold"
                          style={{ color: 'var(--action-primary)' }}
                          data-testid={`preview-courses-card-price-${i}`}
                          aria-label="Course price"
                        >
                          ${course.price}
                        </ClickableElement>
                        {course.hasDiscount && course.originalPrice && (
                          <span className="text-sm line-through" style={{ color: 'var(--text-muted)' }}>
                            ${course.originalPrice}
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  
                  {course.isEnrolled ? (
                    <ClickableElement 
                      editKey={course.progress === 100 ? '--success' : '--btn-secondary-bg'}
                      className="px-4 py-2 rounded-lg text-sm font-medium"
                      style={{ 
                        backgroundColor: course.progress === 100 ? 'var(--success)' : 'var(--btn-secondary-bg)', 
                        color: course.progress === 100 ? 'var(--success-foreground)' : 'var(--btn-secondary-fg)' 
                      }}
                      data-testid={`preview-courses-continue-button-${i}`}
                      aria-label={course.progress === 100 ? 'Completed' : 'Continue learning'}
                    >
                      {course.progress === 100 ? 'Completed' : 'Continue'}
                    </ClickableElement>
                  ) : (
                    <ClickableElement 
                      editKey="--btn-primary-bg"
                      className="px-4 py-2 rounded-lg text-sm font-medium"
                      style={{ 
                        backgroundColor: 'var(--btn-primary-bg)', 
                        color: 'var(--btn-primary-fg)' 
                      }}
                      data-testid={`preview-courses-enroll-button-${i}`}
                      aria-label={course.price === 0 ? 'Enroll free' : 'Purchase course'}
                    >
                      {course.price === 0 ? 'Enroll Free' : 'View Course'}
                    </ClickableElement>
                  )}
                </div>
              </div>
            </ClickableElement>
          ))}
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-center gap-2 pt-6" data-testid="preview-courses-pagination">
          <ClickableElement
            editKey="--pagination-disabled-bg"
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ 
              backgroundColor: 'var(--pagination-disabled-bg)',
              color: 'var(--pagination-disabled-fg)'
            }}
            data-testid="preview-courses-page-prev"
            aria-label="Previous page (disabled)"
          >
            <ChevronLeft className="w-5 h-5" />
          </ClickableElement>
          
          {[1, 2, 3, 4, 5].map((page) => (
            <ClickableElement
              key={page}
              editKey={page === 1 ? '--pagination-active-bg' : '--pagination-bg'}
              className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-medium transition-all"
              style={{ 
                backgroundColor: page === 1 ? 'var(--pagination-active-bg)' : 'var(--pagination-bg)',
                color: page === 1 ? 'var(--pagination-active-fg)' : 'var(--pagination-fg)'
              }}
              data-testid={`preview-courses-page-${page}`}
              aria-label={`Go to page ${page}${page === 1 ? ' (current)' : ''}`}
            >
              {page}
            </ClickableElement>
          ))}
          
          <ClickableElement
            editKey="--pagination-bg"
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ 
              backgroundColor: 'var(--pagination-bg)',
              color: 'var(--pagination-fg)'
            }}
            data-testid="preview-courses-page-next"
            aria-label="Next page"
          >
            <ChevronRight className="w-5 h-5" />
          </ClickableElement>
        </div>

        {/* Empty State Preview */}
        <div className="mt-8 pt-6 border-t" style={{ borderColor: 'var(--stroke-default)' }}>
          <p className="text-xs font-medium mb-3" style={{ color: 'var(--text-muted)' }}>Empty State Preview:</p>
          <ClickableElement
            editKey="--card"
            className="rounded-xl p-8 text-center border"
            style={{ 
              backgroundColor: 'var(--surface-raised)', 
              borderColor: 'var(--stroke-default)' 
            }}
            data-testid="preview-courses-empty-state"
            aria-label="Edit empty state style"
          >
            <div 
              className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
              style={{ backgroundColor: 'var(--surface-muted)' }}
            >
              <AlertCircle className="w-8 h-8" style={{ color: 'var(--text-muted)' }} />
            </div>
            <h3 className="text-lg font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-heading)', marginBottom: 'var(--space-sm)' }}>
              No Courses Found
            </h3>
            <p className="text-sm" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', marginBottom: 'var(--space-md)' }}>
              We couldn't find any courses matching your filters. Try adjusting your search criteria.
            </p>
            <ClickableElement
              editKey="--btn-primary-bg"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
              style={{ 
                backgroundColor: 'var(--btn-primary-bg)', 
                color: 'var(--btn-primary-fg)' 
              }}
              data-testid="preview-courses-empty-cta"
              aria-label="Clear filters button in empty state"
            >
              <Filter className="w-4 h-4" />
              Clear All Filters
            </ClickableElement>
          </ClickableElement>
        </div>

      </div>
    </PreviewFrame>
  );
}

export default PreviewCourseBrowser;
