import { Link } from 'wouter';
import { ArrowLeft, Construction } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface SimplePlaceholderProps {
  title: string;
  description: string;
  backLink?: string;
  backLinkText?: string;
}

export default function SimplePlaceholder({
  title,
  description,
  backLink = '/',
  backLinkText = 'Back to Dashboard'
}: SimplePlaceholderProps) {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {backLink && (
          <Link href={backLink}>
            <Button variant="ghost" className="mb-6">
              <ArrowLeft className="h-4 w-4 mr-2" />
              {backLinkText}
            </Button>
          </Link>
        )}

        <Card className="text-center py-12">
          <CardHeader>
            <Construction className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <CardTitle className="text-3xl">{title}</CardTitle>
            <CardDescription className="text-lg mt-2">{description}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-6">
              This feature is part of the e-learning platform MVP and will be fully implemented in the next phase.
              Core backend services are ready and functional.
            </p>
            <Link href={backLink}>
              <Button>{backLinkText}</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
