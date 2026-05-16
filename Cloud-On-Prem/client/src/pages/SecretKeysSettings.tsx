import { useEffect } from "react";
import { useLocation } from "wouter";
import QuizAdminLayout from "@/components/QuizAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function SecretKeysSettings() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    const timer = setTimeout(() => setLocation("/admin/integration-settings"), 200);
    return () => clearTimeout(timer);
  }, [setLocation]);

  return (
    <QuizAdminLayout
      title="Secret Keys"
      description="Legacy page retired"
      activeSection="integration-settings"
    >
      <Card>
        <CardHeader>
          <CardTitle>Legacy Secret Keys Page Retired</CardTitle>
          <CardDescription>
            Secret configuration now lives only in Integration Settings.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => setLocation("/admin/integration-settings")}>
            Go to Integration Settings
          </Button>
        </CardContent>
      </Card>
    </QuizAdminLayout>
  );
}
