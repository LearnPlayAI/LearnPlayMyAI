import { useState, useMemo, lazy, Suspense } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useBrandEditor } from './BrandEditorShell';
import { QuickTokenEditorDialog } from './QuickTokenEditorDialog';
import { 
  Home, 
  LayoutDashboard, 
  BookOpen, 
  Play, 
  Gamepad2, 
  Award,
  FileText,
  Mail,
  ExternalLink,
  Palette,
  CreditCard,
  Swords,
  Undo2
} from 'lucide-react';

const PreviewHomepage = lazy(() => import('./previews/PreviewHomepage').then(m => ({ default: m.default })));
const PreviewAdminPanel = lazy(() => import('./previews/PreviewAdminPanel').then(m => ({ default: m.default })));
const PreviewCourseBuilder = lazy(() => import('./previews/PreviewCourseBuilder').then(m => ({ default: m.default })));
const PreviewCourseBrowser = lazy(() => import('./previews/PreviewCourseBrowser').then(m => ({ default: m.default })));
const PreviewLessonViewer = lazy(() => import('./previews/PreviewLessonViewer').then(m => ({ default: m.default })));
const PreviewQuizLobby = lazy(() => import('./previews/PreviewQuizLobby').then(m => ({ default: m.default })));
const PreviewCertificates = lazy(() => import('./previews/PreviewCertificates').then(m => ({ default: m.default })));
const PreviewInvoice = lazy(() => import('./previews/PreviewInvoice').then(m => ({ default: m.default })));
const PreviewEmail = lazy(() => import('./previews/PreviewEmail').then(m => ({ default: m.default })));
const PreviewUIKit = lazy(() => import('./previews/PreviewUIKit').then(m => ({ default: m.default })));
const PreviewCommerce = lazy(() => import('./previews/PreviewCommerce').then(m => ({ default: m.default })));
const PreviewGameQuiz = lazy(() => import('./previews/PreviewGameQuiz').then(m => ({ default: m.default })));
const PreviewPlatformCoverage = lazy(() => import('./previews/PreviewPlatformCoverage').then(m => ({ default: m.default })));

interface PreviewTab {
  id: string;
  label: string;
  icon: React.ReactNode;
  component: React.ComponentType;
}

const tabs: PreviewTab[] = [
  { id: 'uikit', label: 'UI Kit', icon: <Palette className="h-4 w-4" />, component: PreviewUIKit },
  { id: 'coverage', label: 'Coverage', icon: <LayoutDashboard className="h-4 w-4" />, component: PreviewPlatformCoverage },
  { id: 'homepage', label: 'Homepage', icon: <Home className="h-4 w-4" />, component: PreviewHomepage },
  { id: 'admin', label: 'Admin', icon: <LayoutDashboard className="h-4 w-4" />, component: PreviewAdminPanel },
  { id: 'course-builder', label: 'Course Builder', icon: <BookOpen className="h-4 w-4" />, component: PreviewCourseBuilder },
  { id: 'browse-courses', label: 'Browse Courses', icon: <BookOpen className="h-4 w-4" />, component: PreviewCourseBrowser },
  { id: 'lesson', label: 'Lesson', icon: <Play className="h-4 w-4" />, component: PreviewLessonViewer },
  { id: 'quiz-lobby', label: 'Quiz Lobby', icon: <Gamepad2 className="h-4 w-4" />, component: PreviewQuizLobby },
  { id: 'gamequiz', label: 'Game/Quiz', icon: <Swords className="h-4 w-4" />, component: PreviewGameQuiz },
  { id: 'commerce', label: 'Commerce', icon: <CreditCard className="h-4 w-4" />, component: PreviewCommerce },
  { id: 'certificates', label: 'Certs', icon: <Award className="h-4 w-4" />, component: PreviewCertificates },
  { id: 'invoice', label: 'Invoice', icon: <FileText className="h-4 w-4" />, component: PreviewInvoice },
  { id: 'email', label: 'Email', icon: <Mail className="h-4 w-4" />, component: PreviewEmail },
];

function PreviewSkeleton() {
  return (
    <div className="w-full h-full p-4 space-y-4">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-32 w-full" />
      <div className="grid grid-cols-3 gap-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
    </div>
  );
}

interface PreviewTabsProps {
  className?: string;
}

export function PreviewTabs({ className }: PreviewTabsProps) {
  const [activeTab, setActiveTab] = useState('uikit');
  const { undo, canUndo } = useBrandEditor();

  const activeTabData = useMemo(() => {
    return tabs.find(t => t.id === activeTab);
  }, [activeTab]);

  return (
    <div className={cn("flex flex-col h-full", className)}>
      <QuickTokenEditorDialog />
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30 gap-3">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="h-11 sm:h-9 p-1 gap-1 overflow-x-auto whitespace-nowrap touch-pan-x">
            {tabs.map((tab) => (
              <TabsTrigger
                key={tab.id}
                value={tab.id}
                className="text-xs px-3 min-h-[44px] h-11 sm:h-8 touch-manipulation"
                data-testid={`preview-tab-${tab.id}`}
              >
                {tab.icon}
                <span className="ml-1.5">{tab.label}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        
        <div className="flex items-center gap-3 ml-1 sm:ml-4 shrink-0">
          <Button variant="ghost" size="sm" onClick={undo} disabled={!canUndo} className="min-h-[44px] h-11 sm:h-8 px-2 touch-manipulation" data-testid="button-undo" >
            <Undo2 className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Undo</span>
          </Button>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <ExternalLink className="h-3 w-3" />
            <span className="hidden md:inline">Click any element to edit</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-muted/20 p-4">
        <div className="mx-auto max-w-5xl">
          <Suspense fallback={<PreviewSkeleton />}>
            {activeTabData && <activeTabData.component />}
          </Suspense>
        </div>
      </div>
    </div>
  );
}

export default PreviewTabs;
