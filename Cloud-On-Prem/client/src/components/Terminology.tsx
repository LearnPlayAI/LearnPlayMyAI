import { useOrganizationTerminology } from '@/contexts/OrganizationContext';
import type { TerminologyMap } from '@/utils/terminology';

interface TermProps {
  /** The terminology key to display (e.g., 'learner', 'educator', 'unit') */
  term: keyof TerminologyMap;
  /** Optional className for styling */
  className?: string;
  /** Fallback text while loading (defaults to empty string) */
  fallback?: string;
}

/**
 * Term Component
 * 
 * Dynamically renders organization-specific terminology.
 * Automatically handles loading states.
 * 
 * @example
 * <Term term="learner" />  // Renders "Student" or "Learner"
 * <Term term="educator" className="font-bold" />
 * <Term term="unitPlural" fallback="Loading..." />
 */
export function Term({ term, className, fallback = '' }: TermProps) {
  const { terminology, isResolved } = useOrganizationTerminology();
  
  if (!isResolved || !terminology) {
    return <span className={className}>{fallback}</span>;
  }
  
  return <span className={className}>{terminology[term]}</span>;
}

/**
 * Hook for programmatic terminology access
 * 
 * Returns a function that safely retrieves terminology with loading fallback.
 * 
 * @example
 * const getTerm = useTerminologyTerm();
 * const title = `Add ${getTerm('learner')}`;
 * const placeholder = `Select ${getTerm('unit', 'loading...')}`;
 */
export function useTerminologyTerm() {
  const { terminology, isResolved } = useOrganizationTerminology();
  
  return (term: keyof TerminologyMap, fallback: string = '') => {
    if (!isResolved || !terminology) {
      return fallback;
    }
    return terminology[term];
  };
}

/**
 * Hook for lowercase terminology access
 * 
 * Returns a function that safely retrieves lowercase terminology.
 * 
 * @example
 * const getLowerTerm = useTerminologyTermLower();
 * const description = `View all ${getLowerTerm('learnerPlural')} in this ${getLowerTerm('unit')}`;
 */
export function useTerminologyTermLower() {
  const { terminologyLower, isResolved } = useOrganizationTerminology();
  
  return (term: keyof TerminologyMap, fallback: string = '') => {
    if (!isResolved || !terminologyLower) {
      return fallback;
    }
    return terminologyLower[term];
  };
}
