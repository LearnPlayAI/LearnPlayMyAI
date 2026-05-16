import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

const readClientSource = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), 'client/src', relativePath), 'utf8');

describe('platform-wide terminology cleanup contract', () => {
  const forbiddenByFile: Record<string, string[]> = {
    'components/StudentInsightsTab.tsx': [
      'Select a Grade to View Insights',
      'Search Students and Quiz Names',
      'Student Performance Overview',
      'Student Performance Timeline',
      'Student performance across quiz collections',
      '<TableHead>Student</TableHead>',
    ],
    'components/StudentPerformanceTab.tsx': [
      'vs Class Avg',
      'Search for a Student',
    ],
    'components/QuizLeaderboard.tsx': [
      ": 'All Units'",
      ": 'Class'",
      ": 'All Classes'",
    ],
    'components/LessonAssignmentWizard.tsx': [
      "learner: 'Student'",
      "unit: 'Grade'",
      "educator: 'Teacher'",
    ],
    'pages/CourseBuilder.tsx': [
      'placeholder="All Departments"',
      '>All Departments<',
      'placeholder="All Units"',
      '>All Units<',
      'placeholder="All Teams"',
      '>All Teams<',
    ],
    'pages/CourseEdit.tsx': [
      'Learners can enroll without payment.',
      '<Label>Department</Label>',
      '<Label>Unit</Label>',
      '<Label>Team</Label>',
    ],
    'pages/CourseDocumentWizard.tsx': [
      '<Label htmlFor="department">Department</Label>',
      '<Label htmlFor="sub-unit">Unit / Class</Label>',
      '<Label htmlFor="team">Team (Optional)</Label>',
      '<Label htmlFor="department-internal">Department</Label>',
      '<Label htmlFor="sub-unit-internal">Unit / Class</Label>',
      '<Label htmlFor="team-internal">Team (Optional)</Label>',
      '<div className="text-xs text-muted-foreground mt-1">Grade</div>',
    ],
    'pages/CourseLessons.tsx': [
      "'Department Assignment Required'",
      'Assign to Departments',
      '<div className="text-xs text-muted-foreground mt-1">Grade</div>',
    ],
    'pages/OnPremLicenseManagement.tsx': [
      'Trainer/Team Leads',
      'Trainers/Org',
    ],
    'pages/OrganizationAnalytics.tsx': [
      '`Learners: ${org.seatUtilization.learners.current}',
      '<TableHead className="text-muted-foreground">Trainers</TableHead>',
      '<div>Learners: {org.seatUtilization.learners.current}',
      'Teachers: {org.seatUtilization.teachers.current}',
    ],
    'pages/SubscriptionManagement.tsx': [
      '<span className="text-[length:var(--text-sm)] font-medium">Learners</span>',
      '<span className="text-[length:var(--text-sm)] font-medium">Teachers</span>',
      "? 'Learner' :",
      "? 'Teacher' :",
    ],
    'pages/BillingDashboard.tsx': [
      "|| 'Students'",
      '<span className="text-muted-foreground">Learners:</span>',
      '<span className="text-muted-foreground">Teachers:</span>',
    ],
    'pages/admin/OrgPackageOverrides.tsx': [
      'Learner Limit',
      'Teacher Limit',
      'Max Learners',
      'Max Teachers',
      'Learner Pricing',
      'Teacher Pricing',
    ],
    'components/admin/BusinessPackageManager.tsx': [
      'Max Learners',
      'Max Teachers',
      '>Per Learner<',
      '>Per Teacher<',
      'Price per Learner</FormLabel>',
      'Price per Teacher</FormLabel>',
    ],
    'components/admin/PackageCalculator.tsx': [
      '>Learners<',
      '>Teachers<',
      '>Per Learner<',
      '>Per Teacher<',
    ],
    'components/admin/DowngradeUserSelection.tsx': [
      "role: 'Learner'",
      "role: 'Teacher'",
      'title="Learners"',
      'title="Teachers"',
    ],
    'components/admin/PackageAnalytics.tsx': [
      'Learner Utilization',
      'Teacher Utilization',
    ],
    'components/OrgCreditUsageReport.tsx': [
      'Teachers Can Spend',
    ],
    'pages/OrgSalesDashboard.tsx': [
      'Total Learners',
      'Student Name',
      '<div className="text-muted-foreground">Student</div>',
    ],
    'components/EngagementPerformanceModal.tsx': [
      'Students at this Performance Level',
      'Student Info',
    ],
    'components/LessonActionsMenu.tsx': [
      'Learners will now see the selected version.',
    ],
    'components/UnlicensedSystemBanner.tsx': [
      'Trainer/Team Leads',
    ],
    'components/PricingCTA.tsx': [
      'Trainers/Teachers can use',
    ],
    'components/SalesInquiryModal.tsx': [
      '<SelectItem value="Trainer">Trainer</SelectItem>',
      '<SelectItem value="Learner">Learner</SelectItem>',
      'Number of Learners *',
    ],
    'pages/BillingAuditLog.tsx': [
      ": 'All Units'",
      "'Unit/SubUnit'",
    ],
    'pages/LessonCredits.tsx': [
      'Teachers Can Spend',
    ],
    'pages/MarketplaceRevenue.tsx': [
      "label: 'Active Students'",
    ],
    'pages/SuperAdmin.tsx': [
      '{terminology.educator} / Team Lead',
    ],
    'pages/admin/EnterpriseCustomerDetails.tsx': [
      '<TableHead>Learners</TableHead>',
      '<TableHead>Trainers</TableHead>',
    ],
    'pages/QuizDraftsPage.tsx': [
      "|| 'Grade'",
      "|| 'Grades'",
    ],
  };

  it.each(Object.entries(forbiddenByFile))('removes hardcoded terminology from %s', (relativePath, forbiddenSnippets) => {
    const source = readClientSource(relativePath);

    for (const snippet of forbiddenSnippets) {
      expect(source).not.toContain(snippet);
    }
  });
});
