import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SalesInquiryModal } from "./SalesInquiryModal";
import { SiWhatsapp } from "react-icons/si";
import { CheckCircle2, Users, Mail, MessageSquare } from "lucide-react";
import { useCurrencyPreference } from "@/hooks/useCurrencyPreference";
import { useLessonCreditCosts } from "@/hooks/useLessonCreditCosts";
import { LP_CREDITS_SHORT } from "@shared/creditConstants";
import { useAuth, canViewCredits } from "@/hooks/useAuth";

export function PricingCTA() {
  const [modalOpen, setModalOpen] = useState(false);
  const { formatPrice } = useCurrencyPreference();
  const { calculateLessonsForCredits } = useLessonCreditCosts();
  const { isTeacher, isOrgAdmin, isSuperAdmin, organizationRoles, isLoading: authLoading } = useAuth();

  if (authLoading) {
    return null;
  }

  if (!canViewCredits({ isTeacher, isOrgAdmin, isSuperAdmin, organizationRoles })) {
    return null;
  }

  // Fetch platform pricing from public endpoint
  const { data: pricingData } = useQuery<{ 
    learnerMonthlyCost: string;
    currency: string;
  }>({
    queryKey: ['/api/public/platform-pricing'],
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const learnerCost = pricingData?.learnerMonthlyCost 
    ? parseFloat(pricingData.learnerMonthlyCost).toFixed(2)
    : '8.99';

  return (
    <section className="py-16 px-4 sm:px-6 lg:px-8 bg-background">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold gradient-text mb-4">
            Start Your Free Trial Today
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Transform your classroom with gamified learning. No credit card required.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 items-center">
          <Card className="relative overflow-hidden transition-all duration-300 hover:shadow-dialog hover:-translate-y-1 border-border">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/10 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-secondary/10 rounded-full blur-3xl" />
            
            <CardContent className="p-8 relative z-10">
              <Badge className="mb-4 border-0">
                30-Day Free Trial
              </Badge>
              
              <div className="mb-6">
                <p className="text-sm font-semibold text-muted-foreground mb-2">
                  Trial Period: FREE for 30 days
                </p>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-4xl font-bold gradient-text">{formatPrice(learnerCost, 'ZAR')}</span>
                  <span className="text-muted-foreground">/learner/month</span>
                </div>
                <p className="text-xs text-muted-foreground italic">
                  After trial expires
                </p>
                <p className="text-sm text-muted-foreground mt-3">
                  No credit card required • Cancel anytime
                </p>
              </div>

              <div className="space-y-3 mb-6">
                <h4 className="text-sm font-semibold text-foreground mb-2">During Trial Period:</h4>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
                  <span className="text-sm">Limited platform access for 30 days</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
                  <span className="text-sm">Unlimited quizzes and students</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
                  <span className="text-sm">150 {LP_CREDITS_SHORT} for AI content generation ({calculateLessonsForCredits(150).textOnly.min}-{calculateLessonsForCredits(150).textOnly.max} text-only lessons)</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
                  <span className="text-sm">Organization creator can generate AI lessons</span>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
                  <span className="text-sm">Other admins can upload PPTX Lesson files for free</span>
                </div>
              </div>

              <div className="border-t border-border pt-4 mb-8">
                <h4 className="text-sm font-semibold text-foreground mb-2">After Trial (Paid Subscription):</h4>
                <div className="space-y-3">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-secondary flex-shrink-0 mt-0.5" />
                    <span className="text-sm">Instructors can use Generate Lesson Power Points</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-secondary flex-shrink-0 mt-0.5" />
                    <span className="text-sm">{LP_CREDITS_SHORT} automatically refilled monthly</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-secondary flex-shrink-0 mt-0.5" />
                    <span className="text-sm">AI-powered quiz question generation</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-secondary flex-shrink-0 mt-0.5" />
                    <span className="text-sm">Real-time leaderboards and analytics</span>
                  </div>
                </div>
              </div>

              <Button size="lg" className="w-full text-lg font-semibold" onClick={() => setModalOpen(true)}
                data-testid="button-request-information"
              >
                <MessageSquare className="mr-2 h-5 w-5" />
                Request Information
              </Button>
            </CardContent>
          </Card>

          <div className="space-y-6">
            <div className="bg-card rounded-lg p-6 border border-border transition-all duration-300 hover:shadow-elevated">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-primary/10 rounded-lg">
                  <Users className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg mb-2">Join Our Community</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Connect with educators, share best practices, and get support from our WhatsApp community.
                  </p>
                  <a
                    href="https://chat.whatsapp.com/GZEdK3Xmly99SnqDnDQsw2?mode=ems_copy_t"
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="link-whatsapp-community"
                  >
                    <Button variant="outline" className="w-full" data-testid="button-join-whatsapp-community" >
                      <SiWhatsapp className="mr-2 h-5 w-5" />
                      Join WhatsApp Community
                    </Button>
                  </a>
                </div>
              </div>
            </div>

            <div className="bg-card rounded-lg p-6 border border-border transition-all duration-300 hover:shadow-elevated">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-primary/10 rounded-lg">
                  <Mail className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-lg mb-2">Contact Sales</h3>
                  <p className="text-sm text-muted-foreground mb-2">
                    Have questions or need help getting started? Our sales team is here to help.
                  </p>
                  <a
                    href="mailto:sales@learnplay.co.za"
                    className="text-primary hover:underline font-medium text-sm"
                    data-testid="link-sales-email"
                  >
                    sales@learnplay.co.za
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <SalesInquiryModal open={modalOpen} onOpenChange={setModalOpen} />
    </section>
  );
}
