import QuizAdminLayout from '@/components/QuizAdminLayout';
import OrgCreditUsageReport from '@/components/OrgCreditUsageReport';
import { Card, CardContent } from '@/components/ui/card';

export default function OrgCreditUsageReportPage() {
  return (
    <QuizAdminLayout
      title="Organization Credit Usage"
      description="View credit balance, transactions, and usage analytics for your organization"
    >
      <Card className="p-[var(--container-padding)]">
        <CardContent className="p-0">
          <OrgCreditUsageReport />
        </CardContent>
      </Card>
    </QuizAdminLayout>
  );
}
