import { Switch, Route, Link, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { Toaster } from "@/components/ui/toaster";
import { OrganizationProvider } from "@/contexts/OrganizationContext";
import { BrandingProvider } from "@/contexts/BrandingContext";
import { TimezoneBootstrap } from "@/components/TimezoneBootstrap";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Landing from "@/pages/landing";
import Login from "@/pages/login";
import Register from "@/pages/register";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import VerifyEmail from "@/pages/verify-email";
import ProfilePage from "@/pages/ProfilePage";
import GameHistory from "@/pages/GameHistory";
import AdminDashboard from "@/pages/AdminDashboard";
import AdminCollections from "@/pages/AdminCollections";
import AdminCards from "@/pages/AdminCards";
import CollectionsManager from "@/pages/CollectionsManager";
import CardsManager from "@/pages/CardsManager";
import GameLobby from "@/pages/GameLobby";
import GameRoom from "@/pages/GameRoom";
import GamePlay from "@/pages/GamePlay";
import SinglePlayer from "@/pages/SinglePlayer";
import MultiPlayer1v1 from "@/pages/MultiPlayer1v1";
import Leaderboard from "@/pages/Leaderboard";
import QuizLeaderboard from "@/pages/QuizLeaderboard";
import CustomStatUnits from "@/pages/CustomStatUnits";
import SuperAdmin from "@/pages/SuperAdmin";
import QuizLobby from "@/pages/QuizLobby";
import QuizSinglePlayer from "@/pages/QuizSinglePlayer";
import Quiz1v1 from "@/pages/Quiz1v1";
import QuizCardManager from "@/pages/QuizCardManager";
import OrgStructureManager from "@/pages/OrgStructureManager";
import OrgManagementHub from "@/pages/OrgManagementHub";
import OrgUserDetail from "@/pages/OrgUserDetail";
import GradesManager from "@/pages/GradesManager";
import Reports from "@/pages/Reports";
import StudentDashboard from "@/pages/StudentDashboard";
import TeacherDashboard from "@/pages/TeacherDashboard";
import OrgAdminDashboard from "@/pages/OrgAdminDashboard";
import ThemeEditor from "@/pages/ThemeEditor";
import UserManagement from "@/pages/UserManagement";
import UnifiedManagementHub from "@/pages/UnifiedManagementHub";
import IntegrationSettings from "@/pages/IntegrationSettings";
import SystemChanges from "@/pages/SystemChanges";
import QuizWizard from "@/pages/QuizWizard";
import SalesInquiries from "@/pages/SalesInquiries";
import OrgRegistrationWizard from "@/pages/OrgRegistrationWizard";
import OrganizationAnalytics from "@/pages/OrganizationAnalytics";
import JoinRequests from "@/pages/JoinRequests";
import BillingDashboard from "@/pages/BillingDashboard";
import BillingAuditLog from "@/pages/BillingAuditLog";
import GamificationSettings from "@/pages/GamificationSettings";
import SubscriptionManagement from "@/pages/SubscriptionManagement";
import CreditPurchase from "@/pages/CreditPurchase";
import InvoiceHistory from "@/pages/InvoiceHistory";
import WebhookAdmin from "@/pages/WebhookAdmin";
import LessonWizard from "@/pages/LessonWizard";
import LessonViewer from "@/pages/LessonViewer";
import LessonContentStudio from "@/pages/LessonContentStudio";
import LessonPodcastWizard from "@/pages/LessonPodcastWizard";
import LessonCredits from "@/pages/LessonCredits";
import GammaThemes from "@/pages/GammaThemes";
import PlatformPricing from "@/pages/PlatformPricing";
import BuyCredits from "@/pages/BuyCredits";
import CertificateGallery from "@/pages/CertificateGallery";
import BrowseCourses from "@/pages/BrowseCourses";
import CourseDetail from "@/pages/CourseDetail";
import DemoLessonViewer from "@/pages/DemoLessonViewer";
import CoursePurchase from "@/pages/CoursePurchase";
import CoursePurchaseSuccess from "@/pages/CoursePurchaseSuccess";
import MyCourses from "@/pages/MyCourses";
import CourseRating from "@/pages/CourseRating";
import NotificationCenter from "@/pages/NotificationCenter";
import PurchaseHistory from "@/pages/PurchaseHistory";
import CourseBuilder from "@/pages/CourseBuilder";
import CourseFrameworkWizard from "@/pages/CourseFrameworkWizard";
import CourseDocumentWizard from "@/pages/CourseDocumentWizard";
import CourseEdit from "@/pages/CourseEdit";
import CourseLessons from "@/pages/CourseLessons";
import CourseBuilderUpload from "@/pages/CourseBuilderUpload";
import CoursePreview from "@/pages/CoursePreview";
import SourceIntelligenceSettings from "@/pages/SourceIntelligenceSettings";
import OrgRevenueDashboard from "@/pages/OrgRevenueDashboard";
import OrgSalesDashboard from "@/pages/OrgSalesDashboard";
import PayoutManagement from "@/pages/PayoutManagement";
import MarketplaceRevenue from "@/pages/MarketplaceRevenue";
import CurrencyManagement from "@/pages/CurrencyManagement";
import PlatformConfiguration from "@/pages/PlatformConfiguration";
import RevenueAnalyticsDashboard from "@/pages/RevenueAnalyticsDashboard";
import SubscriptionAdminConsole from "@/pages/SubscriptionAdminConsole";
import SuperAdminImpersonate from "@/pages/SuperAdminImpersonate";
import CourseRefunds from "@/pages/CourseRefunds";
import CourseReviewsAdmin from "@/pages/CourseReviewsAdmin";
import PlatformRevenueReports from "@/pages/PlatformRevenueReports";
import CourseAssignments from "@/pages/CourseAssignments";
import TranslateLesson from "@/pages/TranslateLesson";
import OrgCreditUsageReportPage from "@/pages/OrgCreditUsageReportPage";
import NotAuthorized from "@/pages/NotAuthorized";
import CustSuperPricing from "@/pages/CustSuperPricing";
import CustSuperCredits from "@/pages/CustSuperCredits";
import OnPremEnrollmentManagement from "@/pages/OnPremEnrollmentManagement";
import OnPremLicenseManagement from "@/pages/OnPremLicenseManagement";
import DemoDataManager from "@/pages/DemoDataManager";
import InterOrgConfig from "@/pages/InterOrgConfig";
import OrgPackageOverrides from "@/pages/admin/OrgPackageOverrides";
import EnterpriseManagement from "@/pages/admin/EnterpriseManagement";
import EnterpriseCustomerDetails from "@/pages/admin/EnterpriseCustomerDetails";
import EnterpriseCustomerEdit from "@/pages/admin/EnterpriseCustomerEdit";
import EnterpriseCustomerDelete from "@/pages/admin/EnterpriseCustomerDelete";
import EnterpriseBuildUpload from "@/pages/admin/EnterpriseBuildUpload";
import EnterpriseLicenseReview from "@/pages/admin/EnterpriseLicenseReview";
import EnterpriseAgreementUpload from "@/pages/admin/EnterpriseAgreementUpload";
import AuthenticatedHome from "@/pages/AuthenticatedHome";
import { JoinRequestStatusBanner } from "@/components/JoinRequestStatusBanner";
import { UnlicensedSystemBanner } from "@/components/UnlicensedSystemBanner";
import { JoinRequestDeniedModal } from "@/components/JoinRequestDeniedModal";
import EnterpriseDashboard from "@/pages/EnterpriseDashboard";
import EnterpriseProfile from "@/pages/EnterpriseProfile";
import EnterpriseSubCompanies from "@/pages/EnterpriseSubCompanies";
import EnterpriseDocuments from "@/pages/EnterpriseDocuments";
import EnterpriseBuilds from "@/pages/EnterpriseBuilds";
import EnterpriseLicenses from "@/pages/EnterpriseLicenses";
import EnterpriseAgreements from "@/pages/EnterpriseAgreements";
import EnterpriseKeys from "@/pages/EnterpriseKeys";
import EnterpriseSystems from "@/pages/EnterpriseSystems";
import NotFound from "@/pages/not-found";
import { useAuth } from "@/hooks/useAuth";

function LessonsEntryRedirect() {
  const { isLoading, isTeacher, isOrgAdmin, isSuperAdmin } = useAuth();

  if (isLoading) return null;

  if (isTeacher || isOrgAdmin || isSuperAdmin) {
    return <Redirect to="/course-builder" />;
  }

  return <Redirect to="/my-courses" />;
}

function QuizDraftsEntryRedirect() {
  return <Redirect to="/course-builder" />;
}

function QuizQuestionEditorEntryGate() {
  const search = typeof window !== "undefined" ? window.location.search : "";
  const params = new URLSearchParams(search);
  const hasQuizContext = !!(params.get("quizId") || params.get("collection"));

  if (!hasQuizContext) {
    return <Redirect to="/course-builder" />;
  }

  return <QuizCardManager />;
}

function Router() {
  return (
    <Switch>
      {/* Public routes - no authentication required */}
      <Route path="/" component={Landing} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/reset-password" component={ResetPassword} />
      <Route path="/verify-email" component={VerifyEmail} />
      <Route path="/org-registration" component={OrgRegistrationWizard} />
      <Route path="/browse-courses" component={BrowseCourses} />
      <Route path="/browse"><Redirect to="/browse-courses" /></Route>
      <Route path="/courses/:id" component={CourseDetail} />
      <Route path="/demo-lesson/:courseId/:lessonId" component={DemoLessonViewer} />
      <Route path="/leaderboard" component={Leaderboard} />
      <Route path="/quiz-leaderboard" component={QuizLeaderboard} />
      <Route path="/not-authorized" component={NotAuthorized} />

      {/* Enterprise Portal routes */}
      <Route path="/enterprise/login"><Redirect to="/login" /></Route>
      <Route path="/enterprise/register"><Redirect to="/login" /></Route>
      <Route path="/enterprise/verify-email"><Redirect to="/login" /></Route>
      <Route path="/enterprise/forgot-password"><Redirect to="/login" /></Route>
      <Route path="/enterprise/reset-password"><Redirect to="/login" /></Route>
      <Route path="/enterprise/dashboard" component={EnterpriseDashboard} />
      <Route path="/enterprise/profile" component={EnterpriseProfile} />
      <Route path="/enterprise/sub-companies" component={EnterpriseSubCompanies} />
      <Route path="/enterprise/documents" component={EnterpriseDocuments} />
      <Route path="/enterprise/builds" component={EnterpriseBuilds} />
      <Route path="/enterprise/licenses" component={EnterpriseLicenses} />
      <Route path="/enterprise/agreements" component={EnterpriseAgreements} />
      <Route path="/enterprise/keys" component={EnterpriseKeys} />
      <Route path="/enterprise/systems" component={EnterpriseSystems} />

      {/* Role-based redirect route for authenticated users */}
      <Route path="/home">{() => <ProtectedRoute allowedRoles={['authenticated']}><AuthenticatedHome /></ProtectedRoute>}</Route>

      {/* SuperAdmin only routes */}
      <Route path="/super-admin">{() => <ProtectedRoute allowedRoles={['superadmin']}><SuperAdmin /></ProtectedRoute>}</Route>
      <Route path="/superadmin/payouts">{() => <ProtectedRoute allowedRoles={['superadmin']}><PayoutManagement /></ProtectedRoute>}</Route>
      <Route path="/superadmin/currency">{() => <ProtectedRoute allowedRoles={['superadmin']}><CurrencyManagement /></ProtectedRoute>}</Route>
      <Route path="/superadmin/config">{() => <ProtectedRoute allowedRoles={['superadmin']}><PlatformConfiguration /></ProtectedRoute>}</Route>
      <Route path="/superadmin/impersonate">{() => <ProtectedRoute allowedRoles={['superadmin']}><SuperAdminImpersonate /></ProtectedRoute>}</Route>
      <Route path="/superadmin/platform-revenue">{() => <ProtectedRoute allowedRoles={['superadmin', 'custsuper']}><PlatformRevenueReports /></ProtectedRoute>}</Route>
      <Route path="/organization-analytics">{() => <ProtectedRoute allowedRoles={['superadmin', 'custsuper']}><OrganizationAnalytics /></ProtectedRoute>}</Route>
      <Route path="/webhooks">{() => <ProtectedRoute allowedRoles={['superadmin']}><WebhookAdmin /></ProtectedRoute>}</Route>
      <Route path="/sales-inquiries">{() => <ProtectedRoute allowedRoles={['superadmin']}><SalesInquiries /></ProtectedRoute>}</Route>
      <Route path="/admin/e-learning-revenue">{() => <ProtectedRoute allowedRoles={['superadmin', 'custsuper']}><OrgRevenueDashboard /></ProtectedRoute>}</Route>
      <Route path="/payout-management">{() => <ProtectedRoute allowedRoles={['superadmin']}><PayoutManagement /></ProtectedRoute>}</Route>
      <Route path="/reports">{() => <ProtectedRoute allowedRoles={['superadmin', 'orgadmin', 'teacher']}><Reports /></ProtectedRoute>}</Route>
      <Route path="/admin/platform-pricing">{() => <ProtectedRoute allowedRoles={['superadmin']}><PlatformPricing view="pricing" /></ProtectedRoute>}</Route>
      <Route path="/admin/payment-integration">{() => <ProtectedRoute allowedRoles={['superadmin']}><Redirect to="/admin/integration-settings" /></ProtectedRoute>}</Route>
      <Route path="/gamma-themes">{() => <ProtectedRoute allowedRoles={['superadmin', 'custsuper']}><GammaThemes /></ProtectedRoute>}</Route>
      <Route path="/admin/gamification-settings">{() => <ProtectedRoute allowedRoles={['superadmin', 'custsuper']}><GamificationSettings /></ProtectedRoute>}</Route>
      <Route path="/ai-settings">{() => <ProtectedRoute allowedRoles={['superadmin', 'custsuper']}><Redirect to="/admin/integration-settings" /></ProtectedRoute>}</Route>
      <Route path="/admin/integration-settings">{() => <ProtectedRoute allowedRoles={['superadmin', 'custsuper']}><IntegrationSettings /></ProtectedRoute>}</Route>
      <Route path="/admin/system-changes">{() => <ProtectedRoute allowedRoles={['superadmin', 'custsuper']}><SystemChanges /></ProtectedRoute>}</Route>
      <Route path="/lesson-credits">{() => <ProtectedRoute allowedRoles={['superadmin', 'custsuper']}><LessonCredits /></ProtectedRoute>}</Route>
      <Route path="/admin/demo-data">{() => <ProtectedRoute allowedRoles={['superadmin', 'custsuper']}><DemoDataManager /></ProtectedRoute>}</Route>
      <Route path="/collections-manager">{() => <ProtectedRoute allowedRoles={['superadmin']}><CollectionsManager /></ProtectedRoute>}</Route>
      <Route path="/cards-manager">{() => <ProtectedRoute allowedRoles={['superadmin']}><CardsManager /></ProtectedRoute>}</Route>
      <Route path="/admin/package-overrides">{() => <ProtectedRoute allowedRoles={['superadmin']}><OrgPackageOverrides /></ProtectedRoute>}</Route>
      <Route path="/superadmin/enterprise">{() => <ProtectedRoute allowedRoles={['superadmin']}><EnterpriseManagement /></ProtectedRoute>}</Route>
      <Route path="/superadmin/enterprise/customer/:id">{() => <ProtectedRoute allowedRoles={['superadmin']}><EnterpriseCustomerDetails /></ProtectedRoute>}</Route>
      <Route path="/superadmin/enterprise/customer/:id/edit">{() => <ProtectedRoute allowedRoles={['superadmin']}><EnterpriseCustomerEdit /></ProtectedRoute>}</Route>
      <Route path="/superadmin/enterprise/customer/:id/delete">{() => <ProtectedRoute allowedRoles={['superadmin']}><EnterpriseCustomerDelete /></ProtectedRoute>}</Route>
      <Route path="/superadmin/enterprise/builds/new">{() => <ProtectedRoute allowedRoles={['superadmin']}><EnterpriseBuildUpload /></ProtectedRoute>}</Route>
      <Route path="/superadmin/enterprise/license-requests/:id/review">{() => <ProtectedRoute allowedRoles={['superadmin']}><EnterpriseLicenseReview /></ProtectedRoute>}</Route>
      <Route path="/superadmin/enterprise/agreements/new">{() => <ProtectedRoute allowedRoles={['superadmin']}><EnterpriseAgreementUpload /></ProtectedRoute>}</Route>

      {/* CustSuper routes (also accessible by SuperAdmin) */}
      <Route path="/custsuper/manage-pricing">{() => <ProtectedRoute allowedRoles={['custsuper']}><CustSuperPricing /></ProtectedRoute>}</Route>
      <Route path="/custsuper/manage-credits">{() => <ProtectedRoute allowedRoles={['custsuper']}><CustSuperCredits /></ProtectedRoute>}</Route>
      <Route path="/admin/enrollment-management">{() => <ProtectedRoute allowedRoles={['superadmin', 'custsuper']}><OnPremEnrollmentManagement /></ProtectedRoute>}</Route>
      <Route path="/custsuper/interorg-config">{() => <ProtectedRoute allowedRoles={['custsuper']}><InterOrgConfig /></ProtectedRoute>}</Route>
      <Route path="/custsuper/license-management">{() => <ProtectedRoute allowedRoles={['custsuper', 'superadmin']}><OnPremLicenseManagement /></ProtectedRoute>}</Route>

      {/* OrgAdmin routes (also accessible by SuperAdmin) */}
      <Route path="/organizations/:id/subscription">{() => <ProtectedRoute allowedRoles={['orgadmin', 'superadmin']}><SubscriptionManagement /></ProtectedRoute>}</Route>
      <Route path="/org-admin-dashboard">{() => <ProtectedRoute allowedRoles={['orgadmin']}><OrgAdminDashboard /></ProtectedRoute>}</Route>
      <Route path="/org-admin">{() => <ProtectedRoute allowedRoles={['orgadmin']}><OrgAdminDashboard /></ProtectedRoute>}</Route>
      <Route path="/theme-editor">{() => <ProtectedRoute allowedRoles={['superadmin', 'custsuper', 'orgadmin']}><ThemeEditor /></ProtectedRoute>}</Route>
      <Route path="/source-intelligence">{() => <ProtectedRoute allowedRoles={['superadmin', 'custsuper', 'orgadmin']}><SourceIntelligenceSettings /></ProtectedRoute>}</Route>
      <Route path="/join-requests">{() => <ProtectedRoute allowedRoles={['orgadmin']}><JoinRequests /></ProtectedRoute>}</Route>
      <Route path="/course-refunds">{() => <ProtectedRoute allowedRoles={['orgadmin']}><CourseRefunds /></ProtectedRoute>}</Route>
      <Route path="/admin/course-reviews">{() => <ProtectedRoute allowedRoles={['superadmin', 'custsuper', 'orgadmin', 'teacher']}><CourseReviewsAdmin /></ProtectedRoute>}</Route>
      <Route path="/org-credit-usage">{() => <ProtectedRoute allowedRoles={['orgadmin']}><OrgCreditUsageReportPage /></ProtectedRoute>}</Route>
      <Route path="/billing">{() => <ProtectedRoute allowedRoles={['orgadmin']}><BillingDashboard /></ProtectedRoute>}</Route>
      <Route path="/billing/audit-log">{() => <ProtectedRoute allowedRoles={['orgadmin']}><BillingAuditLog /></ProtectedRoute>}</Route>
      <Route path="/user-management">{() => <ProtectedRoute allowedRoles={['orgadmin']}><UserManagement /></ProtectedRoute>}</Route>
      <Route path="/management-hub">{() => <ProtectedRoute allowedRoles={['orgadmin', 'teacher']}><UnifiedManagementHub /></ProtectedRoute>}</Route>
      <Route path="/org-structure">{() => <ProtectedRoute allowedRoles={['orgadmin', 'teacher']}><OrgStructureManager /></ProtectedRoute>}</Route>
      <Route path="/org-management">{() => <ProtectedRoute allowedRoles={['orgadmin', 'teacher']}><OrgManagementHub /></ProtectedRoute>}</Route>
      <Route path="/organization/:orgId/users/:userId">{() => <ProtectedRoute allowedRoles={['orgadmin', 'teacher']}><OrgUserDetail /></ProtectedRoute>}</Route>
      <Route path="/marketplace-revenue">{() => <ProtectedRoute allowedRoles={['orgadmin']}><MarketplaceRevenue /></ProtectedRoute>}</Route>
      <Route path="/admin/sales-dashboard">{() => <ProtectedRoute allowedRoles={['orgadmin']}><OrgSalesDashboard /></ProtectedRoute>}</Route>
      <Route path="/admin">{() => <ProtectedRoute allowedRoles={['orgadmin']}><AdminDashboard /></ProtectedRoute>}</Route>
      <Route path="/admin/collections">{() => <ProtectedRoute allowedRoles={['orgadmin']}><AdminCollections /></ProtectedRoute>}</Route>
      <Route path="/admin/cards">{() => <ProtectedRoute allowedRoles={['orgadmin']}><AdminCards /></ProtectedRoute>}</Route>
      <Route path="/admin/revenue-analytics">{() => <ProtectedRoute allowedRoles={['superadmin']}><RevenueAnalyticsDashboard /></ProtectedRoute>}</Route>
      <Route path="/admin/subscription-console">{() => <ProtectedRoute allowedRoles={['superadmin']}><SubscriptionAdminConsole /></ProtectedRoute>}</Route>

      {/* Teacher+ routes (also accessible by OrgAdmin, SuperAdmin) */}
      <Route path="/teacher">{() => <ProtectedRoute allowedRoles={['teacher']}><TeacherDashboard /></ProtectedRoute>}</Route>
      <Route path="/teacher-dashboard">{() => <ProtectedRoute allowedRoles={['teacher']}><TeacherDashboard /></ProtectedRoute>}</Route>
      <Route path="/quiz-wizard">{() => <ProtectedRoute allowedRoles={['teacher']}><QuizWizard /></ProtectedRoute>}</Route>
      <Route path="/quiz-wizard/:id">{() => <ProtectedRoute allowedRoles={['teacher']}><QuizWizard /></ProtectedRoute>}</Route>
      <Route path="/quiz-drafts">{() => <ProtectedRoute allowedRoles={['teacher']}><QuizDraftsEntryRedirect /></ProtectedRoute>}</Route>
      <Route path="/quiz-card-manager">{() => <ProtectedRoute allowedRoles={['teacher']}><QuizQuestionEditorEntryGate /></ProtectedRoute>}</Route>
      <Route path="/admin/quiz-questions">{() => <ProtectedRoute allowedRoles={['teacher']}><QuizQuestionEditorEntryGate /></ProtectedRoute>}</Route>
      <Route path="/grades-manager">{() => <ProtectedRoute allowedRoles={['teacher']}><GradesManager /></ProtectedRoute>}</Route>
      <Route path="/lessons/new">{() => <ProtectedRoute allowedRoles={['teacher']}><LessonWizard /></ProtectedRoute>}</Route>
      <Route path="/lessons/:lessonId/podcast-wizard">{() => <ProtectedRoute allowedRoles={['teacher']}><LessonPodcastWizard /></ProtectedRoute>}</Route>
      <Route path="/course-builder">{() => <ProtectedRoute allowedRoles={['teacher']}><CourseBuilder /></ProtectedRoute>}</Route>
      <Route path="/course-builder/new">{() => <ProtectedRoute allowedRoles={['teacher']}><CourseFrameworkWizard /></ProtectedRoute>}</Route>
      <Route path="/course-builder/:id/edit">{() => <ProtectedRoute allowedRoles={['teacher']}><CourseEdit /></ProtectedRoute>}</Route>
      <Route path="/course-builder/:id/lessons">{() => <ProtectedRoute allowedRoles={['teacher']}><CourseLessons /></ProtectedRoute>}</Route>
      <Route path="/course-builder/:courseId/upload/:topicOrder">{() => <ProtectedRoute allowedRoles={['teacher']}><CourseBuilderUpload /></ProtectedRoute>}</Route>
      <Route path="/course-builder/:courseId/lessons/:lessonId/translate">{() => <ProtectedRoute allowedRoles={['teacher']}><TranslateLesson /></ProtectedRoute>}</Route>
      <Route path="/course-builder/:id/preview">{() => <ProtectedRoute allowedRoles={['teacher']}><CoursePreview /></ProtectedRoute>}</Route>
      <Route path="/course-builder/from-documents/:draftId?">{() => <ProtectedRoute allowedRoles={['teacher']}><CourseDocumentWizard /></ProtectedRoute>}</Route>
      <Route path="/course-assignments">{() => <ProtectedRoute allowedRoles={['teacher']}><CourseAssignments /></ProtectedRoute>}</Route>

      {/* Authenticated user routes */}
      <Route path="/profile">{() => <ProtectedRoute allowedRoles={['authenticated']}><ProfilePage /></ProtectedRoute>}</Route>
      <Route path="/game-history">{() => <Redirect to="/profile" />}</Route>
      <Route path="/student-dashboard">{() => <ProtectedRoute allowedRoles={['authenticated']}><StudentDashboard /></ProtectedRoute>}</Route>
      <Route path="/subscriptions">{() => <ProtectedRoute allowedRoles={['authenticated']}><SubscriptionManagement /></ProtectedRoute>}</Route>
      <Route path="/credits">{() => <Redirect to="/buy-credits" />}</Route>
      <Route path="/invoices">{() => <ProtectedRoute allowedRoles={['authenticated']}><InvoiceHistory /></ProtectedRoute>}</Route>
      <Route path="/buy-credits">{() => <ProtectedRoute allowedRoles={['authenticated']}><BuyCredits /></ProtectedRoute>}</Route>
      <Route path="/lessons">{() => <ProtectedRoute allowedRoles={['authenticated']}><LessonsEntryRedirect /></ProtectedRoute>}</Route>
      <Route path="/lessons/:lessonId/content-studio">{() => <LessonContentStudio />}</Route>
      <Route path="/lessons/:lessonId">{() => <LessonViewer />}</Route>
      <Route path="/certificates">{() => <ProtectedRoute allowedRoles={['authenticated']}><CertificateGallery /></ProtectedRoute>}</Route>
      <Route path="/quiz-lobby">{() => <ProtectedRoute allowedRoles={['authenticated']}><QuizLobby /></ProtectedRoute>}</Route>
      <Route path="/quiz-single/:collectionId">{() => <QuizSinglePlayer />}</Route>
      <Route path="/quiz-1v1/:collectionId">{() => <ProtectedRoute allowedRoles={['authenticated']}><Quiz1v1 /></ProtectedRoute>}</Route>
      <Route path="/game-lobby">{() => <ProtectedRoute allowedRoles={['authenticated']}><GameLobby /></ProtectedRoute>}</Route>
      <Route path="/game/:gameRoomId">{() => <ProtectedRoute allowedRoles={['authenticated']}><GameRoom /></ProtectedRoute>}</Route>
      <Route path="/play/:gameRoomId">{() => <ProtectedRoute allowedRoles={['authenticated']}><GamePlay /></ProtectedRoute>}</Route>
      <Route path="/single-player/:collectionId">{() => <ProtectedRoute allowedRoles={['authenticated']}><SinglePlayer /></ProtectedRoute>}</Route>
      <Route path="/multiplayer-1v1/:collectionId">{() => <ProtectedRoute allowedRoles={['authenticated']}><MultiPlayer1v1 /></ProtectedRoute>}</Route>
      <Route path="/custom-units">{() => <ProtectedRoute allowedRoles={['authenticated']}><CustomStatUnits /></ProtectedRoute>}</Route>
      <Route path="/courses/:id/purchase">{() => <ProtectedRoute allowedRoles={['authenticated']}><CoursePurchase /></ProtectedRoute>}</Route>
      <Route path="/courses/:id/purchase-success">{() => <ProtectedRoute allowedRoles={['authenticated']}><CoursePurchaseSuccess /></ProtectedRoute>}</Route>
      <Route path="/courses/:id/rate">{() => <ProtectedRoute allowedRoles={['authenticated']}><CourseRating /></ProtectedRoute>}</Route>
      <Route path="/notifications">{() => <ProtectedRoute allowedRoles={['authenticated']}><NotificationCenter /></ProtectedRoute>}</Route>
      <Route path="/preferences">{() => <Redirect to="/profile" />}</Route>
      <Route path="/user-preferences">{() => <Redirect to="/profile" />}</Route>
      <Route path="/purchase-history">{() => <ProtectedRoute allowedRoles={['authenticated']}><PurchaseHistory /></ProtectedRoute>}</Route>
      <Route path="/my-courses">{() => <ProtectedRoute allowedRoles={['authenticated']}><MyCourses /></ProtectedRoute>}</Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TimezoneBootstrap />
      <BrandingProvider>
      <OrganizationProvider>
        <TooltipProvider>
          <JoinRequestStatusBanner />
          <UnlicensedSystemBanner />
          <JoinRequestDeniedModal />
          <Router />
          <PWAInstallPrompt />
          <Toaster />
        </TooltipProvider>
      </OrganizationProvider>
      </BrandingProvider>
    </QueryClientProvider>
  );
}

export default App;
