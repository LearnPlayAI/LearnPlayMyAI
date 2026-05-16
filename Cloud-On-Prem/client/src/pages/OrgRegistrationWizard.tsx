import { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'wouter';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  Check,
  Building2,
  User,
  Mail,
  Lock,
  Phone,
  MapPin,
  Users,
  GraduationCap,
  BookOpen,
  Sparkles,
  AlertCircle,
  Briefcase,
  Landmark,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { getTerminology } from '@/utils/terminology';
import { TIMEZONES } from '@/utils/timezones';
import { getActiveTimezone } from '@/utils/timezoneRuntime';
import { BUSINESS_DEPARTMENTS } from '@shared/businessConstants';
import { PremiumHeader } from '@/pages/landing';

// Step 1: Personal Information Schema
const personalInfoSchema = z.object({
  firstName: z.string().min(2, 'First name must be at least 2 characters'),
  lastName: z.string().min(2, 'Last name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string().min(6, 'Password must be at least 6 characters'),
  gamerName: z.string().min(3, 'Gamer name must be at least 3 characters'),
  positionAtOrg: z.string().min(2, 'Position is required'),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

// Step 2: Organization Details Schema
const orgDetailsSchema = z.object({
  orgName: z.string().min(3, 'Organization name must be at least 3 characters'),
  organizationType: z.enum(['education', 'business', 'elearning'], {
    required_error: 'Please select an organization type',
  }),
  streetAddress: z.string().min(5, 'Street address is required'),
  city: z.string().min(2, 'City is required'),
  province: z.string().min(2, 'Province/State is required'),
  postalCode: z.string().min(3, 'Postal code is required'),
  country: z.string().default('South Africa'),
  contactPhone: z.string().min(10, 'Valid phone number is required'),
  studentCount: z.coerce.number().min(1, 'Please enter expected number of learners'),
  howHeardAboutUs: z.string().min(3, 'Please tell us how you heard about us'),
  timezone: z.string().min(1, 'Please select a timezone'),
  currency: z.enum(['ZAR', 'USD', 'EUR'], {
    required_error: 'Please select a currency',
  }),
});

// Step 3: Structure Setup Schema (supports education, business, and elearning)
const structureSetupSchema = z.object({
  selectedGrades: z.array(z.number()).optional(),
  gradeSubjects: z.record(z.string(), z.array(z.string())).optional(),
  selectedDepartments: z.array(z.string()).optional(),
  departmentUnits: z.record(z.string(), z.array(z.string())).optional(),
  courseThemes: z.array(z.string()).optional(), // E-learning: AI topic themes for post-registration
}).refine(
  (data) => {
    // At least one of selectedGrades, selectedDepartments, or courseThemes must have items
    return (data.selectedGrades && data.selectedGrades.length > 0) || 
           (data.selectedDepartments && data.selectedDepartments.length > 0) ||
           (data.courseThemes && data.courseThemes.length > 0);
  },
  {
    message: 'Please select at least one grade, department, or course theme',
  }
);

// Step 4: Banking Details Schema - Base (optional for education/business)
const baseBankingSchema = z.object({
  bankName: z.string().optional(),
  accountHolderName: z.string().optional(),
  accountNumber: z.string().optional(),
  branchCode: z.string().optional(),
  accountType: z.enum(['business', 'personal']).optional(),
  saveBankingForLater: z.boolean().default(false),
});

// Step 4: E-Learning Required Banking Schema
const elearningBankingSchema = z.object({
  bankName: z.string().min(1, 'Bank name is required'),
  accountHolderName: z.string().min(1, 'Account holder name is required'),
  accountNumber: z.string().min(1, 'Account number is required'),
  branchCode: z.string().optional(),
  accountType: z.enum(['business', 'personal'], {
    required_error: 'Please select account type',
  }),
  saveBankingForLater: z.boolean().default(false),
}).refine(
  (data) => {
    // Allow empty fields only if saving for later
    if (data.saveBankingForLater) return true;
    return data.bankName && data.accountHolderName && data.accountNumber && data.accountType;
  },
  {
    message: 'Please complete all banking details or check "Save for later"',
    path: ['bankName'], // Show error on first field
  }
);

// Available subjects
const AVAILABLE_SUBJECTS = [
  'Mathematics',
  'English',
  'Afrikaans',
  'Science',
  'Natural Sciences',
  'Technology',
  'Social Sciences',
  'History',
  'Geography',
  'Life Orientation',
  'Life Skills',
  'Physical Sciences',
  'Life Sciences',
  'Accounting',
  'Business Studies',
  'Economics',
  'Computer Applications Technology',
  'Information Technology',
  'Robotics',
  'Arts & Culture',
  'Music',
  'Visual Arts',
  'Dramatic Arts',
];

// Grades 1-12
const GRADES = Array.from({ length: 12 }, (_, i) => i + 1);

export default function OrgRegistrationWizard() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [personalInfo, setPersonalInfo] = useState<any>(null);
  const [orgDetails, setOrgDetails] = useState<any>(null);
  const [structureSetup, setStructureSetup] = useState<any>(null);
  const [bankingDetails, setBankingDetails] = useState<any>(null);

  // Authentication queries for navbar
  const { data: user } = useQuery({
    queryKey: ["/api/auth/user"],
    retry: false,
  });

  const { data: adminCheck, isLoading: adminLoading } = useQuery<{
    isAdmin?: boolean;
    isSuperAdmin?: boolean;
    isOrgAdmin?: boolean;
  }>({
    queryKey: ["/api/admin/check"],
    retry: false,
    enabled: !!user,
  });

  const isAuthenticated = !!user;
  const isAdmin = adminCheck?.isAdmin || false;
  const isSuperAdmin = adminCheck?.isSuperAdmin || false;

  // Use dynamic terminology based on selected organization type
  // Defaults to business for initial render, updates when org type is selected
  const selectedOrgType = orgDetails?.organizationType || 'business';
  const terminology = getTerminology(selectedOrgType);

  // Determine if current org is e-learning for conditional banking validation
  const isElearning = selectedOrgType === 'elearning';

  // Memoized banking resolver based on organization type
  const bankingResolver = useMemo(
    () => zodResolver(isElearning ? elearningBankingSchema : baseBankingSchema),
    [isElearning]
  );

  // Step 1 Form
  const step1Form = useForm({
    resolver: zodResolver(personalInfoSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      password: '',
      confirmPassword: '',
      gamerName: '',
      positionAtOrg: '',
    },
  });

  // Step 2 Form
  const step2Form = useForm({
    resolver: zodResolver(orgDetailsSchema),
    defaultValues: {
      orgName: '',
      organizationType: 'business' as 'education' | 'business' | 'elearning',
      streetAddress: '',
      city: '',
      province: '',
      postalCode: '',
      country: 'South Africa',
      contactPhone: '',
      studentCount: 50,
      howHeardAboutUs: '',
      timezone: getActiveTimezone(),
      currency: 'ZAR' as const,
    },
  });

  // Step 3 Form
  const step3Form = useForm<z.infer<typeof structureSetupSchema>>({
    resolver: zodResolver(structureSetupSchema),
    defaultValues: {
      selectedGrades: [] as number[],
      gradeSubjects: {} as Record<string, string[]>,
      selectedDepartments: [] as string[],
      departmentUnits: {} as Record<string, string[]>,
      courseThemes: [] as string[],
    },
  });

  // Raw input buffer for course themes (to allow spaces before parsing)
  const [courseThemesRawInput, setCourseThemesRawInput] = useState('');

  // Sync raw input when navigating back to step 3 or when field value changes
  useEffect(() => {
    const currentThemes = step3Form.getValues('courseThemes');
    if (currentThemes && currentThemes.length > 0) {
      setCourseThemesRawInput(currentThemes.join(', '));
    }
  }, [currentStep, step3Form]);

  // Step 4 Form (Banking Details) - uses memoized resolver based on org type
  const step4Form = useForm<z.infer<typeof baseBankingSchema>>({
    resolver: bankingResolver,
    defaultValues: {
      bankName: '',
      accountHolderName: '',
      accountNumber: '',
      branchCode: '',
      accountType: undefined,
      saveBankingForLater: false,
    },
  });

  // Reset form validation when org type changes to clear stale errors
  useEffect(() => {
    if (currentStep === 4 && orgDetails) {
      step4Form.reset(step4Form.getValues(), { keepDefaultValues: true });
    }
  }, [isElearning, currentStep]);

  // Registration mutation
  const registerMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest('/api/org/register', {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' },
      });
    },
    onSuccess: (data) => {
      toast({
        title: 'Success!',
        description: 'Your organization has been created successfully!',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/auth/user'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/check'] });
      setLocation('/');
    },
    onError: (error: any) => {
      toast({
        title: 'Registration Failed',
        description: error.message || 'Failed to create organization. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const handleStep1Submit = (data: any) => {
    setPersonalInfo(data);
    setCurrentStep(2);
  };

  const handleStep2Submit = (data: any) => {
    setOrgDetails(data);
    // Skip step 3 (Structure Setup) for business orgs - go directly to review
    if (data.organizationType === 'business') {
      setCurrentStep(4);
    } else {
      setCurrentStep(3);
    }
  };

  const handleStep3Submit = (data: any) => {
    setStructureSetup(data);
    setCurrentStep(4);
  };

  const handleFinalSubmit = () => {
    // For e-learning orgs, validate banking details through form
    if (isElearning) {
      step4Form.handleSubmit(
        (bankingData) => {
          // Valid banking data - proceed with registration
          const { confirmPassword, ...personalData } = personalInfo;
          const finalData = {
            ...personalData,
            ...orgDetails,
            ...structureSetup,
            ...bankingData,
            bankingIntent: bankingData.saveBankingForLater ? 'deferred' : 'ready',
          };
          registerMutation.mutate(finalData);
        },
        (errors) => {
          // Form validation failed - errors already shown in UI via form state
          toast({
            title: 'Validation Error',
            description: 'Please complete all required banking details or check "Save for later"',
            variant: 'destructive',
          });
        }
      )();
    } else {
      // For education/business, banking is optional
      const { confirmPassword, ...personalData } = personalInfo;
      const bankingData = step4Form.getValues();
      const finalData = {
        ...personalData,
        ...orgDetails,
        ...structureSetup,
        ...bankingData,
      };
      registerMutation.mutate(finalData);
    }
  };

  const goToPreviousStep = () => {
    setCurrentStep((prev) => {
      // Skip step 3 when going back for business orgs
      if (prev === 4 && orgDetails?.organizationType === 'business') {
        return 2;
      }
      return Math.max(1, prev - 1);
    });
  };

  // Determine total steps based on org type (business = 3, education/elearning = 4)
  const isBusiness = orgDetails?.organizationType === 'business';
  const totalSteps = isBusiness ? 3 : 4;

  // Map current step to display step for business orgs (step 4 becomes step 3)
  const getDisplayStep = (step: number) => {
    if (isBusiness && step === 4) return 3;
    return step;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Top Navbar */}
      <PremiumHeader 
        isAuthenticated={isAuthenticated} 
        isAdmin={isAdmin} 
        isSuperAdmin={isSuperAdmin} 
        user={user} 
        isAdminLoading={adminLoading} 
      />
      
      <div className="pt-32 py-[var(--space-lg)] px-[var(--container-padding)]">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-[var(--space-lg)]"
          >
            <h1 className="text-[length:var(--text-4xl)] font-bold text-foreground mb-2">Start Your Free 30-Day Trial</h1>
            <p className="text-[length:var(--text-base)] text-muted-foreground">Set up your organization in just a few steps</p>
          </motion.div>

          {/* Progress Steps - Dynamic based on org type */}
          <div className="mb-[var(--space-lg)]">
            <div className="flex items-center justify-between max-w-2xl mx-auto overflow-x-auto px-2">
              {(isBusiness ? [1, 2, 4] : [1, 2, 3, 4]).map((step, index) => {
                const displayNumber = index + 1;
                const isCompleted = currentStep > step;
                const isCurrent = currentStep === step;
                return (
                  <div key={step} className="flex items-center flex-shrink-0">
                    <div
                      className={`w-10 h-10 sm:w-12 sm:h-12 min-w-[40px] min-h-[44px] rounded-full flex items-center justify-center font-bold transition-all touch-manipulation ${
                        isCompleted
                          ? 'bg-success text-success-foreground'
                          : isCurrent
                          ? 'bg-secondary text-secondary-foreground'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {isCompleted ? <Check className="w-5 h-5" /> : displayNumber}
                    </div>
                    {index < (isBusiness ? 2 : 3) && (
                      <div
                        className={`h-1 w-8 sm:w-16 mx-1 sm:mx-2 flex-shrink-0 ${
                          isCompleted ? 'bg-success' : 'bg-muted'
                        }`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between max-w-2xl mx-auto mt-2 px-2">
              <span className="text-[length:var(--text-xs)] text-muted-foreground">Personal</span>
              <span className="text-[length:var(--text-xs)] text-muted-foreground">Organization</span>
              {!isBusiness && (
                <span className="text-[length:var(--text-xs)] text-muted-foreground">Structure</span>
              )}
              <span className="text-[length:var(--text-xs)] text-muted-foreground">Review</span>
            </div>
          </div>

        {/* Step Content */}
        <AnimatePresence mode="wait">
          {/* Step 1: Personal Information */}
          {currentStep === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
            >
              <Card className="bg-card border-border" data-testid="card-step-1">
                <CardHeader className="p-[var(--card-padding)]">
                  <CardTitle className="text-foreground flex items-center gap-[var(--space-sm)] text-[length:var(--text-xl)]">
                    <User className="w-5 h-5" />
                    Personal Information
                  </CardTitle>
                  <CardDescription className="text-muted-foreground text-[length:var(--text-sm)]">
                    Tell us about yourself
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-[var(--card-padding)] pt-0">
                  <Form {...step1Form}>
                    <form onSubmit={step1Form.handleSubmit(handleStep1Submit)} className="space-y-[var(--space-md)]">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--space-md)]">
                        <FormField
                          control={step1Form.control}
                          name="firstName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-foreground">First Name</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder="John"
                                  className="bg-muted border-border text-foreground min-h-[44px] touch-manipulation"
                                  data-testid="input-firstName"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={step1Form.control}
                          name="lastName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-foreground">Last Name</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder="Doe"
                                  className="bg-muted border-border text-foreground min-h-[44px] touch-manipulation"
                                  data-testid="input-lastName"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={step1Form.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-foreground">Email Address</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                type="email"
                                placeholder="john@example.com"
                                className="bg-muted border-border text-foreground min-h-[44px] touch-manipulation"
                                data-testid="input-email"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--space-md)]">
                        <FormField
                          control={step1Form.control}
                          name="password"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-foreground">Password</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  type="password"
                                  placeholder="••••••••"
                                  className="bg-muted border-border text-foreground min-h-[44px] touch-manipulation"
                                  data-testid="input-password"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={step1Form.control}
                          name="confirmPassword"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-foreground">Confirm Password</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  type="password"
                                  placeholder="••••••••"
                                  className="bg-muted border-border text-foreground min-h-[44px] touch-manipulation"
                                  data-testid="input-confirmPassword"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--space-md)]">
                        <FormField
                          control={step1Form.control}
                          name="gamerName"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-foreground">Username/Gamer Name</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder="JohnDoe123"
                                  className="bg-muted border-border text-foreground min-h-[44px] touch-manipulation"
                                  data-testid="input-gamerName"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={step1Form.control}
                          name="positionAtOrg"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-foreground">Position/Role</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder="Principal, Teacher, Manager..."
                                  className="bg-muted border-border text-foreground min-h-[44px] touch-manipulation"
                                  data-testid="input-position"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="flex justify-end pt-[var(--space-md)] pb-[env(safe-area-inset-bottom)]">
                        <Button type="submit" variant="secondary" className="min-h-[48px] sm:min-h-[44px] touch-manipulation w-full sm:w-auto" data-testid="button-next-step1" >
                          Next
                          <ChevronRight className="w-4 h-4 ml-2" />
                        </Button>
                      </div>
                    </form>
                  </Form>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Step 2: Organization Details */}
          {currentStep === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
            >
              <Card className="bg-card border-border" data-testid="card-step-2">
                <CardHeader className="p-[var(--card-padding)]">
                  <CardTitle className="text-foreground flex items-center gap-[var(--space-sm)] text-[length:var(--text-xl)]">
                    <Building2 className="w-5 h-5" />
                    Organization Details
                  </CardTitle>
                  <CardDescription className="text-muted-foreground text-[length:var(--text-sm)]">
                    Tell us about your organization
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-[var(--card-padding)] pt-0">
                  <Form {...step2Form}>
                    <form onSubmit={step2Form.handleSubmit(handleStep2Submit)} className="space-y-[var(--space-md)]">
                      <FormField
                        control={step2Form.control}
                        name="orgName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-foreground">Organization Name</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                placeholder="Bryanston High School"
                                className="bg-muted border-border text-foreground min-h-[44px] touch-manipulation"
                                data-testid="input-orgName"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={step2Form.control}
                        name="organizationType"
                        render={({ field }) => (
                          <FormItem className="space-y-3">
                            <FormLabel className="text-foreground">Organization Type</FormLabel>
                            <FormControl>
                              <div className="flex flex-col sm:flex-row gap-[var(--space-md)]">
                                <div
                                  onClick={() => field.onChange('education')}
                                  className={`flex-1 p-[var(--card-padding)] rounded-lg border-2 cursor-pointer transition-all min-h-[44px] touch-manipulation ${
                                    field.value === 'education'
                                      ? 'bg-secondary/20 border-secondary'
                                      : 'bg-muted/50 border-border hover:border-muted-foreground/50'
                                  }`}
                                  data-testid="radio-org-type-education"
                                >
                                  <div className="flex items-center gap-[var(--space-sm)]">
                                    <GraduationCap className="w-6 h-6 text-primary flex-shrink-0" />
                                    <div>
                                      <div className="font-semibold text-foreground text-[length:var(--text-base)]">Education</div>
                                      <div className="text-[length:var(--text-sm)] text-muted-foreground">Schools, Universities, Tutoring</div>
                                    </div>
                                  </div>
                                </div>
                                <div
                                  onClick={() => field.onChange('business')}
                                  className={`flex-1 p-[var(--card-padding)] rounded-lg border-2 cursor-pointer transition-all min-h-[44px] touch-manipulation ${
                                    field.value === 'business'
                                      ? 'bg-secondary/20 border-secondary'
                                      : 'bg-muted/50 border-border hover:border-muted-foreground/50'
                                  }`}
                                  data-testid="radio-org-type-business"
                                >
                                  <div className="flex items-center gap-[var(--space-sm)]">
                                    <Building2 className="w-6 h-6 text-primary flex-shrink-0" />
                                    <div>
                                      <div className="font-semibold text-foreground text-[length:var(--text-base)]">Business</div>
                                      <div className="text-[length:var(--text-sm)] text-muted-foreground">Corporate Training, Teams</div>
                                    </div>
                                  </div>
                                </div>
                                <div
                                  className="flex-1 p-[var(--card-padding)] rounded-lg border-2 transition-all min-h-[44px] touch-manipulation bg-muted/40 border-border text-muted-foreground cursor-not-allowed relative"
                                  data-testid="radio-org-type-elearning"
                                >
                                  <div className="absolute -top-2 -right-2 bg-warning text-warning-foreground text-[10px] font-bold px-2 py-0.5 rounded-full shadow-sm">
                                    Coming Soon
                                  </div>
                                  <div className="flex items-center gap-[var(--space-sm)]">
                                    <BookOpen className="w-6 h-6 text-muted-foreground flex-shrink-0" />
                                    <div>
                                      <div className="font-semibold text-muted-foreground text-[length:var(--text-base)]">E-Learning</div>
                                      <div className="text-[length:var(--text-sm)] text-muted-foreground">Course Creation, Online Learning</div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--space-md)]">
                        <FormField
                          control={step2Form.control}
                          name="timezone"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-foreground">Timezone</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger className="bg-muted border-border text-foreground min-h-[44px] touch-manipulation" data-testid="select-timezone">
                                    <SelectValue placeholder="Select timezone" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {TIMEZONES.map((tz) => (
                                    <SelectItem key={tz.value} value={tz.value}>
                                      {tz.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={step2Form.control}
                          name="currency"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-foreground">Currency</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger className="bg-muted border-border text-foreground min-h-[44px] touch-manipulation" data-testid="select-currency">
                                    <SelectValue placeholder="Select currency" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="ZAR">ZAR (South African Rand)</SelectItem>
                                  <SelectItem value="USD">USD (US Dollar)</SelectItem>
                                  <SelectItem value="EUR">EUR (Euro)</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <FormField
                        control={step2Form.control}
                        name="streetAddress"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-foreground">Street Address</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                placeholder="123 Main Street"
                                className="bg-muted border-border text-foreground min-h-[44px] touch-manipulation"
                                data-testid="input-streetAddress"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--space-md)]">
                        <FormField
                          control={step2Form.control}
                          name="city"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-foreground">City</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder="Johannesburg"
                                  className="bg-muted border-border text-foreground min-h-[44px] touch-manipulation"
                                  data-testid="input-city"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={step2Form.control}
                          name="province"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-foreground">Province/State</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder="Gauteng"
                                  className="bg-muted border-border text-foreground min-h-[44px] touch-manipulation"
                                  data-testid="input-province"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--space-md)]">
                        <FormField
                          control={step2Form.control}
                          name="postalCode"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-foreground">Postal Code</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder="2000"
                                  className="bg-muted border-border text-foreground min-h-[44px] touch-manipulation"
                                  data-testid="input-postalCode"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={step2Form.control}
                          name="contactPhone"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-foreground">Contact Phone</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  placeholder="+27 11 123 4567"
                                  className="bg-muted border-border text-foreground min-h-[44px] touch-manipulation"
                                  data-testid="input-contactPhone"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--space-md)]">
                        <FormField
                          control={step2Form.control}
                          name="studentCount"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-foreground">Expected Number of {terminology.learnerPlural}</FormLabel>
                              <FormControl>
                                <Input
                                  {...field}
                                  type="number"
                                  onChange={(e) => field.onChange(parseInt(e.target.value))}
                                  className="bg-muted border-border text-foreground min-h-[44px] touch-manipulation"
                                  data-testid="input-studentCount"
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={step2Form.control}
                          name="howHeardAboutUs"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-foreground">How did you hear about us?</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger className="bg-muted border-border text-foreground min-h-[44px] touch-manipulation" data-testid="select-howHeard">
                                    <SelectValue placeholder="Select an option" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="Google Search">Google Search</SelectItem>
                                  <SelectItem value="Social Media">Social Media</SelectItem>
                                  <SelectItem value="Referral">Referral from a Friend</SelectItem>
                                  <SelectItem value="Advertisement">Advertisement</SelectItem>
                                  <SelectItem value="Educational Conference">Educational Conference</SelectItem>
                                  <SelectItem value="Other">Other</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      <div className="flex flex-col-reverse sm:flex-row justify-between gap-[var(--space-sm)] pt-[var(--space-md)] pb-[env(safe-area-inset-bottom)]">
                        <Button type="button" variant="outline" onClick={goToPreviousStep} className="min-h-[48px] sm:min-h-[44px] touch-manipulation w-full sm:w-auto" data-testid="button-back-step2" >
                          <ChevronLeft className="w-4 h-4 mr-2" />
                          Back
                        </Button>
                        <Button type="submit" variant="secondary" className="min-h-[48px] sm:min-h-[44px] touch-manipulation w-full sm:w-auto" data-testid="button-next-step2" >
                          Next
                          <ChevronRight className="w-4 h-4 ml-2" />
                        </Button>
                      </div>
                    </form>
                  </Form>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Step 3: Structure Setup */}
          {currentStep === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
            >
              <Card className="bg-card border-border" data-testid="card-step-3">
                <CardHeader className="p-[var(--card-padding)]">
                  <CardTitle className="text-foreground flex items-center gap-[var(--space-sm)] text-[length:var(--text-xl)]">
                    {orgDetails?.organizationType === 'education' ? (
                      <>
                        <GraduationCap className="w-5 h-5" />
                        Grade & Subject Setup
                      </>
                    ) : orgDetails?.organizationType === 'elearning' ? (
                      <>
                        <BookOpen className="w-5 h-5" />
                        Course Foundations
                      </>
                    ) : (
                      <>
                        <Building2 className="w-5 h-5" />
                        Department & Unit Setup
                      </>
                    )}
                  </CardTitle>
                  <CardDescription className="text-muted-foreground text-[length:var(--text-sm)]">
                    {orgDetails?.organizationType === 'education' 
                      ? 'Select grades and assign subjects'
                      : orgDetails?.organizationType === 'elearning'
                      ? 'Define initial course themes for your platform'
                      : 'Select departments and assign units'
                    }
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-[var(--card-padding)] pt-0">
                  <Form {...step3Form}>
                    <form onSubmit={step3Form.handleSubmit(handleStep3Submit)} className="space-y-[var(--space-lg)]">
                      {orgDetails?.organizationType === 'elearning' ? (
                        <>
                          {/* E-LEARNING: Course Themes */}
                          <div className="space-y-[var(--space-md)]">
                            <Label className="text-foreground text-[length:var(--text-lg)] font-semibold">Course Themes</Label>
                            <p className="text-[length:var(--text-sm)] text-muted-foreground">
                              Enter course topics separated by commas (e.g., "Introduction to AI, Web Development, Digital Marketing")
                            </p>
                            <FormField
                              control={step3Form.control}
                              name="courseThemes"
                              render={({ field }) => (
                                <FormItem>
                                  <FormControl>
                                    <Input
                                      value={courseThemesRawInput}
                                      onChange={(e) => {
                                        setCourseThemesRawInput(e.target.value);
                                      }}
                                      onBlur={() => {
                                        const themes = courseThemesRawInput
                                          .split(',')
                                          .map((t) => t.trim())
                                          .filter((t) => t.length > 0);
                                        field.onChange(themes);
                                      }}
                                      placeholder="e.g., Introduction to AI, Web Development, Digital Marketing"
                                      className="bg-muted border-border text-foreground min-h-[44px] touch-manipulation"
                                      data-testid="input-courseThemes"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </>
                      ) : orgDetails?.organizationType === 'education' ? (
                        <>
                          {/* EDUCATION: Grade Selection */}
                          <div className="space-y-[var(--space-md)]">
                            <Label className="text-foreground text-[length:var(--text-lg)] font-semibold">Select Grades</Label>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-[var(--space-sm)]">
                              {GRADES.map((grade) => (
                                <div key={grade} className="flex items-center space-x-2">
                                  <Checkbox
                                    id={`grade-${grade}`}
                                    checked={step3Form.watch('selectedGrades')?.includes(grade) || false}
                                    onCheckedChange={(checked) => {
                                      const current = step3Form.getValues('selectedGrades') || [];
                                      if (checked) {
                                        step3Form.setValue('selectedGrades', [...current, grade]);
                                        
                                        setTimeout(() => {
                                          const subjectSection = document.getElementById(`grade-subjects-${grade}`);
                                          if (subjectSection) {
                                            subjectSection.scrollIntoView({ 
                                              behavior: 'smooth', 
                                              block: 'nearest' 
                                            });
                                          }
                                        }, 100);
                                      } else {
                                        step3Form.setValue(
                                          'selectedGrades',
                                          current.filter((g) => g !== grade)
                                        );
                                      }
                                    }}
                                    className="border-border"
                                    data-testid={`checkbox-grade-${grade}`}
                                  />
                                  <label
                                    htmlFor={`grade-${grade}`}
                                    className="text-sm font-medium text-foreground cursor-pointer"
                                  >
                                    Grade {grade}
                                  </label>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* EDUCATION: Subject Assignment */}
                          {(step3Form.watch('selectedGrades')?.length || 0) > 0 && (
                            <div className="space-y-[var(--space-md)]">
                              <div className="flex items-center gap-[var(--space-sm)]">
                                <BookOpen className="w-5 h-5 text-primary" />
                                <Label className="text-foreground text-[length:var(--text-lg)] font-semibold">Assign Subjects</Label>
                              </div>
                              <p className="text-[length:var(--text-sm)] text-muted-foreground">Select subjects for each grade</p>
                              
                              <div className="space-y-[var(--space-lg)] max-h-96 overflow-y-auto pr-2">
                                {step3Form.watch('selectedGrades')?.sort((a, b) => a - b).map((grade) => (
                                  <div key={grade} id={`grade-subjects-${grade}`} className="bg-muted/50 p-[var(--card-padding)] rounded-lg">
                                    <h4 className="text-foreground font-semibold mb-[var(--space-sm)] text-[length:var(--text-base)]">Grade {grade}</h4>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--space-xs)]">
                                      {AVAILABLE_SUBJECTS.map((subject) => (
                                        <div key={`${grade}-${subject}`} className="flex items-center space-x-2">
                                          <Checkbox
                                            id={`subject-${grade}-${subject}`}
                                            checked={
                                              step3Form.watch('gradeSubjects')?.[grade.toString()]?.includes(subject) ||
                                              false
                                            }
                                            onCheckedChange={(checked) => {
                                              const currentSubjects = step3Form.getValues('gradeSubjects') || {};
                                              const gradeKey = grade.toString();
                                              const subjects = currentSubjects[gradeKey] || [];
                                              
                                              if (checked) {
                                                step3Form.setValue('gradeSubjects', {
                                                  ...currentSubjects,
                                                  [gradeKey]: [...subjects, subject],
                                                });
                                              } else {
                                                step3Form.setValue('gradeSubjects', {
                                                  ...currentSubjects,
                                                  [gradeKey]: subjects.filter((s) => s !== subject),
                                                });
                                              }
                                            }}
                                            className="border-border"
                                            data-testid={`checkbox-subject-${grade}-${subject}`}
                                          />
                                          <label
                                            htmlFor={`subject-${grade}-${subject}`}
                                            className="text-sm text-foreground cursor-pointer"
                                          >
                                            {subject}
                                          </label>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          {/* BUSINESS: Department Selection */}
                          <div className="space-y-[var(--space-md)]">
                            <Label className="text-foreground text-[length:var(--text-lg)] font-semibold">Select Departments</Label>
                            <p className="text-[length:var(--text-sm)] text-muted-foreground mb-2">
                              Note: A "General" department for organization-wide content will be automatically created for all learners.
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--space-sm)]">
                              {BUSINESS_DEPARTMENTS.filter(d => d.id !== 'general').map((dept) => (
                                <div key={dept.id} className="flex items-start space-x-2">
                                  <Checkbox
                                    id={`dept-${dept.id}`}
                                    checked={step3Form.watch('selectedDepartments')?.includes(dept.id) || false}
                                    onCheckedChange={(checked) => {
                                      const current = step3Form.getValues('selectedDepartments') || [];
                                      if (checked) {
                                        step3Form.setValue('selectedDepartments', [...current, dept.id]);
                                        
                                        setTimeout(() => {
                                          const unitSection = document.getElementById(`dept-units-${dept.id}`);
                                          if (unitSection) {
                                            unitSection.scrollIntoView({ 
                                              behavior: 'smooth', 
                                              block: 'nearest' 
                                            });
                                          }
                                        }, 100);
                                      } else {
                                        step3Form.setValue(
                                          'selectedDepartments',
                                          current.filter((d) => d !== dept.id)
                                        );
                                      }
                                    }}
                                    className="border-border mt-1"
                                    data-testid={`checkbox-department-${dept.id}`}
                                  />
                                  <label
                                    htmlFor={`dept-${dept.id}`}
                                    className="cursor-pointer flex-1"
                                  >
                                    <div className="text-sm font-medium text-foreground">{dept.name}</div>
                                    <div className="text-xs text-muted-foreground">{dept.description}</div>
                                  </label>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* BUSINESS: Unit Assignment */}
                          {(step3Form.watch('selectedDepartments')?.length || 0) > 0 && (
                            <div className="space-y-[var(--space-md)]">
                              <div className="flex items-center gap-[var(--space-sm)]">
                                <Users className="w-5 h-5 text-primary" />
                                <Label className="text-foreground text-[length:var(--text-lg)] font-semibold">Assign Units</Label>
                              </div>
                              <p className="text-[length:var(--text-sm)] text-muted-foreground">Select units for each department</p>
                              
                              <div className="space-y-[var(--space-lg)] max-h-96 overflow-y-auto pr-2">
                                {step3Form.watch('selectedDepartments')?.map((deptId) => {
                                  const dept = BUSINESS_DEPARTMENTS.find(d => d.id === deptId);
                                  if (!dept) return null;
                                  
                                  return (
                                    <div key={deptId} id={`dept-units-${deptId}`} className="bg-muted/50 p-[var(--card-padding)] rounded-lg">
                                      <h4 className="text-foreground font-semibold mb-[var(--space-sm)] text-[length:var(--text-base)]">{dept.name}</h4>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--space-xs)]">
                                        {dept.units.map((unit) => (
                                          <div key={`${deptId}-${unit}`} className="flex items-center space-x-2">
                                            <Checkbox
                                              id={`unit-${deptId}-${unit}`}
                                              checked={
                                                step3Form.watch('departmentUnits')?.[deptId]?.includes(unit) ||
                                                false
                                              }
                                              onCheckedChange={(checked) => {
                                                const currentUnits = step3Form.getValues('departmentUnits') || {};
                                                const units = currentUnits[deptId] || [];
                                                
                                                if (checked) {
                                                  step3Form.setValue('departmentUnits', {
                                                    ...currentUnits,
                                                    [deptId]: [...units, unit],
                                                  });
                                                } else {
                                                  step3Form.setValue('departmentUnits', {
                                                    ...currentUnits,
                                                    [deptId]: units.filter((u) => u !== unit),
                                                  });
                                                }
                                              }}
                                              className="border-border"
                                              data-testid={`checkbox-unit-${deptId}-${unit.toLowerCase().replace(/\s+/g, '-')}`}
                                            />
                                            <label
                                              htmlFor={`unit-${deptId}-${unit}`}
                                              className="text-sm text-foreground cursor-pointer"
                                            >
                                              {unit}
                                            </label>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </>
                      )}

                      <div className="flex flex-col-reverse sm:flex-row justify-between gap-[var(--space-sm)] pt-[var(--space-md)] pb-[env(safe-area-inset-bottom)]">
                        <Button type="button" variant="outline" onClick={goToPreviousStep} className="min-h-[48px] sm:min-h-[44px] touch-manipulation w-full sm:w-auto" data-testid="button-back-step3" >
                          <ChevronLeft className="w-4 h-4 mr-2" />
                          Back
                        </Button>
                        <Button type="submit" variant="secondary" className="min-h-[48px] sm:min-h-[44px] touch-manipulation w-full sm:w-auto" disabled={ orgDetails?.organizationType === 'education' ? (step3Form.watch('selectedGrades')?.length || 0) === 0 : orgDetails?.organizationType === 'business' ? (step3Form.watch('selectedDepartments')?.length || 0) === 0 : false } data-testid="button-next-step3" >
                          Review & Confirm
                          <ChevronRight className="w-4 h-4 ml-2" />
                        </Button>
                      </div>
                    </form>
                  </Form>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* Step 4: Review & Confirm */}
          {currentStep === 4 && (
            <motion.div
              key="step4"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
            >
              <Card className="bg-card border-border" data-testid="card-step-4">
                <CardHeader className="p-[var(--card-padding)]">
                  <CardTitle className="text-foreground flex items-center gap-[var(--space-sm)] text-[length:var(--text-xl)]">
                    <Sparkles className="w-5 h-5" />
                    Review & Confirm
                  </CardTitle>
                  <CardDescription className="text-muted-foreground text-[length:var(--text-sm)]">
                    Review your organization setup
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-[var(--space-lg)] p-[var(--card-padding)] pt-0">
                  {/* Personal Info Summary */}
                  <div className="bg-muted/50 p-[var(--card-padding)] rounded-lg">
                    <h3 className="text-foreground font-semibold mb-[var(--space-sm)] flex items-center gap-[var(--space-sm)] text-[length:var(--text-base)]">
                      <User className="w-4 h-4" />
                      Personal Information
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--space-sm)] text-[length:var(--text-sm)]">
                      <div>
                        <span className="text-muted-foreground">Name:</span>{' '}
                        <span className="text-foreground">{personalInfo?.firstName} {personalInfo?.lastName}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Email:</span>{' '}
                        <span className="text-foreground break-all">{personalInfo?.email}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Username:</span>{' '}
                        <span className="text-foreground">{personalInfo?.gamerName}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Position:</span>{' '}
                        <span className="text-foreground">{personalInfo?.positionAtOrg}</span>
                      </div>
                    </div>
                  </div>

                  {/* Organization Info Summary */}
                  <div className="bg-muted/50 p-[var(--card-padding)] rounded-lg">
                    <h3 className="text-foreground font-semibold mb-[var(--space-sm)] flex items-center gap-[var(--space-sm)] text-[length:var(--text-base)]">
                      <Building2 className="w-4 h-4" />
                      Organization Details
                    </h3>
                    <div className="grid grid-cols-1 gap-[var(--space-sm)] text-[length:var(--text-sm)]">
                      <div>
                        <span className="text-muted-foreground">Name:</span>{' '}
                        <span className="text-foreground font-medium">{orgDetails?.orgName}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Address:</span>{' '}
                        <span className="text-foreground">
                          {orgDetails?.streetAddress}, {orgDetails?.city}, {orgDetails?.province} {orgDetails?.postalCode}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--space-sm)]">
                        <div>
                          <span className="text-muted-foreground">Phone:</span>{' '}
                          <span className="text-foreground">{orgDetails?.contactPhone}</span>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Expected {terminology.learnerPlural}:</span>{' '}
                          <span className="text-foreground">{orgDetails?.studentCount}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Structure Summary - Only show for education/elearning (business skips step 3) */}
                  {orgDetails?.organizationType !== 'business' && (
                  <div className="bg-muted/50 p-[var(--card-padding)] rounded-lg">
                    {orgDetails?.organizationType === 'elearning' ? (
                      <>
                        <h3 className="text-foreground font-semibold mb-[var(--space-sm)] flex items-center gap-[var(--space-sm)] text-[length:var(--text-base)]">
                          <BookOpen className="w-4 h-4" />
                          Course Themes
                        </h3>
                        <div className="space-y-[var(--space-xs)] text-[length:var(--text-sm)]">
                          <div>
                            <span className="text-muted-foreground">Course Topics:</span>{' '}
                            <span className="text-foreground">
                              {structureSetup?.courseThemes && structureSetup.courseThemes.length > 0 
                                ? structureSetup.courseThemes.join(', ')
                                : 'None specified (can be added later)'}
                            </span>
                          </div>
                        </div>
                      </>
                    ) : (
                      <>
                        <h3 className="text-foreground font-semibold mb-[var(--space-sm)] flex items-center gap-[var(--space-sm)] text-[length:var(--text-base)]">
                          <GraduationCap className="w-4 h-4" />
                          Grade & Subject Structure
                        </h3>
                        <div className="space-y-[var(--space-xs)] text-[length:var(--text-sm)]">
                          <div>
                            <span className="text-muted-foreground">Selected Grades:</span>{' '}
                            <span className="text-foreground">
                              {structureSetup?.selectedGrades?.sort((a: number, b: number) => a - b).map((g: number) => `Grade ${g}`).join(', ')}
                            </span>
                          </div>
                          {structureSetup?.gradeSubjects && Object.keys(structureSetup.gradeSubjects).length > 0 && (
                            <div>
                              <span className="text-muted-foreground">Subjects assigned:</span>{' '}
                              <span className="text-foreground">Yes</span>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                  )}

                  {/* Banking Details for E-Learning */}
                  {orgDetails?.organizationType === 'elearning' && (
                    <div className="bg-muted/50 p-[var(--card-padding)] rounded-lg">
                      <h3 className="text-foreground font-semibold mb-[var(--space-sm)] flex items-center gap-[var(--space-sm)] text-[length:var(--text-base)]">
                        <Landmark className="w-4 h-4" />
                        Banking Details
                      </h3>
                      <p className="text-[length:var(--text-sm)] text-muted-foreground mb-[var(--space-md)]">
                        Required for receiving course payouts. Account number will be encrypted.
                      </p>
                      <Form {...step4Form}>
                        <div className="space-y-[var(--space-md)]">
                          <FormField
                            control={step4Form.control}
                            name="bankName"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-foreground">Bank Name</FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    placeholder="e.g., First National Bank"
                                    className="bg-muted border-border text-foreground min-h-[44px] touch-manipulation"
                                    data-testid="input-bankName"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={step4Form.control}
                            name="accountHolderName"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-foreground">Account Holder Name</FormLabel>
                                <FormControl>
                                  <Input
                                    {...field}
                                    placeholder="Full name on account"
                                    className="bg-muted border-border text-foreground min-h-[44px] touch-manipulation"
                                    data-testid="input-accountHolderName"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--space-md)]">
                            <FormField
                              control={step4Form.control}
                              name="accountNumber"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-foreground">Account Number</FormLabel>
                                  <FormControl>
                                    <Input
                                      {...field}
                                      placeholder="Account number"
                                      className="bg-muted border-border text-foreground min-h-[44px] touch-manipulation"
                                      data-testid="input-accountNumber"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={step4Form.control}
                              name="branchCode"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-foreground">Branch Code</FormLabel>
                                  <FormControl>
                                    <Input
                                      {...field}
                                      placeholder="Branch code"
                                      className="bg-muted border-border text-foreground min-h-[44px] touch-manipulation"
                                      data-testid="input-branchCode"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                          <FormField
                            control={step4Form.control}
                            name="accountType"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-foreground">Account Type</FormLabel>
                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                  <FormControl>
                                    <SelectTrigger className="bg-muted border-border text-foreground min-h-[44px] touch-manipulation" data-testid="select-accountType">
                                      <SelectValue placeholder="Select account type" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="business">Business</SelectItem>
                                    <SelectItem value="personal">Personal</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={step4Form.control}
                            name="saveBankingForLater"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value}
                                    onCheckedChange={field.onChange}
                                    className="border-border"
                                    data-testid="checkbox-saveBankingForLater"
                                  />
                                </FormControl>
                                <div className="space-y-1 leading-none">
                                  <FormLabel className="text-foreground cursor-pointer">
                                    Save banking details for later
                                  </FormLabel>
                                  <p className="text-sm text-muted-foreground">
                                    You can add or update these details after registration
                                  </p>
                                </div>
                              </FormItem>
                            )}
                          />
                        </div>
                      </Form>
                    </div>
                  )}

                  {/* Trial Info */}
                  <div className="bg-primary hover:bg-primary/90 border border-primary/30 p-[var(--card-padding)] rounded-lg">
                    <div className="flex items-start gap-[var(--space-sm)]">
                      <AlertCircle className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <h4 className="text-foreground font-semibold mb-1 text-[length:var(--text-base)]">30-Day Free Trial</h4>
                        <p className="text-[length:var(--text-sm)] text-muted-foreground">
                          Your trial will start immediately upon confirmation. You'll have full access to all features for 30 days.
                          No credit card required!
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col-reverse sm:flex-row justify-between gap-[var(--space-sm)] pt-[var(--space-md)] pb-[env(safe-area-inset-bottom)]">
                    <Button type="button" variant="outline" onClick={goToPreviousStep} className="min-h-[48px] sm:min-h-[44px] touch-manipulation w-full sm:w-auto" data-testid="button-back-step4" >
                      <ChevronLeft className="w-4 h-4 mr-2" />
                      Back
                    </Button>
                    <Button onClick={handleFinalSubmit} disabled={registerMutation.isPending} variant="gradient" className="min-h-[48px] sm:min-h-[44px] touch-manipulation w-full sm:w-auto" data-testid="button-submit-registration" >
                      {registerMutation.isPending ? (
                        <>Processing...</>
                      ) : (
                        <>
                          <Check className="w-4 h-4 mr-2" />
                          Create Organization
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
