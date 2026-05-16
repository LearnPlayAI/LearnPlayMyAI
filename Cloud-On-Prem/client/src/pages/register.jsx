import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useLocation } from 'wouter';
import { Eye, EyeOff, Mail, User, Lock, Gamepad2, Building2, CheckCircle, XCircle, Loader2, HelpCircle, Clock, AlertCircle } from 'lucide-react';
import { useBranding, useBrandingCopy } from '@/contexts/BrandingContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { apiRequest } from '@/lib/queryClient';
import { registerUserSchema } from '@shared/schema';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';

// Animated background component
const AnimatedBackground = () => {
  return (
    <div className="fixed inset-0 -z-10">
      <div className="starfield"></div>
      <div className="absolute inset-0 bg-primary/5"></div>
    </div>
  );
};

// Floating game elements
const FloatingElements = () => {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden -z-5">
      <div className="absolute top-20 left-10 animate-pulse opacity-20">
        <Gamepad2 size={40} className="text-accent" />
      </div>
      <div className="absolute top-40 right-20 animate-bounce opacity-15 animation-delay-1000">
        <div className="w-12 h-16 bg-primary/30 rounded-lg border border-accent/30"></div>
      </div>
      <div className="absolute bottom-32 left-20 animate-pulse opacity-10 animation-delay-2000">
        <div className="w-8 h-12 bg-accent/40 rounded-md"></div>
      </div>
      <div className="absolute bottom-20 right-10 animate-bounce opacity-20">
        <Gamepad2 size={32} className="text-secondary" />
      </div>
    </div>
  );
};

export default function Register() {
  const [, setLocation] = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [joinCodeValidation, setJoinCodeValidation] = useState(null);
  const [isValidatingCode, setIsValidatingCode] = useState(false);
  const [availableSubjects, setAvailableSubjects] = useState([]);
  const [isFetchingSubjects, setIsFetchingSubjects] = useState(false);
  const [registrationSuccess, setRegistrationSuccess] = useState(null);
  const [errorDialog, setErrorDialog] = useState(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { branding, isOrgDomain } = useBranding();
  const { signupTitle, signupSubtitle, signupCta, signupHelper, orgName } = useBrandingCopy();
  const logoUrl = branding?.logoUrl;
  const orgInitials = orgName.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

  // Get join code from URL query parameter
  const urlParams = new URLSearchParams(window.location.search);
  const codeFromUrl = urlParams.get('code') || '';

  const form = useForm({
    resolver: zodResolver(registerUserSchema),
    defaultValues: {
      gamerName: '',
      email: '',
      password: '',
      confirmPassword: '',
      organizationCode: codeFromUrl.toUpperCase(),
      firstName: '',
      lastName: '',
      selectedSubjects: [],
    },
  });

  // Watch organization code field
  const organizationCode = form.watch('organizationCode');

  // Validate join code when user types
  useEffect(() => {
    const validateJoinCode = async () => {
      if (!organizationCode || organizationCode.length < 3) {
        setJoinCodeValidation(null);
        setAvailableSubjects([]);
        return;
      }

      setIsValidatingCode(true);
      try {
        const response = await fetch(`/api/auth/validate-join-code?code=${encodeURIComponent(organizationCode)}`);
        const data = await response.json();
        setJoinCodeValidation(data);
        
        // Fetch subjects if validation returned a unit
        if (data.valid && data.unit) {
          setIsFetchingSubjects(true);
          try {
            const subjectsResponse = await fetch(`/api/auth/subjects-for-grade?unitId=${encodeURIComponent(data.unit.id)}`);
            const subjects = await subjectsResponse.json();
            setAvailableSubjects(subjects);
          } catch (error) {
            console.error('Error fetching subjects:', error);
            setAvailableSubjects([]);
          } finally {
            setIsFetchingSubjects(false);
          }
        } else {
          setAvailableSubjects([]);
        }
      } catch (error) {
        console.error('Error validating join code:', error);
        setJoinCodeValidation(null);
        setAvailableSubjects([]);
      } finally {
        setIsValidatingCode(false);
      }
    };

    // Debounce the validation
    const timeoutId = setTimeout(validateJoinCode, 500);
    return () => clearTimeout(timeoutId);
  }, [organizationCode]);

  const registerMutation = useMutation({
    mutationFn: async (data) => {
      return await apiRequest('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    },
    onSuccess: (data) => {
      // Show success state with message
      setRegistrationSuccess(data);
      
      // Show toast notification
      toast({
        title: 'Account Created!',
        description: 'Please login to access the platform.',
      });
      
      // Redirect to login page after a delay
      setTimeout(() => {
        setLocation('/login');
      }, 3000);
    },
    onError: (error) => {
      // Show error dialog with specific message
      const errorData = error.response || {};
      const errorMessage = error.message || 'Something went wrong. Please try again.';
      const errorType = errorData.errorType || 'unknown';
      const suggestLogin = errorData.suggestLogin || false;
      
      setErrorDialog({
        message: errorMessage,
        type: errorType,
        suggestLogin: suggestLogin
      });
    },
  });

  const onSubmit = (data) => {
    registerMutation.mutate(data);
  };

  return (
    <TooltipProvider>
      <div className="min-h-screen flex items-center justify-center p-[var(--container-padding)] py-8 relative">
        <AnimatedBackground />
        <FloatingElements />
      
      <div className="w-full max-w-md relative">
        {/* Main registration card */}
        <div className="bg-card/90 backdrop-blur-xl border border-border/50 rounded-3xl p-[var(--card-padding)] sm:p-8 shadow-dialog animate-fade-in-up">
          {/* Header */}
          <div className="text-center mb-6 sm:mb-8">
            {logoUrl ? (
              <img 
                src={logoUrl} 
                alt={`${orgName} logo`}
                className="w-20 h-20 mx-auto mb-4 object-contain rounded-lg"
                data-testid="img-org-logo"
              />
            ) : (
              <div className="w-20 h-20 mx-auto mb-4 bg-primary/10 rounded-full flex items-center justify-center">
                <span className="text-2xl font-bold text-primary" data-testid="text-org-initials">
                  {orgInitials}
                </span>
              </div>
            )}
            <h1 className="text-[length:var(--text-2xl)] sm:text-[length:var(--text-3xl)] font-black text-foreground mb-2" data-testid="title-register">
              {signupTitle}
            </h1>
            <p className="text-muted-foreground text-[length:var(--text-sm)]" data-testid="text-register-subtitle">
              {signupSubtitle}
            </p>
          </div>

          {/* Success Message */}
          {registrationSuccess && (
            <Alert className="mb-6" data-testid="alert-registration-success">
              {registrationSuccess.requiresApproval ? (
                <Clock className="h-5 w-5 text-primary" />
              ) : (
                <CheckCircle className="h-5 w-5 text-primary" />
              )}
              <AlertDescription className="text-sm text-foreground">
                <div className="font-semibold mb-1">
                  {registrationSuccess.requiresApproval ? '🎉 Account Created - Pending Approval' : '🎉 Account Created Successfully!'}
                </div>
                <p className="text-xs">
                  {registrationSuccess.message}
                </p>
                {registrationSuccess.requiresApproval && (
                  <p className="text-xs mt-2 font-medium">
                    You'll receive access once an administrator approves your request. This usually happens within 24 hours.
                  </p>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Registration form */}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 sm:space-y-6" style={{ display: registrationSuccess ? 'none' : 'block' }}>
              {/* Gamer Name Field */}
              <FormField
                control={form.control}
                name="gamerName"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center gap-2">
                      <FormLabel className="text-foreground font-semibold text-[length:var(--text-sm)]">Gamer Name</FormLabel>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs">Your unique display name that will appear on leaderboards and in games. Choose something memorable!</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <FormControl>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
                        <Input
                          {...field}
                          type="text"
                          placeholder="Enter your gamer name"
                          className="pl-11 min-h-[44px] h-12 bg-background/50 border-border/50 focus:border-primary focus:ring-primary/20 touch-manipulation"
                          data-testid="input-gamer-name"
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Email Field */}
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center gap-2">
                      <FormLabel className="text-foreground font-semibold text-[length:var(--text-sm)]">Email</FormLabel>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs">Your email address will be used to sign in and receive important updates about your account.</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <FormControl>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
                        <Input
                          {...field}
                          type="email"
                          placeholder="Enter your email"
                          className="pl-11 min-h-[44px] h-12 bg-background/50 border-border/50 focus:border-primary focus:ring-primary/20 touch-manipulation"
                          data-testid="input-email"
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Password Field */}
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center gap-2">
                      <FormLabel className="text-foreground font-semibold text-[length:var(--text-sm)]">Password</FormLabel>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs">Create a strong password with at least 8 characters. Include a mix of letters, numbers, and symbols for better security.</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <FormControl>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
                        <Input
                          {...field}
                          type={showPassword ? 'text' : 'password'}
                          placeholder="Create a strong password"
                          className="pl-11 pr-11 min-h-[44px] h-12 bg-background/50 border-border/50 focus:border-primary focus:ring-primary/20 touch-manipulation"
                          data-testid="input-password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center touch-manipulation"
                          data-testid="button-toggle-password"
                        >
                          {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Confirm Password Field */}
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center gap-2">
                      <FormLabel className="text-foreground font-semibold text-[length:var(--text-sm)]">Confirm Password</FormLabel>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs">Re-enter your password to make sure you've typed it correctly.</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <FormControl>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
                        <Input
                          {...field}
                          type={showConfirmPassword ? 'text' : 'password'}
                          placeholder="Confirm your password"
                          className="pl-11 pr-11 min-h-[44px] h-12 bg-background/50 border-border/50 focus:border-primary focus:ring-primary/20 touch-manipulation"
                          data-testid="input-confirm-password"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center touch-manipulation"
                          data-testid="button-toggle-confirm-password"
                        >
                          {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                        </button>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Organization Code Field (Optional) */}
              <FormField
                control={form.control}
                name="organizationCode"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center gap-2">
                      <FormLabel className="text-foreground font-semibold text-[length:var(--text-sm)]">Organization Code (Optional)</FormLabel>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs">Enter the join code provided by your school or organization to automatically join your class or group.</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <FormControl>
                      <div className="relative">
                        <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
                        <Input
                          {...field}
                          onChange={(e) => {
                            field.onChange(e.target.value.toUpperCase());
                          }}
                          type="text"
                          placeholder="Enter organization/grade/class code"
                          className="pl-11 pr-11 min-h-[44px] h-12 bg-background/50 border-border/50 focus:border-primary focus:ring-primary/20 touch-manipulation"
                          data-testid="input-organization-code"
                          maxLength={50}
                        />
                        {isValidatingCode && (
                          <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5 animate-spin" />
                        )}
                        {!isValidatingCode && joinCodeValidation?.valid && (
                          <CheckCircle className="absolute right-3 top-1/2 transform -translate-y-1/2 text-primary w-5 h-5" />
                        )}
                        {!isValidatingCode && joinCodeValidation && !joinCodeValidation.valid && organizationCode.length >= 3 && (
                          <XCircle className="absolute right-3 top-1/2 transform -translate-y-1/2 text-destructive w-5 h-5" />
                        )}
                      </div>
                    </FormControl>
                    <FormMessage />
                    
                    {/* Validation result display */}
                    {joinCodeValidation?.valid && (
                      <Alert className="mt-2" data-testid="alert-join-code-valid">
                        <CheckCircle className="h-4 w-4 text-primary" />
                        <AlertDescription className="text-sm text-foreground">
                          <div className="font-semibold">
                            You will join: {joinCodeValidation.organization.name}
                          </div>
                          {joinCodeValidation.unit && (
                            <div className="text-xs mt-1">
                              {joinCodeValidation.terminology?.unit || 'Unit'}: {joinCodeValidation.unit.name}
                            </div>
                          )}
                          {joinCodeValidation.subUnit && (
                            <div className="text-xs">
                              {joinCodeValidation.terminology?.subUnit || 'SubUnit'}: {joinCodeValidation.subUnit.name}
                            </div>
                          )}
                          {joinCodeValidation.team && (
                            <div className="text-xs">
                              {joinCodeValidation.terminology?.team || 'Team'}: {joinCodeValidation.team.name}
                            </div>
                          )}
                        </AlertDescription>
                      </Alert>
                    )}
                    
                    {!joinCodeValidation?.valid && organizationCode.length >= 3 && !isValidatingCode && (
                      <p className="text-xs text-destructive mt-1">
                        Invalid code. Please check and try again.
                      </p>
                    )}
                    
                    {!organizationCode && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Have a join code from your school or company? Enter it here.
                      </p>
                    )}
                  </FormItem>
                )}
              />

              {/* First Name Field - Required for all users */}
              <FormField
                control={form.control}
                name="firstName"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center gap-2">
                      <FormLabel className="text-foreground font-semibold text-[length:var(--text-sm)]">First Name</FormLabel>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs">Your first name helps teachers and other players identify you in the game.</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <FormControl>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
                        <Input
                          {...field}
                          type="text"
                          placeholder="Enter your first name"
                          className="pl-11 min-h-[44px] h-12 bg-background/50 border-border/50 focus:border-primary focus:ring-primary/20 touch-manipulation"
                          data-testid="input-first-name"
                        />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Last Name Field - Required for all users */}
              <FormField
                control={form.control}
                name="lastName"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center gap-2">
                      <FormLabel className="text-foreground font-semibold text-[length:var(--text-sm)]">Last Name</FormLabel>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="max-w-xs">Your last name helps teachers and other players identify you in the game.</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                    <FormControl>
                      <div className="relative">
                        <User className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5" />
                        <Input
                          {...field}
                          type="text"
                          placeholder="Enter your last name"
                            className="pl-11 min-h-[44px] h-12 bg-background/50 border-border/50 focus:border-primary focus:ring-primary/20 touch-manipulation"
                            data-testid="input-last-name"
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

              {/* Subject Selection - Shows when subjects are available (only for education orgs, not business) */}
              {joinCodeValidation?.valid && availableSubjects.length > 0 && joinCodeValidation?.organization?.type !== 'business' && (
                <FormField
                  control={form.control}
                  name="selectedSubjects"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center gap-2">
                        <FormLabel className="text-foreground font-semibold">Select Your Subjects</FormLabel>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="max-w-xs">Choose at least one subject you're enrolled in. You can always add or remove subjects later from your profile.</p>
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <FormControl>
                        <div className="space-y-2 mt-2">
                          {isFetchingSubjects && (
                            <div className="flex items-center justify-center py-4">
                              <Loader2 className="w-5 h-5 animate-spin text-foreground/60" />
                              <span className="ml-2 text-sm text-muted-foreground">Loading subjects...</span>
                            </div>
                          )}
                          {!isFetchingSubjects && availableSubjects.map((subject) => (
                            <label
                              key={subject.subjectId}
                              className="flex items-center space-x-3 p-3 rounded-lg border border-border/50 bg-background/30 hover:bg-background/50 cursor-pointer transition-colors"
                              data-testid={`label-subject-${subject.subjectId}`}
                            >
                              <input
                                type="checkbox"
                                value={subject.subjectId}
                                checked={field.value?.includes(subject.subjectId)}
                                onChange={(e) => {
                                  const currentValue = field.value || [];
                                  if (e.target.checked) {
                                    field.onChange([...currentValue, subject.subjectId]);
                                  } else {
                                    field.onChange(currentValue.filter(id => id !== subject.subjectId));
                                  }
                                }}
                                className="w-4 h-4 text-primary border-border rounded focus:ring-primary focus:ring-offset-0"
                                data-testid={`checkbox-subject-${subject.subjectId}`}
                              />
                              <span className="text-foreground">{subject.subjectName}</span>
                            </label>
                          ))}
                        </div>
                      </FormControl>
                      <FormMessage />
                      <p className="text-xs text-muted-foreground mt-2">
                        Select at least one subject you're enrolled in
                      </p>
                    </FormItem>
                  )}
                />
              )}

              {/* Submit Button */}
              <Button type="submit" disabled={registerMutation.isPending} className="w-full min-h-[44px] h-12 text-base sm:text-lg font-bold touch-manipulation" data-testid="button-register" >
                {registerMutation.isPending ? 'Creating Account...' : signupCta}
              </Button>
            </form>
          </Form>

          {/* Login link or Home button */}
          {registrationSuccess ? (
            <div className="text-center mt-6">
              <Button onClick={() => setLocation('/')}
                className="w-full min-h-[44px] touch-manipulation"
                data-testid="button-go-home"
              >
                Go to Home
              </Button>
              <p className="text-xs text-muted-foreground mt-3">
                Redirecting automatically in a few seconds...
              </p>
            </div>
          ) : (
            <div className="text-center mt-6">
              <p className="text-foreground/80 text-[length:var(--text-sm)]">
                {signupHelper}{' '}
                <Link 
                  href="/login" 
                  className="text-primary hover:text-primary/90 font-semibold transition-colors inline-block py-1 touch-manipulation underline-offset-2 hover:underline"
                  data-testid="link-login"
                >
                  Sign In
                </Link>
              </p>
            </div>
          )}
        </div>

        {/* Back to landing link */}
        <div className="text-center mt-6">
          <Link 
            href="/" 
            className="text-muted-foreground hover:text-foreground transition-colors text-[length:var(--text-sm)] inline-block py-2 touch-manipulation underline-offset-2 hover:underline"
            data-testid="link-home"
          >
            ← Back
          </Link>
        </div>
      </div>
      
      {/* Error Dialog */}
      <AlertDialog open={!!errorDialog} onOpenChange={() => setErrorDialog(null)}>
        <AlertDialogContent className="max-w-md mx-4 p-[var(--dialog-padding)]">
          <AlertDialogHeader>
            <div className="flex flex-col sm:flex-row items-center gap-3 mb-2">
              <div className="p-2 rounded-full bg-destructive/10 flex-shrink-0">
                <AlertCircle className="h-6 w-6 text-destructive" />
              </div>
              <AlertDialogTitle className="text-lg sm:text-xl text-center sm:text-left">Registration Error</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-[length:var(--text-base)] leading-relaxed pt-2">
              {errorDialog?.message}
            </AlertDialogDescription>
            
            {errorDialog?.type === 'gamer_name_taken' && (
              <div className="mt-4 p-3 bg-muted/50 rounded-lg border border-border">
                <p className="text-sm font-medium text-foreground mb-1">💡 Suggestion:</p>
                <p className="text-sm text-muted-foreground">
                  Try adding numbers, your birth year, or a nickname to make your gamer name unique.
                </p>
              </div>
            )}
            
            {errorDialog?.type === 'email_taken' && !errorDialog?.suggestLogin && (
              <div className="mt-4 p-3 bg-muted/50 rounded-lg border border-border">
                <p className="text-sm font-medium text-foreground mb-1">💡 Suggestion:</p>
                <p className="text-sm text-muted-foreground">
                  Use a different email address or login to your existing account instead.
                </p>
              </div>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            {errorDialog?.suggestLogin ? (
              <>
                <AlertDialogAction
                  onClick={() => {
                    setErrorDialog(null);
                    setLocation('/login');
                  }}
                  className="bg-primary hover:bg-primary/90 min-h-[44px] touch-manipulation"
                  data-testid="button-go-to-login"
                >
                  Go to Login
                </AlertDialogAction>
                <AlertDialogAction
                  onClick={() => setErrorDialog(null)}
                  className="bg-muted hover:bg-muted/80 text-foreground min-h-[44px] touch-manipulation"
                  data-testid="button-close-error"
                >
                  Close
                </AlertDialogAction>
              </>
            ) : (
              <AlertDialogAction
                onClick={() => setErrorDialog(null)}
                className="w-full sm:w-auto min-h-[44px] touch-manipulation"
                data-testid="button-close-error"
              >
                Try Again
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
    </TooltipProvider>
  );
}
