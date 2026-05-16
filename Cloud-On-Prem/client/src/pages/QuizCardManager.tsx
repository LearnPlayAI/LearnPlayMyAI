import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient, invalidateWalletCaches } from '@/lib/queryClient';
import { Plus, Edit, Trash2, Save, X, Upload, FileText, Info, Lightbulb, Eye, CheckCircle2, Sparkles, PenTool, Coins, AlertCircle, Image as ImageIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { LP_CREDITS_SHORT } from "@shared/creditConstants";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import QuizAdminLayout from '@/components/QuizAdminLayout';
import { QuizVersionHistory } from '@/components/QuizVersionHistory';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/useAuth';
import { useOrganizationTerminology } from '@/contexts/OrganizationContext';
import { CourseBackLink } from '@/components/CourseBackLink';

export default function QuizCardManager() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { organizationRoles, isSuperAdmin, user, effectiveOrganizationId } = useAuth();
  const { terminology, terminologyLower, isResolved } = useOrganizationTerminology();

  // Check if terminology is ready (used for conditional rendering at the end, NOT early return)
  const terminologyReady = isResolved && terminology && terminologyLower;

  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const targetCollectionId = (urlParams.get('collection') || urlParams.get('quizId') || '').trim();
  const [selectedCollection, setSelectedCollection] = useState<string>(targetCollectionId);
  const [isCreating, setIsCreating] = useState(false);
  const [editingCard, setEditingCard] = useState<any>(null);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);
  const questionsRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [shouldScrollToQuestions, setShouldScrollToQuestions] = useState(false);
  
  
  // Collection creation state
  const [isCreatingCollection, setIsCreatingCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [newCollectionDescription, setNewCollectionDescription] = useState('');
  const [newCollectionIsPublic, setNewCollectionIsPublic] = useState(true);
  const [newCollectionDifficulty, setNewCollectionDifficulty] = useState('medium');
  const [newCollectionOrgId, setNewCollectionOrgId] = useState('');
  const [newCollectionUnitId, setNewCollectionUnitId] = useState('none');
  const [newCollectionSubjectId, setNewCollectionSubjectId] = useState('none');
  const [deleteCollectionDialog, setDeleteCollectionDialog] = useState(false);
  
  // Filter state for collection selection
  const [filterOrganizationId, setFilterOrganizationId] = useState('all');
  const [filterUnitId, setFilterUnitId] = useState('all');
  const [filterSubjectId, setFilterSubjectId] = useState('all');
  
  // CSV upload state
  const [isUploadingCsv, setIsUploadingCsv] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Answer verification state
  const [verificationResults, setVerificationResults] = useState<any>(null);
  const [showVerificationDialog, setShowVerificationDialog] = useState(false);
  
  // Explanation generation state
  const [explanationResults, setExplanationResults] = useState<any>(null);
  const [showExplanationDialog, setShowExplanationDialog] = useState(false);
  
  // Single explanation view state
  const [viewExplanationCard, setViewExplanationCard] = useState<any>(null);
  const [viewExplanationData, setViewExplanationData] = useState<any>(null);
  const [showViewExplanationDialog, setShowViewExplanationDialog] = useState(false);
  const [generatingExplanationFor, setGeneratingExplanationFor] = useState<string | null>(null);
  
  // Edit collection state
  const [editCollectionDialog, setEditCollectionDialog] = useState(false);
  const [editCollectionName, setEditCollectionName] = useState('');
  const [editCollectionDescription, setEditCollectionDescription] = useState('');
  const [editCollectionPassPercentage, setEditCollectionPassPercentage] = useState(70);
  const [editCollectionIsPublic, setEditCollectionIsPublic] = useState(false);
  
  // Form state
  const [question, setQuestion] = useState('');
  const [questionType, setQuestionType] = useState<'multiple-choice' | 'true-false' | 'match' | 'fill-blank'>('multiple-choice');
  const [answer1, setAnswer1] = useState('');
  const [answer2, setAnswer2] = useState('');
  const [answer3, setAnswer3] = useState('');
  const [answer4, setAnswer4] = useState('');
  const [answer5, setAnswer5] = useState('');
  const [answer6, setAnswer6] = useState('');
  const [correctAnswer, setCorrectAnswer] = useState('1');
  const [matchPairs, setMatchPairs] = useState<Array<{ left: string; right: string }>>([
    { left: '', right: '' },
    { left: '', right: '' },
    { left: '', right: '' },
    { left: '', right: '' }
  ]);
  const [fillBlankAnswer, setFillBlankAnswer] = useState('');
  
  // Creation mode state: 'ai' uses credits for AI generation, 'manual' is free manual creation
  const [creationMode, setCreationMode] = useState<'ai' | 'manual'>('manual');
  
  // Lesson context state - detect if coming from a lesson with PPTX for AI generation
  const [lessonContext, setLessonContext] = useState<{
    lessonId: string;
    organizationId: string;
    hasContent: boolean;
  } | null>(null);
  
  // Manual mode quick add questions
  const [manualQuestions, setManualQuestions] = useState<Array<{
    question: string;
    answers: string[];
    correctIndex: number;
    topic: string;
  }>>([{ question: '', answers: ['', '', '', ''], correctIndex: 0, topic: '' }]);

  // Queries
  const { data: selectedCollectionData, isLoading: selectedCollectionLoading } = useQuery<any>({
    queryKey: ['/api/quiz-collections', selectedCollection],
    queryFn: async () => {
      if (!selectedCollection) return null;
      const response = await fetch(`/api/quiz-collections/${selectedCollection}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch quiz collection');
      return response.json();
    },
    enabled: !!selectedCollection,
  });

  const { data: quizCards = [], isLoading: cardsLoading } = useQuery<any[]>({
    queryKey: ['/api/quiz-collections', selectedCollection, 'cards'],
    enabled: !!selectedCollection,
  });

  // Fetch organizations for SuperAdmins
  const { data: organizations = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/organizations'],
    enabled: isSuperAdmin,
  });

  // Fetch units for selected organization
  const { data: units = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/organizations', newCollectionOrgId, 'units'],
    enabled: !!newCollectionOrgId && !newCollectionIsPublic,
  });

  // Fetch subjects for selected organization
  const { data: subjects = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/subjects', newCollectionOrgId],
    queryFn: async () => {
      if (!newCollectionOrgId) return [];
      const params = new URLSearchParams({ organizationId: newCollectionOrgId });
      const response = await fetch(`/api/admin/subjects?${params.toString()}`, {
        credentials: 'include',
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!newCollectionOrgId && !newCollectionIsPublic,
  });

  // Fetch filter units for selected filter organization
  const { data: filterUnits = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/organizations', filterOrganizationId, 'units'],
    enabled: !!filterOrganizationId && filterOrganizationId !== 'all',
  });

  // Fetch filter subjects for selected grade (unit) - GRADE-AWARE
  const { data: filterSubjects = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/units', filterUnitId, 'subjects'],
    enabled: !!filterUnitId && filterUnitId !== 'all',
  });

  // Fetch platform pricing for explanation and answer check costs
  const { data: explanationPricing } = useQuery<{ creditCost: number }>({
    queryKey: ['/api/public/quiz-pricing', 'explanation'],
    queryFn: async () => {
      const response = await fetch('/api/public/quiz-pricing/explanation', { credentials: 'include' });
      if (!response.ok) return { creditCost: 25 };
      return response.json();
    },
  });

  const { data: answerCheckPricing } = useQuery<{ creditCost: number }>({
    queryKey: ['/api/public/quiz-pricing', 'answer-check'],
    queryFn: async () => {
      const response = await fetch('/api/public/quiz-pricing/answer-check', { credentials: 'include' });
      if (!response.ok) return { creditCost: 20 };
      return response.json();
    },
  });

  const explanationCreditCost = explanationPricing?.creditCost ?? 25;
  const answerCheckCreditCost = answerCheckPricing?.creditCost ?? 20;

  // Reset subject filter when grade/unit changes
  useEffect(() => {
    setFilterSubjectId('all');
  }, [filterUnitId]);

  // Helper functions for badge display
  const getGradeName = (gradeId: string | null) => {
    if (!gradeId || !filterUnits || filterUnits.length === 0) return null;
    const grade = filterUnits.find((g: any) => g.id === gradeId);
    return grade?.name;
  };

  const getSubjectName = (subjectId: string | null) => {
    if (!subjectId) return null;
    const subject = filterSubjects.find((s: any) => s.subjectId === subjectId || s.id === subjectId) ||
                    selectedCollectionSubjects.find((s: any) => s.id === subjectId);
    return subject?.subjectName || subject?.name;
  };

  // Get unique color for grade badge
  const getGradeColor = (gradeId: string): string => {
    if (!filterUnits || filterUnits.length === 0) return 'bg-muted';
    const colors = [
      'bg-secondary',
      'bg-primary',
      'bg-primary/70',
      'bg-warning',
      'bg-accent',
      'bg-primary',
      'bg-secondary',
      'bg-secondary/80',
      'bg-destructive/80',
      'bg-warning/90',
    ];
    
    const gradeIndex = filterUnits.findIndex((g: any) => g.id === gradeId);
    return gradeIndex >= 0 ? colors[gradeIndex % colors.length] : 'bg-muted';
  };

  // Fetch units for selected collection's organization
  const { data: selectedCollectionUnits = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/organizations', selectedCollectionData?.organizationId, 'units'],
    enabled: !!selectedCollectionData?.organizationId,
  });

  // Fetch subjects for selected collection's organization
  const { data: selectedCollectionSubjects = [] } = useQuery<any[]>({
    queryKey: ['/api/admin/subjects', selectedCollectionData?.organizationId],
    queryFn: async () => {
      if (!selectedCollectionData?.organizationId) return [];
      const params = new URLSearchParams({ organizationId: selectedCollectionData.organizationId });
      const response = await fetch(`/api/admin/subjects?${params.toString()}`, {
        credentials: 'include',
      });
      if (!response.ok) return [];
      return response.json();
    },
    enabled: !!selectedCollectionData?.organizationId,
  });

  // Auto-set organization for non-SuperAdmin users
  useEffect(() => {
    if (!isSuperAdmin && !newCollectionOrgId && !newCollectionIsPublic) {
      const scopedOrgId = effectiveOrganizationId || (organizationRoles.length > 0 ? organizationRoles[0].organizationId : '');
      if (scopedOrgId) {
        setNewCollectionOrgId(scopedOrgId);
      }
    }
  }, [isSuperAdmin, organizationRoles, effectiveOrganizationId, newCollectionOrgId, newCollectionIsPublic]);

  // URL-driven page context
  useEffect(() => {
    const scrollTo = urlParams.get('scrollTo');
    const lessonId = urlParams.get('lessonId');
    const orgId = urlParams.get('org');
    const mode = urlParams.get('mode');
    
    // Detect lesson context for AI generation
    if (lessonId && orgId) {
      setLessonContext({
        lessonId,
        organizationId: orgId,
        hasContent: true
      });
      // Default to AI mode when coming from a lesson
      setCreationMode(mode === 'manual' ? 'manual' : 'ai');
    } else if (mode === 'manual') {
      setCreationMode('manual');
    }
    if (scrollTo === 'questions') {
      setShouldScrollToQuestions(true);
    }
  }, [urlParams]);

  // Scroll to questions section when flag is set and collection is selected
  useEffect(() => {
    if (shouldScrollToQuestions && selectedCollection && questionsRef.current) {
      // Wait a bit for the UI to render the questions section
      setTimeout(() => {
        questionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setShouldScrollToQuestions(false);
      }, 300);
    }
  }, [shouldScrollToQuestions, selectedCollection]);

  // Keep collection selection pinned to URL-driven context.
  useEffect(() => {
    if (!targetCollectionId) return;
    if (selectedCollection === targetCollectionId) return;
    setSelectedCollection(targetCollectionId);
  }, [targetCollectionId, selectedCollection]);

  const hasRequiredCollectionContext = !!targetCollectionId;

  // Mutations
  const createCardMutation = useMutation({
    mutationFn: async () => {
      const baseData: any = {
        question,
        questionType,
        displayOrder: quizCards.length + 1
      };
      
      if (questionType === 'match') {
        baseData.matchPairs = matchPairs.filter(pair => pair.left && pair.right);
      } else if (questionType === 'fill-blank') {
        baseData.correctAnswer = fillBlankAnswer;
      } else {
        baseData.answer1 = answer1;
        baseData.answer2 = answer2;
        baseData.answer3 = answer3;
        baseData.answer4 = answer4;
        baseData.answer5 = answer5;
        baseData.answer6 = answer6;
        baseData.correctAnswerIndex = parseInt(correctAnswer);
      }
      
      return await apiRequest(`/api/admin/quiz-collections/${selectedCollection}/cards`, {
        method: 'POST',
        body: JSON.stringify(baseData),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/quiz-collections', selectedCollection, 'cards'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/quiz-collections'] });
      toast({ title: 'Quiz card created successfully' });
      resetForm();
      setIsCreating(false);
    },
    onError: () => {
      toast({ title: 'Failed to create quiz card', variant: 'destructive' });
    }
  });

  const updateCardMutation = useMutation({
    mutationFn: async (cardId: string) => {
      const baseData: any = {
        question,
        questionType
      };
      
      if (questionType === 'match') {
        baseData.matchPairs = matchPairs.filter(pair => pair.left && pair.right);
      } else if (questionType === 'fill-blank') {
        baseData.correctAnswer = fillBlankAnswer;
      } else {
        baseData.answer1 = answer1;
        baseData.answer2 = answer2;
        baseData.answer3 = answer3;
        baseData.answer4 = answer4;
        baseData.answer5 = answer5;
        baseData.answer6 = answer6;
        baseData.correctAnswerIndex = parseInt(correctAnswer);
      }
      
      return await apiRequest(`/api/admin/quiz-cards/${cardId}`, {
        method: 'PUT',
        body: JSON.stringify(baseData),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/quiz-collections', selectedCollection, 'cards'] });
      toast({ title: 'Quiz card updated successfully' });
      resetForm();
      setEditingCard(null);
      setEditingCardId(null);
    },
    onError: () => {
      toast({ title: 'Failed to update quiz card', variant: 'destructive' });
    }
  });

  const deleteCardMutation = useMutation({
    mutationFn: async (cardId: string) => {
      return await apiRequest(`/api/admin/quiz-cards/${cardId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/quiz-collections', selectedCollection, 'cards'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/quiz-collections'] });
      toast({ title: 'Quiz card deleted successfully' });
    },
    onError: () => {
      toast({ title: 'Failed to delete quiz card', variant: 'destructive' });
    }
  });

  const createCollectionMutation = useMutation({
    mutationFn: async () => {
      const userOrgId = effectiveOrganizationId || (organizationRoles.length > 0 ? organizationRoles[0].organizationId : null);
      const finalOrgId = newCollectionIsPublic ? null : (newCollectionOrgId || userOrgId);
      
      return await apiRequest('/api/admin/quiz-collections', {
        method: 'POST',
        body: JSON.stringify({
          name: newCollectionName,
          description: newCollectionDescription,
          isPublic: newCollectionIsPublic,
          difficulty: newCollectionDifficulty,
          organizationId: finalOrgId,
          unitId: !newCollectionIsPublic && newCollectionUnitId && newCollectionUnitId !== 'none' ? newCollectionUnitId : undefined,
          subjectId: !newCollectionIsPublic && newCollectionSubjectId && newCollectionSubjectId !== 'none' ? newCollectionSubjectId : undefined,
          isActive: true,
          totalCards: 0
        }),
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/quiz-collections'] });
      toast({ title: 'Quiz collection created successfully' });
      setIsCreatingCollection(false);
      setNewCollectionName('');
      setNewCollectionDescription('');
      setNewCollectionOrgId('');
      setNewCollectionUnitId('');
      setNewCollectionSubjectId('');
      if (data && data.id) {
        setSelectedCollection(data.id);
      }
    },
    onError: () => {
      toast({ title: 'Failed to create quiz collection', variant: 'destructive' });
    }
  });

  // Mutation for saving multiple manual questions in bulk
  const saveManualQuestionsMutation = useMutation({
    mutationFn: async () => {
      const validQuestions = manualQuestions.filter(q => q.question.trim() && q.answers.filter(a => a.trim()).length >= 2);
      
      const results = await Promise.all(validQuestions.map(async (q, idx) => {
        const answers = q.answers.filter(a => a.trim());
        // Pad to 6 answers if less
        while (answers.length < 6) {
          answers.push('');
        }
        
        return await apiRequest(`/api/admin/quiz-collections/${selectedCollection}/cards`, {
          method: 'POST',
          body: JSON.stringify({
            question: q.question,
            questionType: 'multiple-choice',
            answer1: answers[0] || '',
            answer2: answers[1] || '',
            answer3: answers[2] || '',
            answer4: answers[3] || '',
            answer5: answers[4] || '',
            answer6: answers[5] || '',
            correctAnswerIndex: q.correctIndex + 1,
            displayOrder: quizCards.length + idx + 1,
            topic: q.topic || undefined
          }),
        });
      }));
      
      return results;
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries({ queryKey: ['/api/quiz-collections', selectedCollection, 'cards'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/quiz-collections'] });
      toast({ title: `${results.length} question${results.length > 1 ? 's' : ''} added successfully` });
      setManualQuestions([{ question: '', answers: ['', '', '', ''], correctIndex: 0, topic: '' }]);
    },
    onError: () => {
      toast({ title: 'Failed to save questions', variant: 'destructive' });
    }
  });

  const deleteCollectionMutation = useMutation({
    mutationFn: async (collectionId: string) => {
      return await apiRequest(`/api/admin/quiz-collections/${collectionId}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/quiz-collections'] });
      toast({ title: 'Quiz collection deleted successfully' });
      setDeleteCollectionDialog(false);
      setSelectedCollection('');
      resetForm();
      setIsCreating(false);
      setEditingCard(null);
    },
    onError: (error: any) => {
      toast({ 
        title: error.message || 'Failed to delete quiz collection', 
        variant: 'destructive' 
      });
      setDeleteCollectionDialog(false);
    }
  });

  const updateCollectionMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/admin/quiz-collections/${selectedCollection}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: editCollectionName,
          description: editCollectionDescription,
          passPercentage: editCollectionPassPercentage,
          isPublic: editCollectionIsPublic,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/quiz-collections'] });
      queryClient.invalidateQueries({ queryKey: ['/api/quiz/collections/public'] });
      toast({ title: 'Collection updated successfully' });
      setEditCollectionDialog(false);
    },
    onError: (error: any) => {
      toast({ 
        title: error.message || 'Failed to update collection', 
        variant: 'destructive' 
      });
    }
  });

  const uploadCsvMutation = useMutation({
    mutationFn: async (csvData: string) => {
      return await apiRequest(`/api/admin/quiz-collections/${selectedCollection}/cards/bulk-csv`, {
        method: 'POST',
        body: JSON.stringify({ csvData }),
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/quiz-collections', selectedCollection, 'cards'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/quiz-collections'] });
      
      if (data.errors && data.errors.length > 0) {
        console.log('CSV upload errors:', data.errors);
        toast({ 
          title: data.message || `Created ${data.created} questions`,
          description: data.errors.slice(0, 3).join('; '),
          variant: data.created === 0 ? 'destructive' : 'default',
        });
      } else {
        toast({ 
          title: data.message || 'CSV uploaded successfully',
        });
      }
      
      setIsUploadingCsv(false);
      setCsvFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    onError: (error: any) => {
      toast({ 
        title: error.message || 'Failed to upload CSV', 
        variant: 'destructive' 
      });
    }
  });

  const generateExplanationsMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/quiz-collections/${selectedCollection}/generate-all-explanations`, {
        method: 'POST',
      });
    },
    onSuccess: (data: any) => {
      invalidateWalletCaches();
      setExplanationResults(data);
      setShowExplanationDialog(true);
      
      const { total, generated, alreadyExisted, failed } = data;
      if (failed === 0 && alreadyExisted === total) {
        toast({ 
          title: 'All Explanations Already Exist',
          description: `All ${total} questions already have explanations.`,
        });
      } else if (failed === 0) {
        toast({ 
          title: 'Explanation Generation Complete',
          description: `Generated ${generated} new explanations successfully.`,
        });
      } else {
        toast({ 
          title: 'Explanation Generation Completed with Errors',
          description: `Generated: ${generated}, Failed: ${failed}`,
          variant: 'destructive',
        });
      }
      if (data.errors && data.errors.length > 0) {
        console.error('Explanation generation errors:', data.errors);
      }
    },
    onError: (error: any) => {
      toast({ 
        title: error.message || 'Failed to generate explanations', 
        variant: 'destructive' 
      });
    }
  });

  const verifyAnswersMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest(`/api/quiz-collections/${selectedCollection}/verify-answers`, {
        method: 'POST',
      });
    },
    onSuccess: (data: any) => {
      invalidateWalletCaches();
      setVerificationResults(data);
      setShowVerificationDialog(true);
      
      const { total, verified, mismatches, noExplanation } = data;
      if (mismatches.length === 0 && noExplanation.length === 0) {
        toast({ 
          title: 'All Answers Verified!',
          description: `All ${verified} questions have correct answers.`,
        });
      } else {
        toast({ 
          title: 'Verification Complete',
          description: `Found ${mismatches.length} mismatches and ${noExplanation.length} questions without explanations.`,
          variant: mismatches.length > 0 ? 'destructive' : 'default',
        });
      }
    },
    onError: (error: any) => {
      toast({ 
        title: error.message || 'Failed to verify answers', 
        variant: 'destructive' 
      });
    }
  });

  const updateCorrectAnswerMutation = useMutation({
    mutationFn: async ({ cardId, correctAnswerIndex }: { cardId: string; correctAnswerIndex: number }) => {
      return await apiRequest(`/api/quiz-cards/${cardId}/correct-answer`, {
        method: 'PATCH',
        body: JSON.stringify({ correctAnswerIndex }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/quiz-collections', selectedCollection, 'cards'] });
      toast({ title: 'Correct answer updated successfully' });
    },
    onError: (error: any) => {
      toast({ 
        title: error.message || 'Failed to update correct answer', 
        variant: 'destructive' 
      });
    }
  });

  const viewExplanationMutation = useMutation({
    mutationFn: async (card: any) => {
      setGeneratingExplanationFor(card.id);
      
      // The GET endpoint automatically generates if explanation doesn't exist
      const response = await fetch(`/api/quiz-cards/${card.id}/explanation`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to load explanation');
      }
      
      const data = await response.json();
      return { explanation: data, card };
    },
    onSuccess: (data: any) => {
      invalidateWalletCaches();
      setViewExplanationCard(data.card);
      setViewExplanationData(data.explanation);
      setShowViewExplanationDialog(true);
      setGeneratingExplanationFor(null);
    },
    onError: (error: any) => {
      setGeneratingExplanationFor(null);
      toast({ 
        title: error.message || 'Failed to load or generate explanation', 
        variant: 'destructive' 
      });
    }
  });

  const resetForm = () => {
    setQuestion('');
    setQuestionType('multiple-choice');
    setAnswer1('');
    setAnswer2('');
    setAnswer3('');
    setAnswer4('');
    setAnswer5('');
    setAnswer6('');
    setCorrectAnswer('1');
    setMatchPairs([
      { left: '', right: '' },
      { left: '', right: '' },
      { left: '', right: '' },
      { left: '', right: '' }
    ]);
    setFillBlankAnswer('');
  };

  const handleEdit = (card: any) => {
    setEditingCard(card);
    setEditingCardId(card.id);
    setQuestion(card.question);
    
    // Determine question type
    const type = card.questionType || (card.matchPairs ? 'match' : card.correctAnswer && card.question?.includes('___') ? 'fill-blank' : 'multiple-choice');
    setQuestionType(type);
    
    if (type === 'match' && card.matchPairs) {
      // Populate match pairs
      const pairs = card.matchPairs.length > 0 ? card.matchPairs : [
        { left: '', right: '' },
        { left: '', right: '' },
        { left: '', right: '' },
        { left: '', right: '' }
      ];
      setMatchPairs(pairs);
    } else if (type === 'fill-blank') {
      setFillBlankAnswer(card.correctAnswer || '');
    } else {
      // Multiple choice or true/false
      setAnswer1(card.answer1 || '');
      setAnswer2(card.answer2 || '');
      setAnswer3(card.answer3 || '');
      setAnswer4(card.answer4 || '');
      setAnswer5(card.answer5 || '');
      setAnswer6(card.answer6 || '');
      setCorrectAnswer(card.correctAnswerIndex?.toString() || '1');
    }
    
    // Scroll the card into view with smooth behavior
    setTimeout(() => {
      cardRefs.current[card.id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const handleSave = () => {
    if (!question) {
      toast({ title: 'Please enter a question', variant: 'destructive' });
      return;
    }
    
    // Validate based on question type
    if (questionType === 'match') {
      if (matchPairs.some(pair => !pair.left || !pair.right)) {
        toast({ title: 'Please fill in all match pairs', variant: 'destructive' });
        return;
      }
    } else if (questionType === 'fill-blank') {
      if (!fillBlankAnswer) {
        toast({ title: 'Please enter the correct answer', variant: 'destructive' });
        return;
      }
    } else if (questionType === 'true-false') {
      if (!answer1.trim() || !answer2.trim()) {
        toast({ title: 'Please fill in both True and False answers', variant: 'destructive' });
        return;
      }
    } else {
      if (!answer1.trim() || !answer2.trim() || !answer3.trim() || !answer4.trim() || !answer5.trim() || !answer6.trim()) {
        toast({ title: 'Please fill in all answer fields', variant: 'destructive' });
        return;
      }
    }
    
    if (editingCard) {
      updateCardMutation.mutate(editingCard.id);
    } else {
      createCardMutation.mutate();
    }
  };

  const handleCancel = () => {
    resetForm();
    setIsCreating(false);
    setEditingCard(null);
    setEditingCardId(null);
  };

  const handleEditCollection = () => {
    setEditCollectionName(selectedCollectionData?.name || '');
    setEditCollectionDescription(selectedCollectionData?.description || '');
    setEditCollectionPassPercentage(selectedCollectionData?.passPercentage || 70);
    setEditCollectionIsPublic(selectedCollectionData?.isPublic || false);
    setEditCollectionDialog(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
        toast({ 
          title: 'Invalid file type', 
          description: 'Please select a CSV file',
          variant: 'destructive' 
        });
        return;
      }
      setCsvFile(file);
    }
  };

  const handleCsvUpload = async () => {
    if (!csvFile) {
      toast({ title: 'Please select a CSV file', variant: 'destructive' });
      return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
      const csvData = e.target?.result as string;
      uploadCsvMutation.mutate(csvData);
    };
    reader.readAsText(csvFile);
  };

  // Show loading state if terminology is not ready
  if (!terminologyReady) {
    return (
      <QuizAdminLayout title="Quiz Manager" description="Loading..." activeSection="questions">
        <div className="flex items-center justify-center h-64">
          <div className="text-foreground">Loading...</div>
        </div>
      </QuizAdminLayout>
    );
  }

  return (
    <QuizAdminLayout title="Quiz Questions" description="Add questions and answers to quiz collections" activeSection="questions">
      <CourseBackLink className="mb-4" />
      <div className="space-y-6">
        {/* Creation Mode Toggle */}
        <Card className="bg-primary hover:bg-primary/90 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Quiz Creation Mode</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {lessonContext 
                    ? `Creating quiz from lesson content` 
                    : 'Choose how you want to create quiz questions'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant={creationMode === 'manual' ? 'default' : 'outline'} onClick={() => setCreationMode('manual')}
                  className={creationMode === 'manual' 
                    ? 'bg-primary hover:bg-primary/90' 
                    : ''}
                  data-testid="button-mode-manual"
                >
                  <PenTool className="mr-2 h-4 w-4" />
                  Manual Creation
                  <Badge variant="secondary" className="ml-2">Free</Badge>
                </Button>
                <Button variant={creationMode === 'ai' ? 'default' : 'outline'} onClick={() => setCreationMode('ai')}
                  className={creationMode === 'ai' 
                    ? 'bg-primary hover:bg-primary/90' 
                    : ''}
                  data-testid="button-mode-ai"
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  AI Generation
                  <Badge variant="secondary" className="ml-2">
                    <Coins className="mr-1 h-3 w-3" />
                    Uses {LP_CREDITS_SHORT}
                  </Badge>
                </Button>
              </div>
            </div>
            
            {/* AI Mode Info - Show when AI mode is selected */}
            {creationMode === 'ai' && (
              <Alert className="mt-4">
                <Sparkles className="h-4 w-4 text-secondary" />
                <AlertTitle className="text-foreground">AI-Powered Quiz Generation</AlertTitle>
                <AlertDescription className="text-muted-foreground">
                  {lessonContext ? (
                    <div className="space-y-2">
                      <p>Generate quiz questions automatically from your lesson content using AI.</p>
                      <Button onClick={() => setLocation(`/quiz-wizard?lessonId=${lessonContext.lessonId}&org=${lessonContext.organizationId}`)}
                        className="mt-2 bg-primary hover:bg-primary/90"
                      >
                        <Sparkles className="mr-2 h-4 w-4" />
                        Open AI Quiz Wizard
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p>To use AI quiz generation, first create a lesson with content (PPTX), then use "Generate Quiz" from the lesson actions menu.</p>
                      <p className="text-sm">Alternatively, switch to Manual Creation mode to add questions for free.</p>
                    </div>
                  )}
                </AlertDescription>
              </Alert>
            )}
            
            {/* Manual Mode Info */}
            {creationMode === 'manual' && (
              <Alert className="mt-4">
                <PenTool className="h-4 w-4 text-success" />
                <AlertTitle className="text-foreground">Manual Quiz Creation (Free)</AlertTitle>
                <AlertDescription className="text-muted-foreground">
                  Create questions manually at no cost. Select or create a quiz collection below, then add your questions.
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        {!hasRequiredCollectionContext ? (
          <Alert >
            <AlertCircle className="h-4 w-4 text-warning" />
            <AlertTitle className="text-foreground">Quiz Context Required</AlertTitle>
            <AlertDescription className="text-sm text-muted-foreground">
              This page only supports direct quiz edit links from Lesson Editor. Open a lesson, then use the quiz Edit action in Artifact Quick Access.
            </AlertDescription>
          </Alert>
        ) : selectedCollectionLoading ? (
          <Card className="bg-card border-border">
            <CardContent className="py-8 text-sm text-muted-foreground">Loading selected quiz...</CardContent>
          </Card>
        ) : !selectedCollectionData ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Quiz Not Available</AlertTitle>
            <AlertDescription>
              The requested quiz could not be found or you do not have access to it.
            </AlertDescription>
          </Alert>
        ) : (
          <Card className="bg-card border-border">
            <CardHeader>
              <CardTitle className="text-foreground">Focused Quiz Editor</CardTitle>
              <CardDescription className="text-muted-foreground">
                Editing only this quiz from lesson context: <span className="text-foreground">{selectedCollectionData.name}</span>
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {selectedCollection && (
          <>
            {/* Collection Info */}
            <Card className="mb-6 bg-primary hover:bg-primary/90 border-primary/20 dark:border-primary/50">
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div>
                    <h2 className="text-2xl font-bold text-foreground">
                      {selectedCollectionData?.name}
                    </h2>
                    <p className="text-muted-foreground mt-1 font-medium">
                      {selectedCollectionData?.description || 'No description'}
                    </p>
                    <div className="flex gap-2 mt-3 flex-wrap">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                        selectedCollectionData?.isPublic 
                          ? 'bg-success/10 text-success dark:bg-success/20 dark:text-success/80'
                          : 'bg-warning/10 text-warning dark:bg-warning/20 dark:text-warning/80'
                      }`}>
                        {selectedCollectionData?.isPublic ? 'Public' : 'Organization Only'}
                      </span>
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-secondary/10 text-secondary dark:bg-secondary/20 dark:text-secondary/80">
                        {quizCards.length} Questions
                      </span>
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary">
                        Pass: {selectedCollectionData?.passPercentage || 70}%
                      </span>
                      {selectedCollectionData?.assignments && selectedCollectionData.assignments.length > 0 && (
                        <>
                          {selectedCollectionData.assignments.map((assignment: any) => {
                            const unit = selectedCollectionUnits.find((u: any) => u.id === assignment.unitId);
                            const subject = selectedCollectionSubjects.find((s: any) => s.id === selectedCollectionData.subjectId);
                            return (
                              <div key={assignment.id} className="flex gap-2">
                                {unit && (
                                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary/80">
                                    {unit.name}
                                  </span>
                                )}
                                {subject && (
                                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-secondary/10 text-secondary dark:bg-secondary/20 dark:text-secondary">
                                    {subject.name}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </>
                      )}
                    </div>
                  </div>
                  {!isCreating && !editingCard && (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2">
                      <Button onClick={() => setIsCreating(true)}
                        className="bg-primary hover:bg-primary/90"
                        data-testid="button-add-card"
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Add Question
                      </Button>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button onClick={() => generateExplanationsMutation.mutate()}
                              variant="outline"
                              className="border-primary text-primary hover:bg-primary/5 dark:hover:bg-primary/20"
                              disabled={generateExplanationsMutation.isPending || !selectedCollection}
                              data-testid="button-generate-explanations"
                            >
                              {generateExplanationsMutation.isPending ? (
                                <><div className="h-4 w-4 mr-2 border-2 border-primary border-t-transparent rounded-full animate-spin" />Generating...</>
                              ) : (
                                <>
                                  <Lightbulb className="mr-2 h-4 w-4" />
                                  Explanations
                                  <Badge variant="secondary" className="ml-2 text-xs">{explanationCreditCost} {LP_CREDITS_SHORT}</Badge>
                                </>
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="max-w-xs">
                            <p>AI generates and caches answer explanations for all questions in this quiz. Users will see instant explanations during gameplay.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button onClick={() => verifyAnswersMutation.mutate()}
                              variant="outline"
                              className="border-[var(--success)] text-success hover:bg-success/5 dark:hover:bg-success/20"
                              disabled={verifyAnswersMutation.isPending || !selectedCollection}
                              data-testid="button-check-answers"
                            >
                              {verifyAnswersMutation.isPending ? (
                                <><div className="h-4 w-4 mr-2 border-2 border-[var(--success)] border-t-transparent rounded-full animate-spin" />Checking...</>
                              ) : (
                                <>
                                  <CheckCircle2 className="mr-2 h-4 w-4" />
                                  Check Answers
                                  <Badge variant="secondary" className="ml-2 text-xs">{answerCheckCreditCost} {LP_CREDITS_SHORT}</Badge>
                                </>
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent side="bottom" className="max-w-xs">
                            <p>AI validates all answers in this quiz are correct and reports any issues found. Ensures quiz accuracy before publishing.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <Button onClick={handleEditCollection} variant="outline" data-testid="button-edit-collection" >
                        <Edit className="mr-2 h-4 w-4" />
                        Edit Collection
                      </Button>
                      {selectedCollection && (
                        <QuizVersionHistory quizId={selectedCollection} />
                      )}
                      <Button onClick={() => setDeleteCollectionDialog(true)}
                        variant="destructive"
                        data-testid="button-delete-collection"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Create New Question Form (top-of-page) - Advanced mode */}
            {isCreating && (
              <Card className="mb-6 border-2 border-primary">
                <CardHeader>
                  <CardTitle>Add New Question</CardTitle>
                  <CardDescription>
                    Create a new quiz question with 6 answer options
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="question">Question</Label>
                    <Textarea
                      id="question"
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      placeholder="Enter your question here..."
                      rows={3}
                      data-testid="input-question"
                    />
                  </div>

                  {questionType === 'match' ? (
                    <div className="space-y-3">
                      <Label className="text-foreground">Match Pairs</Label>
                      <p className="text-sm text-muted-foreground">Enter items to match on the left with their correct matches on the right</p>
                      {matchPairs.map((pair, index) => (
                        <div key={index} className="grid grid-cols-2 gap-3 items-center">
                          <Input
                            value={pair.left}
                            onChange={(e) => {
                              const updated = [...matchPairs];
                              updated[index].left = e.target.value;
                              setMatchPairs(updated);
                            }}
                            placeholder={`Left item ${index + 1}`}
                            className="bg-muted text-foreground border-border"
                            data-testid={`input-match-left-${index}`}
                          />
                          <Input
                            value={pair.right}
                            onChange={(e) => {
                              const updated = [...matchPairs];
                              updated[index].right = e.target.value;
                              setMatchPairs(updated);
                            }}
                            placeholder={`Right match ${index + 1}`}
                            className="bg-muted text-foreground border-border"
                            data-testid={`input-match-right-${index}`}
                          />
                        </div>
                      ))}
                      <Button type="button" variant="outline" size="sm" onClick={() => setMatchPairs([...matchPairs, { left: '', right: '' }])}
                        className="mt-2"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Pair
                      </Button>
                    </div>
                  ) : questionType === 'fill-blank' ? (
                    <div className="space-y-2">
                      <Label htmlFor="fillBlankAnswer" className="text-foreground">Correct Answer</Label>
                      <p className="text-sm text-muted-foreground">Make sure your question includes ___ where the blank should be</p>
                      <Input
                        id="fillBlankAnswer"
                        value={fillBlankAnswer}
                        onChange={(e) => setFillBlankAnswer(e.target.value)}
                        placeholder="Enter the correct answer"
                        className="bg-muted text-foreground border-border"
                        data-testid="input-fill-blank-answer"
                      />
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {[1, 2, 3, 4, 5, 6].map((num) => {
                        const answerValue = [answer1, answer2, answer3, answer4, answer5, answer6][num - 1];
                        const setAnswerValue = [setAnswer1, setAnswer2, setAnswer3, setAnswer4, setAnswer5, setAnswer6][num - 1];
                        
                        const isOddAnswer = num % 2 === 1;
                        
                        const checkboxElement = (
                          <button
                            type="button"
                            onClick={() => setCorrectAnswer(num.toString())}
                            className={`flex-shrink-0 w-6 h-6 rounded border-2 flex items-center justify-center ${
                              correctAnswer === num.toString()
                                ? 'bg-success border-[var(--success)]'
                                : 'border-border hover:border-[var(--success)]/60'
                            }`}
                            data-testid={`checkbox-answer${num}`}
                            aria-label={`Mark answer ${num} as correct`}
                          >
                            {correctAnswer === num.toString() && (
                              <svg className="w-4 h-4 text-success-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </button>
                        );
                        
                        const inputElement = (
                          <Input
                            id={`answer${num}`}
                            value={answerValue}
                            onChange={(e) => setAnswerValue(e.target.value)}
                            placeholder={`Answer option ${num}`}
                            data-testid={`input-answer${num}`}
                            className={`flex-1 ${correctAnswer === num.toString() ? 'border-[var(--success)] border-2' : ''}`}
                          />
                        );
                        
                        return (
                          <div key={num} className="space-y-2">
                            <Label htmlFor={`answer${num}`} className="text-foreground">
                              Answer {num}
                            </Label>
                            <div className="flex items-center gap-2">
                              {isOddAnswer ? (
                                <>
                                  {checkboxElement}
                                  {inputElement}
                                </>
                              ) : (
                                <>
                                  {inputElement}
                                  {checkboxElement}
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="flex gap-2 pt-4">
                    <Button onClick={handleSave} disabled={createCardMutation.isPending} className="flex-1" data-testid="button-save-card" >
                      <Save className="mr-2 h-4 w-4" />
                      Save Question
                    </Button>
                    <Button onClick={handleCancel} variant="outline" data-testid="button-cancel" >
                      <X className="mr-2 h-4 w-4" />
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Quiz Cards List */}
            <div ref={questionsRef} className="space-y-4">
              <h2 className="text-2xl font-bold text-foreground">
                Questions ({quizCards.length})
              </h2>
              
              {cardsLoading ? (
                <div className="text-center py-12">Loading questions...</div>
              ) : quizCards.length > 0 ? (
                <div className="space-y-4">
                  {quizCards.map((card: any, index: number) => (
                    <div key={card.id} ref={(el) => { cardRefs.current[card.id] = el; }}>
                      <Collapsible
                        open={editingCardId === card.id}
                        onOpenChange={(open) => !open && handleCancel()}
                      >
                        <Card className="hover:shadow-elevated transition-shadow">
                          <CardHeader>
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary/80 font-bold">
                                    {index + 1}
                                  </span>
                                  <CardTitle className="text-lg">{card.question}</CardTitle>
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <Button variant="ghost" size="sm" onClick={() => viewExplanationMutation.mutate(card)}
                                  disabled={generatingExplanationFor === card.id}
                                  data-testid={`button-view-explanation-${card.id}`}
                                  title="View Explanation"
                                >
                                  {generatingExplanationFor === card.id ? (
                                    <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                  ) : (
                                    <Eye className="h-4 w-4 text-primary" />
                                  )}
                                </Button>
                                <Button type="button" variant="ghost" size="sm" onClick={(e) => {
                                    e.preventDefault();
                                    handleEdit(card);
                                  }}
                                  data-testid={`button-edit-${card.id}`}
                                >
                                  <Edit className="h-4 w-4 text-secondary" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => {
                                    if (confirm('Are you sure you want to delete this question?')) {
                                      deleteCardMutation.mutate(card.id);
                                    }
                                  }}
                                  data-testid={`button-delete-${card.id}`}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </div>
                          </CardHeader>
                          <CardContent>
                            {card.imageKey && (
                              <figure className="mb-4 rounded-lg border border-border bg-muted/30 overflow-hidden">
                                <img
                                  src={`/api/quiz-cards/${card.id}/image`}
                                  alt={card.imageAltText || card.imageCaption || 'Question visual'}
                                  className="w-full h-44 object-contain bg-background"
                                  loading="lazy"
                                  onError={(event) => {
                                    event.currentTarget.style.display = 'none';
                                  }}
                                />
                                <figcaption className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                                  <ImageIcon className="h-3.5 w-3.5" />
                                  <span className="line-clamp-1">{card.imageCaption || 'Source visual'}</span>
                                </figcaption>
                              </figure>
                            )}
                            {(() => {
                              const cardType = card.questionType || (card.matchPairs ? 'match' : card.correctAnswer && card.question?.includes('___') ? 'fill-blank' : 'multiple-choice');
                              
                              if (cardType === 'match' && card.matchPairs) {
                                return (
                                  <div className="space-y-2">
                                    <div className="text-xs text-muted-foreground mb-2 uppercase font-semibold">Match Pairs</div>
                                    <div className="grid grid-cols-1 gap-2">
                                      {card.matchPairs.map((pair: any, idx: number) => (
                                        <div key={idx} className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                                          <span className="flex-1 text-sm text-foreground font-medium">{pair.left}</span>
                                          <span className="text-primary">↔</span>
                                          <span className="flex-1 text-sm text-foreground">{pair.right}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                );
                              } else if (cardType === 'fill-blank') {
                                return (
                                  <div className="space-y-2">
                                    <div className="text-xs text-muted-foreground mb-2 uppercase font-semibold">Correct Answer</div>
                                    <div className="p-3 rounded-lg bg-success/10 border-2 border-[var(--success)] dark:bg-success/30 dark:border-[var(--success)]">
                                      <div className="flex items-center gap-2">
                                        <span className="text-sm text-foreground font-medium">{card.correctAnswer}</span>
                                        <span className="ml-auto text-xs bg-success text-success-foreground px-2 py-0.5 rounded">
                                          ✓ Correct
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              } else {
                                return (
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {[
                                      card.answer1,
                                      card.answer2,
                                      card.answer3,
                                      card.answer4,
                                      card.answer5,
                                      card.answer6,
                                    ].map((answer, idx) => (
                                      <div
                                        key={idx}
                                        className={`p-3 rounded-lg ${
                                          card.correctAnswerIndex === idx + 1
                                            ? 'bg-success/10 border-2 border-[var(--success)] dark:bg-success/30 dark:border-[var(--success)]'
                                            : 'bg-muted'
                                        }`}
                                      >
                                        <div className="flex items-center gap-2">
                                          <span className="font-semibold text-sm text-foreground">
                                            {idx + 1}.
                                          </span>
                                          <span className="text-sm text-foreground">{answer}</span>
                                          {card.correctAnswerIndex === idx + 1 && (
                                            <span className="ml-auto text-xs bg-success text-success-foreground px-2 py-0.5 rounded">
                                              ✓ Correct
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                );
                              }
                            })()}
                          </CardContent>
                        </Card>
                        
                        <CollapsibleContent>
                          <Card className="mt-2 border-2 border-primary bg-primary/5">
                            <CardHeader className="pb-4">
                              <CardTitle className="text-lg flex items-center gap-2">
                                <Edit className="h-5 w-5 text-primary" />
                                Edit Question
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                              <div className="space-y-2">
                                <Label htmlFor={`inline-question-${card.id}`} className="text-foreground">Question</Label>
                                <Textarea
                                  id={`inline-question-${card.id}`}
                                  value={question}
                                  onChange={(e) => setQuestion(e.target.value)}
                                  placeholder="Enter your question"
                                  className="bg-muted text-foreground border-border"
                                  data-testid={`inline-input-question-${card.id}`}
                                />
                              </div>

                              <div className="space-y-2">
                                <Label htmlFor={`inline-question-type-${card.id}`} className="text-foreground">Question Type</Label>
                                <Select value={questionType} onValueChange={(value: 'multiple-choice' | 'true-false' | 'match' | 'fill-blank') => setQuestionType(value)}>
                                  <SelectTrigger id={`inline-question-type-${card.id}`} className="bg-muted border-border text-foreground" data-testid={`inline-select-question-type-${card.id}`}>
                                    <SelectValue placeholder="Select question type" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="multiple-choice">Multiple Choice (6 options)</SelectItem>
                                    <SelectItem value="true-false">True/False</SelectItem>
                                    <SelectItem value="match">Matching</SelectItem>
                                    <SelectItem value="fill-blank">Fill in the Blank</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>

                              {questionType === 'match' ? (
                                <div className="space-y-3">
                                  <Label className="text-foreground">Match Pairs</Label>
                                  {matchPairs.map((pair, pairIndex) => (
                                    <div key={pairIndex} className="grid grid-cols-2 gap-2">
                                      <Input
                                        value={pair.left}
                                        onChange={(e) => {
                                          const updated = [...matchPairs];
                                          updated[pairIndex].left = e.target.value;
                                          setMatchPairs(updated);
                                        }}
                                        placeholder={`Left match ${pairIndex + 1}`}
                                        className="bg-muted text-foreground border-border"
                                      />
                                      <Input
                                        value={pair.right}
                                        onChange={(e) => {
                                          const updated = [...matchPairs];
                                          updated[pairIndex].right = e.target.value;
                                          setMatchPairs(updated);
                                        }}
                                        placeholder={`Right match ${pairIndex + 1}`}
                                        className="bg-muted text-foreground border-border"
                                      />
                                    </div>
                                  ))}
                                  <Button type="button" variant="outline" size="sm" onClick={() => setMatchPairs([...matchPairs, { left: '', right: '' }])}
                                    className="mt-2"
                                  >
                                    <Plus className="h-4 w-4 mr-2" />
                                    Add Pair
                                  </Button>
                                </div>
                              ) : questionType === 'fill-blank' ? (
                                <div className="space-y-2">
                                  <Label htmlFor={`inline-fillBlankAnswer-${card.id}`} className="text-foreground">Correct Answer</Label>
                                  <p className="text-sm text-muted-foreground">Make sure your question includes ___ where the blank should be</p>
                                  <Input
                                    id={`inline-fillBlankAnswer-${card.id}`}
                                    value={fillBlankAnswer}
                                    onChange={(e) => setFillBlankAnswer(e.target.value)}
                                    placeholder="Enter the correct answer"
                                    className="bg-muted text-foreground border-border"
                                  />
                                </div>
                              ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  {[1, 2, 3, 4, 5, 6].map((num) => {
                                    const answerValue = [answer1, answer2, answer3, answer4, answer5, answer6][num - 1];
                                    const setAnswerValue = [setAnswer1, setAnswer2, setAnswer3, setAnswer4, setAnswer5, setAnswer6][num - 1];
                                    const isOddAnswer = num % 2 === 1;
                                    
                                    const checkboxElement = (
                                      <button
                                        type="button"
                                        onClick={() => setCorrectAnswer(num.toString())}
                                        className={`flex-shrink-0 w-6 h-6 rounded border-2 flex items-center justify-center ${
                                          correctAnswer === num.toString()
                                            ? 'bg-success border-[var(--success)]'
                                            : 'border-border hover:border-[var(--success)]/60'
                                        }`}
                                        aria-label={`Mark answer ${num} as correct`}
                                      >
                                        {correctAnswer === num.toString() && (
                                          <svg className="w-4 h-4 text-success-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                          </svg>
                                        )}
                                      </button>
                                    );
                                    
                                    const inputElement = (
                                      <Input
                                        id={`inline-answer${num}-${card.id}`}
                                        value={answerValue}
                                        onChange={(e) => setAnswerValue(e.target.value)}
                                        placeholder={`Answer option ${num}`}
                                        className={`flex-1 ${correctAnswer === num.toString() ? 'border-[var(--success)] border-2' : ''}`}
                                      />
                                    );
                                    
                                    return (
                                      <div key={num} className="space-y-2">
                                        <Label htmlFor={`inline-answer${num}-${card.id}`} className="text-foreground">
                                          Answer {num}
                                        </Label>
                                        <div className="flex items-center gap-2">
                                          {isOddAnswer ? (
                                            <>
                                              {checkboxElement}
                                              {inputElement}
                                            </>
                                          ) : (
                                            <>
                                              {inputElement}
                                              {checkboxElement}
                                            </>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              <div className="flex gap-2 pt-4">
                                <Button onClick={handleSave} disabled={updateCardMutation.isPending} className="flex-1" data-testid={`inline-button-save-${card.id}`} >
                                  <Save className="mr-2 h-4 w-4" />
                                  Update Question
                                </Button>
                                <Button onClick={handleCancel} variant="outline" data-testid={`inline-button-cancel-${card.id}`} >
                                  <X className="mr-2 h-4 w-4" />
                                  Cancel
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="py-12 text-center">
                    <div className="text-muted-foreground mb-4 text-6xl">❓</div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">
                      No questions yet
                    </h3>
                    <p className="text-muted-foreground mb-4">
                      Add your first quiz question to get started
                    </p>
                    <Button onClick={() => setIsCreating(true)} data-testid="button-add-first-card">
                      <Plus className="mr-2 h-4 w-4" />
                      Add First Question
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>
          </>
        )}

        {/* Manual Mode Quick Entry Form - Outside selectedCollection block */}
        {creationMode === 'manual' && !isCreating && !editingCard && (
          <Card className="mb-6 border-2 border-[var(--success)]/50 bg-success/2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PenTool className="h-5 w-5 text-success" />
                Quick Add Questions
                <Badge variant="secondary" >Free - No Credits</Badge>
              </CardTitle>
              <CardDescription>
                Add multiple questions quickly. Fill in the question, 4 answer options, and select the correct answer.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Collection Selection Prompt when no collection selected */}
              {!selectedCollection && (
                <Alert >
                  <AlertCircle className="h-4 w-4 text-warning" />
                  <AlertTitle className="text-foreground">Quiz Context Required</AlertTitle>
                  <AlertDescription className="text-muted-foreground">
                    Open this editor from Lesson Editor using the quiz Edit option so a specific quiz is provided.
                  </AlertDescription>
                </Alert>
              )}
              
              {/* Question entry form - only show when collection is selected */}
              {selectedCollection && (
                <>
                  {manualQuestions.map((q, qIndex) => (
                    <div key={qIndex} className="p-4 border rounded-lg bg-card space-y-4">
                      <div className="flex items-center justify-between">
                        <Label className="text-base font-semibold">Question {qIndex + 1}</Label>
                        {manualQuestions.length > 1 && (
                          <Button variant="ghost" size="sm" onClick={() => {
                              const updated = manualQuestions.filter((_, i) => i !== qIndex);
                              setManualQuestions(updated);
                            }}
                            className="text-destructive hover:text-destructive"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor={`manual-question-${qIndex}`}>Question Text</Label>
                        <Textarea
                          id={`manual-question-${qIndex}`}
                          value={q.question}
                          onChange={(e) => {
                            const updated = [...manualQuestions];
                            updated[qIndex].question = e.target.value;
                            setManualQuestions(updated);
                          }}
                          placeholder="Enter your question here..."
                          rows={2}
                          className="bg-muted border-border"
                          data-testid={`input-manual-question-${qIndex}`}
                        />
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {q.answers.map((answer, aIndex) => (
                          <div key={aIndex} className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const updated = [...manualQuestions];
                                updated[qIndex].correctIndex = aIndex;
                                setManualQuestions(updated);
                              }}
                              className={`flex-shrink-0 w-6 h-6 rounded border-2 flex items-center justify-center ${
                                q.correctIndex === aIndex
                                  ? 'bg-success border-[var(--success)]'
                                  : 'border-border hover:border-[var(--success)]/60'
                              }`}
                              aria-label={`Mark answer ${aIndex + 1} as correct`}
                            >
                              {q.correctIndex === aIndex && (
                                <svg className="w-4 h-4 text-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </button>
                            <Input
                              value={answer}
                              onChange={(e) => {
                                const updated = [...manualQuestions];
                                updated[qIndex].answers[aIndex] = e.target.value;
                                setManualQuestions(updated);
                              }}
                              placeholder={`Answer ${aIndex + 1}`}
                              className="bg-muted border-border flex-1"
                              data-testid={`input-manual-answer-${qIndex}-${aIndex}`}
                            />
                          </div>
                        ))}
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor={`manual-topic-${qIndex}`}>Topic (optional)</Label>
                        <Input
                          id={`manual-topic-${qIndex}`}
                          value={q.topic}
                          onChange={(e) => {
                            const updated = [...manualQuestions];
                            updated[qIndex].topic = e.target.value;
                            setManualQuestions(updated);
                          }}
                          placeholder="e.g., Chapter 1, Unit 2, etc."
                          className="bg-muted border-border"
                          data-testid={`input-manual-topic-${qIndex}`}
                        />
                      </div>
                    </div>
                  ))}
                  
                  <div className="flex flex-wrap gap-3">
                    <Button variant="outline" onClick={() => {
                        setManualQuestions([...manualQuestions, { question: '', answers: ['', '', '', ''], correctIndex: 0, topic: '' }]);
                      }}
                      data-testid="button-add-another-question"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add Another Question
                    </Button>
                    
                    <Button onClick={() => saveManualQuestionsMutation.mutate()}
                      disabled={saveManualQuestionsMutation.isPending || !manualQuestions.some(q => q.question.trim() && q.answers.filter(a => a.trim()).length >= 2)}
                      className="bg-success"
                      data-testid="button-save-manual-questions"
                    >
                      {saveManualQuestionsMutation.isPending ? (
                        <>
                          <div className="h-4 w-4 mr-2 border-2 border-[var(--stroke-default)] border-t-transparent rounded-full animate-spin" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save className="mr-2 h-4 w-4" />
                          Save {manualQuestions.filter(q => q.question.trim()).length} Question{manualQuestions.filter(q => q.question.trim()).length !== 1 ? 's' : ''}
                        </>
                      )}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {!selectedCollection && creationMode !== 'manual' && (
          <Card>
            <CardContent className="py-12 text-center">
              <div className="text-muted-foreground mb-4 text-6xl">📚</div>
              <h3 className="text-lg font-semibold text-foreground mb-2">
                Select a Quiz Collection
              </h3>
              <p className="text-muted-foreground">
                Choose a quiz collection from the dropdown above to start managing questions
              </p>
            </CardContent>
          </Card>
        )}

        {/* Create Collection Dialog */}
        <Dialog open={isCreatingCollection} onOpenChange={setIsCreatingCollection}>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Quiz Collection</DialogTitle>
              <DialogDescription>
                Create a new quiz collection with questions and answers
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="collection-name">Collection Name</Label>
                <Input
                  id="collection-name"
                  placeholder={`e.g., Math Quiz ${terminology.unit} 5`}
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                  data-testid="input-collection-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="collection-description">Description</Label>
                <Textarea
                  id="collection-description"
                  placeholder="Brief description of the quiz collection"
                  value={newCollectionDescription}
                  onChange={(e) => setNewCollectionDescription(e.target.value)}
                  data-testid="input-collection-description"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="collection-visibility">Visibility</Label>
                <Select
                  value={newCollectionIsPublic ? 'public' : 'private'}
                  onValueChange={(value) => {
                    setNewCollectionIsPublic(value === 'public');
                    if (value === 'public') {
                      setNewCollectionOrgId('');
                      setNewCollectionUnitId('');
                      setNewCollectionSubjectId('');
                    }
                  }}
                >
                  <SelectTrigger id="collection-visibility" data-testid="select-visibility">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">Public (Available to all users)</SelectItem>
                    <SelectItem value="private">Organization Only</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {!newCollectionIsPublic && (
                <>
                  {isSuperAdmin && (
                    <div className="space-y-2">
                      <Label htmlFor="collection-organization">Organization *</Label>
                      <Select
                        value={newCollectionOrgId}
                        onValueChange={(value) => {
                          setNewCollectionOrgId(value);
                          setNewCollectionUnitId('');
                          setNewCollectionSubjectId('');
                        }}
                      >
                        <SelectTrigger id="collection-organization" data-testid="select-organization">
                          <SelectValue placeholder="Select organization" />
                        </SelectTrigger>
                        <SelectContent>
                          {organizations.map((org: any) => (
                            <SelectItem key={org.id} value={org.id}>
                              {org.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  
                  {!isSuperAdmin && organizationRoles.length > 0 && (
                    <div className="space-y-2">
                      <Label>Organization</Label>
                      <div className="text-sm font-medium p-2 bg-muted rounded">
                        {organizations.find((o: any) => o.id === (effectiveOrganizationId || organizationRoles[0]?.organizationId))?.name || 'Your Organization'}
                      </div>
                    </div>
                  )}
                  
                  {newCollectionOrgId && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="collection-unit">{terminology.unit} / {terminology.subUnit} (Optional)</Label>
                        <Select
                          value={newCollectionUnitId}
                          onValueChange={setNewCollectionUnitId}
                        >
                          <SelectTrigger id="collection-unit" data-testid="select-unit">
                            <SelectValue placeholder={`Select ${terminologyLower.unit}/${terminologyLower.subUnit} (optional)`} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {units.map((unit: any) => (
                              <SelectItem key={unit.id} value={unit.id}>
                                {unit.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="collection-subject">Subject (Optional)</Label>
                        <Select
                          value={newCollectionSubjectId}
                          onValueChange={setNewCollectionSubjectId}
                        >
                          <SelectTrigger id="collection-subject" data-testid="select-subject">
                            <SelectValue placeholder="Select subject (optional)" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {subjects.map((subject: any) => (
                              <SelectItem key={subject.id} value={subject.id}>
                                {subject.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}
                </>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="collection-difficulty">Difficulty</Label>
                <Select
                  value={newCollectionDifficulty}
                  onValueChange={setNewCollectionDifficulty}
                >
                  <SelectTrigger id="collection-difficulty" data-testid="select-difficulty">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="easy">Easy</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="hard">Hard</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreatingCollection(false)}
                data-testid="button-cancel-collection"
              >
                Cancel
              </Button>
              <Button onClick={() => {
                  if (!newCollectionName) {
                    toast({ title: 'Please enter a collection name', variant: 'destructive' });
                    return;
                  }
                  createCollectionMutation.mutate();
                }}
                disabled={createCollectionMutation.isPending}
                data-testid="button-save-collection"
              >
                {createCollectionMutation.isPending ? 'Creating...' : 'Create Collection'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Collection Confirmation Dialog */}
        <Dialog open={deleteCollectionDialog} onOpenChange={setDeleteCollectionDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Quiz Collection</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete "{selectedCollectionData?.name}"? This action cannot be undone and will delete all questions in this collection.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteCollectionDialog(false)}
                data-testid="button-cancel-delete"
              >
                Cancel
              </Button>
              <Button variant="destructive" onClick={() => deleteCollectionMutation.mutate(selectedCollection)}
                disabled={deleteCollectionMutation.isPending}
                data-testid="button-confirm-delete"
              >
                {deleteCollectionMutation.isPending ? 'Deleting...' : 'Delete Collection'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* CSV Upload Dialog */}
        <Dialog open={isUploadingCsv} onOpenChange={setIsUploadingCsv}>
          <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[95vh] flex flex-col">
            <DialogHeader className="flex-shrink-0">
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Upload Questions from CSV
              </DialogTitle>
              <DialogDescription>
                Upload a CSV file to quickly add multiple quiz questions at once
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 overflow-y-auto flex-1 pr-2">
              {/* CSV Format Instructions */}
              <Alert >
                <Info className="h-4 w-4 text-accent dark:text-accent/80" />
                <AlertTitle className="text-foreground">CSV Format Requirements</AlertTitle>
                <AlertDescription className="space-y-2 text-sm text-foreground">
                  <p>Your CSV file must follow this exact structure:</p>
                  <div className="bg-card p-3 rounded-md font-mono text-xs overflow-x-auto">
                    <div className="text-success dark:text-success/80">question,answer1,answer2,answer3,answer4,answer5,answer6,correctAnswer</div>
                    <div className="text-foreground">What is 2+2?,3,4,5,6,7,8,2</div>
                    <div className="text-foreground">What color is the sky?,Red,Blue,Green,Yellow,Purple,Orange,2</div>
                  </div>
                  <ul className="list-disc list-inside space-y-1 mt-2 text-foreground">
                    <li><strong>8 columns required:</strong> 1 question + 6 answers + correct answer number (1-6)</li>
                    <li><strong>Delimiter:</strong> Use comma (,) or semicolon (;) - automatically detected</li>
                    <li><strong>First row is header</strong> (will be skipped during import)</li>
                    <li><strong>correctAnswer:</strong> Must be a number from 1 to 6 indicating which answer is correct</li>
                    <li><strong>Use quotes</strong> for fields containing delimiters: "What is 2+2, really?",4,...</li>
                    <li><strong>All fields are required</strong> for each question</li>
                  </ul>
                </AlertDescription>
              </Alert>

              {/* File Upload */}
              <div className="space-y-2">
                <Label htmlFor="csv-file">Select CSV File</Label>
                <Input
                  id="csv-file"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileChange}
                  ref={fileInputRef}
                  data-testid="input-csv-file"
                />
                {csvFile && (
                  <p className="text-sm text-success dark:text-success/80">
                    Selected: {csvFile.name} ({(csvFile.size / 1024).toFixed(2)} KB)
                  </p>
                )}
              </div>
            </div>

            <DialogFooter className="flex-shrink-0 mt-4">
              <Button variant="outline" onClick={() => {
                  setIsUploadingCsv(false);
                  setCsvFile(null);
                  if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                  }
                }}
                data-testid="button-cancel-csv"
              >
                Cancel
              </Button>
              <Button onClick={handleCsvUpload} disabled={!csvFile || uploadCsvMutation.isPending} data-testid="button-upload-csv-confirm" >
                {uploadCsvMutation.isPending ? 'Uploading...' : 'Upload & Import'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Collection Dialog */}
        <Dialog open={editCollectionDialog} onOpenChange={setEditCollectionDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Collection Settings</DialogTitle>
              <DialogDescription>
                Update the name, description, pass percentage, and visibility settings for this quiz collection
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="collection-name">Quiz Name</Label>
                <Input
                  id="collection-name"
                  type="text"
                  value={editCollectionName}
                  onChange={(e) => setEditCollectionName(e.target.value)}
                  placeholder="Enter quiz name"
                  className="bg-muted border-border text-foreground"
                  data-testid="input-collection-name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="collection-description">Description</Label>
                <Textarea
                  id="collection-description"
                  value={editCollectionDescription}
                  onChange={(e) => setEditCollectionDescription(e.target.value)}
                  placeholder="Enter quiz description"
                  className="bg-muted border-border text-foreground min-h-[80px]"
                  data-testid="textarea-collection-description"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="collection-pass-percentage">Required Pass Percentage</Label>
                <Input
                  id="collection-pass-percentage"
                  type="number"
                  min="0"
                  max="100"
                  value={editCollectionPassPercentage}
                  onChange={(e) => setEditCollectionPassPercentage(Number(e.target.value))}
                  placeholder="70"
                  className="bg-muted border-border text-foreground"
                  data-testid="input-collection-pass-percentage"
                />
                <p className="text-sm text-muted-foreground">
                  Minimum percentage required to pass this quiz (0-100)
                </p>
              </div>
              
              <div className="flex items-center justify-between space-x-2">
                <div className="space-y-0.5">
                  <Label htmlFor="collection-is-public">Public Visibility</Label>
                  <p className="text-sm text-muted-foreground">
                    {editCollectionIsPublic ? 'Visible to all users' : 'Only visible to organization members'}
                  </p>
                </div>
                <Switch
                  id="collection-is-public"
                  checked={editCollectionIsPublic}
                  onCheckedChange={setEditCollectionIsPublic}
                  data-testid="switch-collection-is-public"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditCollectionDialog(false)}
                data-testid="button-cancel-edit-collection"
              >
                Cancel
              </Button>
              <Button onClick={() => updateCollectionMutation.mutate()}
                disabled={updateCollectionMutation.isPending}
                className="bg-primary hover:bg-primary/90"
                data-testid="button-save-edit-collection"
              >
                {updateCollectionMutation.isPending ? 'Updating...' : 'Update Collection'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Explanation Generation Results Dialog */}
        <Dialog open={showExplanationDialog} onOpenChange={setShowExplanationDialog}>
          <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Explanation Generation Results</DialogTitle>
              <DialogDescription>
                Review the results of bulk explanation generation
              </DialogDescription>
            </DialogHeader>
            
            {explanationResults && (
              <div className="space-y-4">
                {/* Summary */}
                <div className="grid grid-cols-4 gap-3">
                  <div className="bg-accent/10 dark:bg-accent/30 p-3 rounded-lg">
                    <div className="text-sm text-muted-foreground">Total</div>
                    <div className="text-2xl font-bold text-accent dark:text-accent/80">
                      {explanationResults.total}
                    </div>
                  </div>
                  <div className="bg-success/10 dark:bg-success/30 p-3 rounded-lg">
                    <div className="text-sm text-muted-foreground">Generated</div>
                    <div className="text-2xl font-bold text-success dark:text-success/80">
                      {explanationResults.generated}
                    </div>
                  </div>
                  <div className="bg-warning/10 dark:bg-warning/30 p-3 rounded-lg">
                    <div className="text-sm text-muted-foreground">Existed</div>
                    <div className="text-2xl font-bold text-warning dark:text-warning/80">
                      {explanationResults.alreadyExisted}
                    </div>
                  </div>
                  <div className="bg-destructive/10 dark:bg-destructive/30 p-3 rounded-lg">
                    <div className="text-sm text-muted-foreground">Failed</div>
                    <div className="text-2xl font-bold text-destructive dark:text-destructive/80">
                      {explanationResults.failed}
                    </div>
                  </div>
                </div>

                {/* Success Message */}
                {explanationResults.failed === 0 && explanationResults.generated > 0 && (
                  <Alert >
                    <Info className="h-4 w-4 text-success dark:text-success/80" />
                    <AlertTitle className="text-foreground">
                      Generation Successful!
                    </AlertTitle>
                    <AlertDescription className="text-foreground">
                      Successfully generated {explanationResults.generated} new explanation{explanationResults.generated > 1 ? 's' : ''}.
                    </AlertDescription>
                  </Alert>
                )}

                {/* Already Existed Message */}
                {explanationResults.alreadyExisted === explanationResults.total && (
                  <Alert >
                    <Info className="h-4 w-4 text-accent dark:text-accent/80" />
                    <AlertTitle className="text-foreground">
                      All Explanations Already Exist
                    </AlertTitle>
                    <AlertDescription className="text-foreground">
                      All {explanationResults.total} questions already have explanations. No new explanations were needed.
                    </AlertDescription>
                  </Alert>
                )}

                {/* Errors List */}
                {explanationResults.errors && explanationResults.errors.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-lg text-foreground">
                      Failed Generations ({explanationResults.errors.length})
                    </h3>
                    <Alert >
                      <Info className="h-4 w-4 text-destructive dark:text-destructive/80" />
                      <AlertDescription className="text-foreground">
                        The following questions failed to generate explanations:
                      </AlertDescription>
                    </Alert>
                    {explanationResults.errors.map((error: any, index: number) => (
                      <Card key={index} className="border-2 border-[var(--destructive)]/30 dark:border-[var(--destructive)]/40">
                        <CardContent className="p-3 space-y-2">
                          <div className="font-medium text-foreground text-sm">
                            {error.question}
                          </div>
                          <div className="text-xs text-destructive dark:text-destructive/80">
                            Error: {error.error}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowExplanationDialog(false)}
                data-testid="button-close-explanation-results"
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View Explanation Dialog */}
        <Dialog open={showViewExplanationDialog} onOpenChange={setShowViewExplanationDialog}>
          <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Question Explanation</DialogTitle>
              <DialogDescription>
                AI-generated explanation for this quiz question
              </DialogDescription>
            </DialogHeader>
            
            {viewExplanationCard && viewExplanationData && (
              <div className="space-y-4">
                {/* Question */}
                <div className="p-4 bg-accent/10 dark:bg-accent/20 rounded-lg border border-accent/30 dark:border-accent/40">
                  <div className="text-sm font-semibold text-muted-foreground mb-2">Question:</div>
                  <div className="text-foreground font-medium">
                    {viewExplanationCard.question}
                  </div>
                </div>

                {/* Correct Answer */}
                <div className="p-4 bg-success/10 dark:bg-success/20 rounded-lg border-2 border-[var(--success)] dark:border-[var(--success)]/80">
                  <div className="text-sm font-semibold text-muted-foreground mb-2">Correct Answer:</div>
                  <div className="text-foreground font-medium">
                    {(() => {
                      const cardType = viewExplanationCard.questionType || 'multiple-choice';
                      
                      if (cardType === 'match' && viewExplanationCard.matchPairs) {
                        return (
                          <div className="space-y-1">
                            {viewExplanationCard.matchPairs.map((pair: any, idx: number) => (
                              <div key={idx} className="text-sm">
                                {pair.left} → {pair.right}
                              </div>
                            ))}
                          </div>
                        );
                      } else if (cardType === 'fill-blank') {
                        return <span className="text-success dark:text-success/80 font-semibold">{viewExplanationCard.correctAnswer}</span>;
                      } else {
                        // Multiple choice or true/false
                        const allAnswers = [
                          viewExplanationCard.answer1,
                          viewExplanationCard.answer2,
                          viewExplanationCard.answer3,
                          viewExplanationCard.answer4,
                          viewExplanationCard.answer5,
                          viewExplanationCard.answer6
                        ];
                        const correctAnswer = allAnswers[viewExplanationCard.correctAnswerIndex - 1];
                        return (
                          <span className="text-success dark:text-success/80 font-semibold">
                            {viewExplanationCard.correctAnswerIndex}. {correctAnswer}
                          </span>
                        );
                      }
                    })()}
                  </div>
                </div>

                {/* Explanation */}
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-muted-foreground">Explanation:</div>
                  <div className="p-4 bg-muted rounded-lg text-foreground leading-relaxed">
                    {viewExplanationData.explanation}
                  </div>
                </div>

                {/* Key Terms */}
                {viewExplanationData.terms && viewExplanationData.terms.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-muted-foreground">Key Terms:</div>
                    <div className="space-y-2">
                      {viewExplanationData.terms.map((term: any, index: number) => (
                        <div key={index} className="p-3 bg-primary/5 dark:bg-primary/10 rounded-lg border border-primary/20 dark:border-primary/50">
                          <div className="font-semibold text-primary dark:text-primary/70 mb-1">
                            {term.term}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {term.definition}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowViewExplanationDialog(false)}
                data-testid="button-close-explanation-view"
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Answer Verification Results Dialog */}
        <Dialog open={showVerificationDialog} onOpenChange={setShowVerificationDialog}>
          <DialogContent className="sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Answer Verification Results</DialogTitle>
              <DialogDescription>
                Review the verification results and correct any mismatched answers
              </DialogDescription>
            </DialogHeader>
            
            {verificationResults && (
              <div className="space-y-4">
                {/* Summary */}
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-success/10 dark:bg-success/30 p-3 rounded-lg">
                    <div className="text-sm text-muted-foreground">Verified</div>
                    <div className="text-2xl font-bold text-success dark:text-success/80">
                      {verificationResults.verified}
                    </div>
                  </div>
                  <div className="bg-destructive/10 dark:bg-destructive/30 p-3 rounded-lg">
                    <div className="text-sm text-muted-foreground">Mismatches</div>
                    <div className="text-2xl font-bold text-destructive dark:text-destructive/80">
                      {verificationResults.mismatches.length}
                    </div>
                  </div>
                  <div className="bg-warning/10 dark:bg-warning/30 p-3 rounded-lg">
                    <div className="text-sm text-muted-foreground">No Explanation</div>
                    <div className="text-2xl font-bold text-warning dark:text-warning/80">
                      {verificationResults.noExplanation.length}
                    </div>
                  </div>
                </div>

                {/* No Explanation Warning */}
                {verificationResults.noExplanation.length > 0 && (
                  <Alert >
                    <Info className="h-4 w-4 text-warning dark:text-warning/80" />
                    <AlertTitle className="text-foreground">
                      {verificationResults.noExplanation.length} Question{verificationResults.noExplanation.length > 1 ? 's' : ''} Without Explanations
                    </AlertTitle>
                    <AlertDescription className="text-foreground">
                      Click "Generate Explanations" to create explanations for all questions before verifying answers.
                    </AlertDescription>
                  </Alert>
                )}

                {/* Mismatches List */}
                {verificationResults.mismatches.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="font-semibold text-lg text-foreground">
                      Incorrect Answers Found
                    </h3>
                    {verificationResults.mismatches.map((mismatch: any, index: number) => (
                      <Card key={index} className="border-2 border-[var(--destructive)]/30 dark:border-[var(--destructive)]/40">
                        <CardContent className="p-4 space-y-3">
                          <div className="font-medium text-foreground">
                            {mismatch.question}
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <div className="text-sm font-semibold text-destructive dark:text-destructive/80">
                                Current (Incorrect):
                              </div>
                              <div className="p-2 bg-destructive/10 dark:bg-destructive/30 rounded border-2 border-[var(--destructive)]">
                                <div className="text-sm text-foreground">
                                  {mismatch.currentCorrectIndex}. {mismatch.currentCorrectAnswer}
                                </div>
                              </div>
                            </div>
                            
                            <div className="space-y-2">
                              <div className="text-sm font-semibold text-success dark:text-success/80">
                                Suggested (Correct):
                              </div>
                              <div className="p-2 bg-success/10 dark:bg-success/30 rounded border-2 border-[var(--success)]">
                                <div className="text-sm text-foreground">
                                  {mismatch.suggestedCorrectIndex}. {mismatch.suggestedCorrectAnswer}
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-1">
                            <div className="text-sm font-semibold text-muted-foreground">
                              Explanation:
                            </div>
                            <div className="text-sm text-muted-foreground italic p-2 bg-muted rounded">
                              {mismatch.explanation}
                            </div>
                          </div>

                          <div className="flex justify-end">
                            <Button onClick={() => {
                                updateCorrectAnswerMutation.mutate({
                                  cardId: mismatch.cardId,
                                  correctAnswerIndex: mismatch.suggestedCorrectIndex
                                });
                                // Remove from mismatches list after fixing
                                setVerificationResults((prev: any) => ({
                                  ...prev,
                                  mismatches: prev.mismatches.filter((m: any) => m.cardId !== mismatch.cardId),
                                  verified: prev.verified + 1
                                }));
                              }}
                              disabled={updateCorrectAnswerMutation.isPending}
                              className="bg-success hover:bg-success/90"
                              data-testid={`button-fix-answer-${index}`}
                            >
                              {updateCorrectAnswerMutation.isPending ? 'Updating...' : 'Fix Answer'}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}

                {/* All Verified Message */}
                {verificationResults.mismatches.length === 0 && verificationResults.noExplanation.length === 0 && (
                  <Alert >
                    <Info className="h-4 w-4 text-success dark:text-success/80" />
                    <AlertTitle className="text-foreground">
                      All Answers Verified!
                    </AlertTitle>
                    <AlertDescription className="text-foreground">
                      All {verificationResults.verified} questions have correct answers matching their explanations.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowVerificationDialog(false)}
                data-testid="button-close-verification"
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </QuizAdminLayout>
  );
}
