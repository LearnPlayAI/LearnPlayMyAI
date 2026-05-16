import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChevronRight, Home, Lightbulb, Loader2, Zap, AlertCircle, LogIn, Coins } from 'lucide-react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Link } from 'wouter';

interface Term {
  id: string;
  term: string;
  definition: string;
}

interface ExplanationData {
  explanation: string;
  terms: Term[];
}

interface BreadcrumbItem {
  label: string;
  type: 'root' | 'explanation' | 'term';
  termId?: string;
  data?: any;
}

interface ExplanationModalProps {
  isOpen: boolean;
  onClose: () => void;
  cardId: string;
  onNextQuestion: () => void;
  isShowcaseMode?: boolean;
}

export function ExplanationModal({ isOpen, onClose, cardId, onNextQuestion, isShowcaseMode = false }: ExplanationModalProps) {
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([
    { label: 'Answer', type: 'root' }
  ]);
  const [currentView, setCurrentView] = useState<'explanation' | 'term'>('explanation');
  const [currentTermId, setCurrentTermId] = useState<string | null>(null);

  // Fetch explanation for the card - use public endpoint for showcase mode
  const apiEndpoint = isShowcaseMode 
    ? `/api/public/quiz/cards/${cardId}/explain` 
    : `/api/quiz-cards/${cardId}/explanation`;
  
  const { data: explanationData, isLoading: isLoadingExplanation, error: explanationError, refetch: refetchExplanation } = useQuery<ExplanationData>({
    queryKey: [apiEndpoint],
    enabled: isOpen,
    retry: false
  });

  // Parse error status from the error object
  const getErrorStatus = (error: any): number | null => {
    if (!error) return null;
    if (error.status) return error.status;
    if (error.response?.status) return error.response.status;
    const match = error.message?.match(/(\d{3})/);
    return match ? parseInt(match[1]) : null;
  };

  const errorStatus = getErrorStatus(explanationError);

  // Fetch term definition - disabled in showcase mode as terms API requires auth
  const { data: termData, isLoading: isLoadingTerm } = useQuery<Term>({
    queryKey: [`/api/terms/${currentTermId}`],
    enabled: !!currentTermId && !isShowcaseMode
  });

  // Define new term mutation
  const defineTermMutation = useMutation({
    mutationFn: async (term: string) => {
      const response = await apiRequest(`/api/terms/define`, {
        method: 'POST',
        body: JSON.stringify({ term })
      });
      return response;
    }
  });

  useEffect(() => {
    if (isOpen) {
      // Reset to root when modal opens
      setBreadcrumbs([{ label: 'Answer', type: 'root' }]);
      setCurrentView('explanation');
      setCurrentTermId(null);
    }
  }, [isOpen]);

  const handleTermClick = (term: Term) => {
    // Disable term navigation in showcase mode (requires authentication)
    if (isShowcaseMode) return;
    
    setCurrentTermId(term.id);
    setCurrentView('term');
    setBreadcrumbs(prev => [...prev, { 
      label: term.term, 
      type: 'term', 
      termId: term.id,
      data: term 
    }]);
  };

  const handleBreadcrumbClick = (index: number) => {
    const item = breadcrumbs[index];
    setBreadcrumbs(breadcrumbs.slice(0, index + 1));
    
    if (item.type === 'root' || item.type === 'explanation') {
      setCurrentView('explanation');
      setCurrentTermId(null);
    } else if (item.type === 'term' && item.termId) {
      setCurrentView('term');
      setCurrentTermId(item.termId);
    }
  };

  const highlightTerms = (text: string, terms: Term[]) => {
    if (!terms || terms.length === 0) return <span>{text}</span>;

    const parts: JSX.Element[] = [];
    let lastIndex = 0;
    const termMatches: { index: number; length: number; term: Term }[] = [];

    // Find all term occurrences
    terms.forEach(term => {
      const regex = new RegExp(`\\b${term.term}\\b`, 'gi');
      let match;
      while ((match = regex.exec(text)) !== null) {
        termMatches.push({
          index: match.index,
          length: match[0].length,
          term
        });
      }
    });

    // Sort by index
    termMatches.sort((a, b) => a.index - b.index);

    // Build parts with clickable terms
    termMatches.forEach((match, i) => {
      // Add text before the term
      if (match.index > lastIndex) {
        parts.push(
          <span key={`text-${i}`}>
            {text.substring(lastIndex, match.index)}
          </span>
        );
      }

      // Add term - clickable in authenticated mode, styled span in showcase mode
      if (isShowcaseMode) {
        parts.push(
          <span
            key={`term-${i}`}
            className="text-primary font-medium"
            data-testid={`term-${match.term.term.toLowerCase().replace(/\s+/g, '-')}`}
          >
            {text.substring(match.index, match.index + match.length)}
          </span>
        );
      } else {
        parts.push(
          <button
            key={`term-${i}`}
            onClick={() => handleTermClick(match.term)}
            className="text-primary underline underline-offset-2 hover:text-primary/80 font-medium transition-colors"
            data-testid={`term-${match.term.term.toLowerCase().replace(/\s+/g, '-')}`}
          >
            {text.substring(match.index, match.index + match.length)}
          </button>
        );
      }

      lastIndex = match.index + match.length;
    });

    // Add remaining text
    if (lastIndex < text.length) {
      parts.push(
        <span key="text-end">{text.substring(lastIndex)}</span>
      );
    }

    return <>{parts}</>;
  };

  const handleClose = () => {
    setBreadcrumbs([{ label: 'Answer', type: 'root' }]);
    setCurrentView('explanation');
    setCurrentTermId(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl h-[90vh] flex flex-col bg-card border-primary/30">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="text-2xl font-bold text-primary/80 flex items-center gap-2">
            <Lightbulb className="w-6 h-6" />
            Explanation
          </DialogTitle>
        </DialogHeader>

        {/* Breadcrumb Navigation */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground flex-wrap mb-4 flex-shrink-0">
          {breadcrumbs.map((crumb, index) => (
            <div key={index} className="flex items-center gap-2">
              <button
                onClick={() => handleBreadcrumbClick(index)}
                className={`hover:text-primary transition-colors ${
                  index === breadcrumbs.length - 1 ? 'text-primary font-medium' : ''
                }`}
                data-testid={`breadcrumb-${crumb.label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                {index === 0 && <Home className="w-4 h-4 inline mr-1" />}
                {crumb.label}
              </button>
              {index < breadcrumbs.length - 1 && (
                <ChevronRight className="w-4 h-4" />
              )}
            </div>
          ))}
        </div>

        {/* Content Area with Scroll */}
        <ScrollArea className="flex-1 min-h-0 pr-4">
          <Card className="bg-muted/50 border-primary/20">
            <CardContent className="p-6">
              {currentView === 'explanation' ? (
                <>
                  {isLoadingExplanation ? (
                    <div className="flex items-center justify-center py-8" data-testid="loading-explanation">
                      <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    </div>
                  ) : errorStatus === 401 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center space-y-4" data-testid="error-login-required">
                      <LogIn className="w-12 h-12 text-muted-foreground" />
                      <div>
                        <h4 className="text-lg font-semibold text-foreground mb-2">Login Required</h4>
                        <p className="text-muted-foreground mb-4">Please login to view explanations</p>
                        <Link href="/login">
                          <Button>
                            <LogIn className="w-4 h-4 mr-2" />
                            Login
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ) : errorStatus === 402 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center space-y-4" data-testid="error-insufficient-credits">
                      <Coins className="w-12 h-12 text-warning" />
                      <div>
                        <h4 className="text-lg font-semibold text-foreground mb-2">Insufficient Credits</h4>
                        <p className="text-muted-foreground mb-4">You don't have enough credits to generate an explanation. Please purchase more credits.</p>
                        <Link href="/buy-credits">
                          <Button>
                            <Coins className="w-4 h-4 mr-2" />
                            Buy Credits
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ) : errorStatus === 403 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center space-y-4" data-testid="error-no-org">
                      <AlertCircle className="w-12 h-12 text-warning" />
                      <div>
                        <h4 className="text-lg font-semibold text-foreground mb-2">Organization Required</h4>
                        <p className="text-muted-foreground">You need to be part of an organization to generate explanations.</p>
                      </div>
                    </div>
                  ) : explanationError ? (
                    <div className="flex flex-col items-center justify-center py-8 text-center space-y-4" data-testid="error-generic">
                      <AlertCircle className="w-12 h-12 text-destructive" />
                      <div>
                        <h4 className="text-lg font-semibold text-foreground mb-2">Error Loading Explanation</h4>
                        <p className="text-muted-foreground mb-4">Something went wrong while loading the explanation.</p>
                        <Button onClick={() => refetchExplanation()} variant="outline">
                          Try Again
                        </Button>
                      </div>
                    </div>
                  ) : explanationData ? (
                    <div className="space-y-4">
                      <div className="text-lg text-foreground leading-relaxed" data-testid="explanation-text">
                        {highlightTerms(explanationData.explanation, explanationData.terms ?? [])}
                      </div>
                      {explanationData?.terms?.length > 0 && (
                        <div className="mt-6 pt-4 border-t border-primary/20">
                          <h4 className="text-sm font-semibold text-primary mb-3 flex items-center gap-2">
                            <Lightbulb className="w-4 h-4" />
                            Key Terms
                          </h4>
                          <div className="space-y-2">
                            {explanationData.terms.map((term, idx) => (
                              isShowcaseMode ? (
                                <div
                                  key={term.id || idx}
                                  className="w-full text-left p-3 bg-muted/70 rounded-lg border border-primary/10"
                                  data-testid={`key-term-${term.term.toLowerCase().replace(/\s+/g, '-')}`}
                                >
                                  <span className="font-semibold text-primary">{term.term}:</span>{' '}
                                  <span className="text-muted-foreground">{term.definition}</span>
                                </div>
                              ) : (
                                <button
                                  key={term.id || idx}
                                  onClick={() => handleTermClick(term)}
                                  className="w-full text-left p-3 bg-muted/70 hover:bg-muted rounded-lg transition-colors border border-primary/10 hover:border-primary/30"
                                  data-testid={`key-term-${term.term.toLowerCase().replace(/\s+/g, '-')}`}
                                >
                                  <span className="font-semibold text-primary">{term.term}:</span>{' '}
                                  <span className="text-muted-foreground">{term.definition}</span>
                                </button>
                              )
                            ))}
                          </div>
                          {!isShowcaseMode && (
                            <p className="text-xs text-muted-foreground mt-3">
                              Click on any term above or highlighted terms in the explanation to learn more
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-center space-y-4" data-testid="no-explanation">
                      <Lightbulb className="w-12 h-12 text-muted-foreground" />
                      <div>
                        <h4 className="text-lg font-semibold text-foreground mb-2">No Explanation Available</h4>
                        <p className="text-muted-foreground mb-4">An explanation hasn't been generated for this question yet.</p>
                        <Button onClick={() => refetchExplanation()} 
                          className="bg-primary hover:bg-primary/90"
                          data-testid="button-generate-explanation"
                        >
                          <Lightbulb className="w-4 h-4 mr-2" />
                          Generate Explanation
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  {isLoadingTerm ? (
                    <div className="flex items-center justify-center py-8" data-testid="loading-term">
                      <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    </div>
                  ) : termData ? (
                    <div className="space-y-4">
                      <h3 className="text-xl font-semibold text-primary" data-testid="term-title">
                        {termData.term}
                      </h3>
                      <div className="text-lg text-foreground leading-relaxed" data-testid="term-definition">
                        {highlightTerms(termData.definition, explanationData?.terms || [])}
                      </div>
                    </div>
                  ) : (
                    <p className="text-muted-foreground">Loading definition...</p>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </ScrollArea>

        {/* Floating Next Question Button */}
        <div className="flex-shrink-0 mt-4 flex justify-end">
          <Button onClick={onNextQuestion} className="font-semibold shadow-elevated" data-testid="button-next-question" >
            <Zap className="w-4 h-4 mr-2" />
            Next Question
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
