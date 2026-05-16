import { useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import { Bell, CheckCircle2, Info, TriangleAlert } from 'lucide-react';
import { PreviewFrame, ClickableElement } from '../PreviewFrame';
import { useBrandEditor } from '../BrandEditorShell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '@/components/ui/breadcrumb';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

function Section({
  title,
  description,
  editKey,
  children,
}: {
  title: string;
  description: string;
  editKey: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border p-4 md:p-5 space-y-4 bg-[var(--surface-raised)] border-[var(--stroke-default)]">
      <ClickableElement editKey={editKey} className="space-y-1">
        <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}>
          {title}
        </h3>
        <p className="text-sm" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
          {description}
        </p>
      </ClickableElement>
      {children}
    </section>
  );
}

export default function PreviewPlatformCoverage() {
  const [mailingList, setMailingList] = useState(true);
  const [primitiveQuery, setPrimitiveQuery] = useState('');
  const [activeFamily, setActiveFamily] = useState<string>('all');
  const { state } = useBrandEditor();
  const tokenFamily = (tokenKey: string) => tokenKey.replace(/^--/, '').split('-')[0] || 'misc';
  const isLikelyColorValue = (value: string | undefined) =>
    !!value && /^(#|rgb|hsl|var\(|[a-zA-Z]+)/.test(value.trim());
  const allPrimitiveKeys = useMemo(
    () => Object.keys(state.tokens || {}).filter((key) => key.startsWith('--')).sort(),
    [state.tokens]
  );
  const primitiveFamilies = useMemo(
    () => ['all', ...Array.from(new Set(allPrimitiveKeys.map(tokenFamily))).sort()],
    [allPrimitiveKeys]
  );
  const filteredPrimitiveKeys = useMemo(() => {
    const query = primitiveQuery.trim().toLowerCase();
    return allPrimitiveKeys.filter((key) => {
      if (activeFamily !== 'all' && tokenFamily(key) !== activeFamily) return false;
      if (!query) return true;
      const value = String(state.tokens[key] || '').toLowerCase();
      return key.toLowerCase().includes(query) || value.includes(query);
    });
  }, [activeFamily, allPrimitiveKeys, primitiveQuery, state.tokens]);
  const preventNavigation = (event: MouseEvent) => {
    event.preventDefault();
  };

  return (
    <PreviewFrame className="min-h-[920px]" data-testid="preview-platform-coverage">
      <ClickableElement editKey="--background" className="space-y-4 p-4 md:p-6 block" style={{ background: 'var(--surface-primary)' }}>
        <ClickableElement editKey="--text-primary" className="space-y-1">
          <h2 className="text-xl font-semibold" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}>
            Platform UI Coverage
          </h2>
          <p className="text-sm" style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
            Single-page preview of core platform components wired to current theme tokens.
          </p>
        </ClickableElement>

        <Section title="Navigation and Context" description="Top-level chrome tokens and navigational components." editKey="--background">
          <ClickableElement editKey="--card" className="rounded-lg border p-3 bg-[var(--surface-base)] border-[var(--stroke-default)] block">
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="#" onClick={preventNavigation}>Platform</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink href="#" onClick={preventNavigation}>Branding</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>Coverage Preview</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </ClickableElement>
        </Section>

        <Section title="Actions and Status" description="Button states and semantic badge variants." editKey="--primary">
          <div className="flex flex-wrap gap-2">
            <ClickableElement editKey="--btn-primary-bg"><Button>Primary</Button></ClickableElement>
            <ClickableElement editKey="--btn-secondary-bg"><Button variant="secondary">Secondary</Button></ClickableElement>
            <ClickableElement editKey="--btn-outline-border"><Button variant="outline">Outline</Button></ClickableElement>
            <ClickableElement editKey="--btn-ghost-bg"><Button variant="ghost">Ghost</Button></ClickableElement>
            <ClickableElement editKey="--btn-danger-bg"><Button variant="destructive">Danger</Button></ClickableElement>
            <ClickableElement editKey="--link-fg"><Button variant="link">Link Action</Button></ClickableElement>
          </div>
          <div className="flex flex-wrap gap-2">
            <ClickableElement editKey="--badge-bg"><Badge>Default</Badge></ClickableElement>
            <ClickableElement editKey="--badge-secondary-bg"><Badge variant="secondary">Secondary</Badge></ClickableElement>
            <ClickableElement editKey="--success"><Badge variant="success">Success</Badge></ClickableElement>
            <ClickableElement editKey="--warning"><Badge variant="warning">Warning</Badge></ClickableElement>
            <ClickableElement editKey="--destructive"><Badge variant="danger">Danger</Badge></ClickableElement>
            <ClickableElement editKey="--accent"><Badge variant="info">Info</Badge></ClickableElement>
            <ClickableElement editKey="--badge-outline-border"><Badge variant="outline">Outline</Badge></ClickableElement>
          </div>
        </Section>

        <Section title="Forms and Inputs" description="Field, select, toggle, checkbox, and radio controls." editKey="--card">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="coverage-name">Organization Name</Label>
              <ClickableElement editKey="--input-bg"><Input id="coverage-name" defaultValue="Acme Learning" /></ClickableElement>
            </div>
            <div className="space-y-2">
              <Label htmlFor="coverage-domain">Primary Domain</Label>
              <ClickableElement editKey="--input-bg"><Input id="coverage-domain" defaultValue="learn.acme.com" /></ClickableElement>
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="coverage-description">Description</Label>
              <ClickableElement editKey="--input-bg"><Textarea id="coverage-description" defaultValue="Branded learning environment for enterprise clients." /></ClickableElement>
            </div>
            <div className="space-y-2">
              <Label htmlFor="coverage-region">Region</Label>
              <ClickableElement editKey="--select-bg">
                <Select defaultValue="us">
                  <SelectTrigger id="coverage-region">
                    <SelectValue placeholder="Select region" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="us">United States</SelectItem>
                    <SelectItem value="eu">Europe</SelectItem>
                    <SelectItem value="za">South Africa</SelectItem>
                  </SelectContent>
                </Select>
              </ClickableElement>
            </div>
            <ClickableElement editKey="--card" className="rounded-md border p-3 space-y-3 bg-[var(--surface-base)] border-[var(--stroke-default)] block">
              <div className="flex items-center justify-between">
                <Label htmlFor="coverage-switch">Email Branding</Label>
                <ClickableElement editKey="--switch-checked-bg"><Switch id="coverage-switch" checked={mailingList} onCheckedChange={setMailingList} /></ClickableElement>
              </div>
              <div className="flex items-center gap-2">
                <ClickableElement editKey="--checkbox-checked-bg"><Checkbox id="coverage-checkbox" defaultChecked /></ClickableElement>
                <Label htmlFor="coverage-checkbox">Enable certificate logos</Label>
              </div>
              <ClickableElement editKey="--radio-checked-bg" className="block">
                <RadioGroup defaultValue="strict" className="gap-2">
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="strict" id="coverage-strict" />
                    <Label htmlFor="coverage-strict">Strict policy</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="advisory" id="coverage-advisory" />
                    <Label htmlFor="coverage-advisory">Advisory policy</Label>
                  </div>
                </RadioGroup>
              </ClickableElement>
            </ClickableElement>
          </div>
        </Section>

        <Section title="Feedback and Alerts" description="System feedback, progress, and loading placeholders." editKey="--accent">
          <div className="grid gap-3 md:grid-cols-2">
            <ClickableElement editKey="--alert-info-bg"><Alert variant="info">
              <Info className="h-4 w-4" />
              <AlertTitle>Information</AlertTitle>
              <AlertDescription>Theme was published to 4 active domains.</AlertDescription>
            </Alert></ClickableElement>
            <ClickableElement editKey="--alert-success-bg"><Alert variant="success">
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Success</AlertTitle>
              <AlertDescription>Brand assets synced to certificate and invoice templates.</AlertDescription>
            </Alert></ClickableElement>
            <ClickableElement editKey="--alert-warning-bg"><Alert variant="warning">
              <TriangleAlert className="h-4 w-4" />
              <AlertTitle>Warning</AlertTitle>
              <AlertDescription>One preview route has low text contrast in hover states.</AlertDescription>
            </Alert></ClickableElement>
            <ClickableElement editKey="--card"><Alert variant="default">
              <Bell className="h-4 w-4" />
              <AlertTitle>General</AlertTitle>
              <AlertDescription>A new organization imported this theme preset.</AlertDescription>
            </Alert></ClickableElement>
          </div>
          <div className="space-y-3">
            <ClickableElement editKey="--progress-bar-fill"><Progress value={72} /></ClickableElement>
            <ClickableElement editKey="--warning"><Progress value={56} variant="warning" /></ClickableElement>
            <ClickableElement editKey="--destructive"><Progress value={28} variant="error" /></ClickableElement>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <ClickableElement editKey="--muted"><Skeleton className="h-16" /></ClickableElement>
            <ClickableElement editKey="--muted"><Skeleton className="h-16" /></ClickableElement>
            <ClickableElement editKey="--muted"><Skeleton className="h-16" /></ClickableElement>
          </div>
        </Section>

        <Section title="Cards, Tabs, and Data" description="Containers and data-display patterns used in admin and learner flows." editKey="--card-bg">
          <div className="grid gap-4 lg:grid-cols-2">
            <ClickableElement editKey="--card-bg" className="block"><Card>
              <CardHeader>
                <CardTitle>Active Learners</CardTitle>
                <CardDescription>Monthly enrollment trend across organizations</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>North America</span>
                  <span className="font-semibold">12,480</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span>Europe</span>
                  <span className="font-semibold">9,203</span>
                </div>
              </CardContent>
              <CardFooter className="justify-between">
                <Button size="sm">View report</Button>
                <Badge variant="success">+8.2%</Badge>
              </CardFooter>
            </Card></ClickableElement>

            <ClickableElement editKey="--tab-bg" className="block">
              <Tabs defaultValue="users" className="rounded-lg border p-3 bg-[var(--surface-base)] border-[var(--stroke-default)]">
                <TabsList>
                  <TabsTrigger value="users">Users</TabsTrigger>
                  <TabsTrigger value="courses">Courses</TabsTrigger>
                  <TabsTrigger value="domains">Domains</TabsTrigger>
                </TabsList>
                <TabsContent value="users" className="text-sm text-muted-foreground">
                  1,248 admins and managers active this week.
                </TabsContent>
                <TabsContent value="courses" className="text-sm text-muted-foreground">
                  93 courses published with branded player theme.
                </TabsContent>
                <TabsContent value="domains" className="text-sm text-muted-foreground">
                  12 verified custom domains serving branded pages.
                </TabsContent>
              </Tabs>
            </ClickableElement>
          </div>

          <ClickableElement editKey="--table-row-bg" className="rounded-lg border p-3 bg-[var(--surface-base)] border-[var(--stroke-default)] block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Organization</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Theme</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>Acme Learning</TableCell>
                  <TableCell><Badge variant="success">Active</Badge></TableCell>
                  <TableCell>Enterprise Blue</TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Northwind Academy</TableCell>
                  <TableCell><Badge variant="warning">Review</Badge></TableCell>
                  <TableCell>Sunset Warm</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </ClickableElement>

          <ClickableElement editKey="--pagination-bg" className="block">
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious href="#" onClick={preventNavigation} />
                </PaginationItem>
                <PaginationItem>
                  <PaginationLink href="#" isActive onClick={preventNavigation}>1</PaginationLink>
                </PaginationItem>
                <PaginationItem>
                  <PaginationLink href="#" onClick={preventNavigation}>2</PaginationLink>
                </PaginationItem>
                <PaginationItem>
                  <PaginationEllipsis />
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext href="#" onClick={preventNavigation} />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </ClickableElement>
        </Section>

        <Section title="Identity Elements" description="Avatar, separators, and neutral surfaces." editKey="--foreground">
          <ClickableElement editKey="--avatar-bg" className="flex items-center gap-3">
            <Avatar>
              <AvatarFallback>AL</AvatarFallback>
            </Avatar>
            <Avatar>
              <AvatarFallback>NW</AvatarFallback>
            </Avatar>
          </ClickableElement>
          <ClickableElement editKey="--border"><Separator /></ClickableElement>
          <ClickableElement editKey="--muted" className="rounded-md p-3 text-sm block" style={{ background: 'var(--surface-muted)', color: 'var(--text-muted)' }}>
            Tokenized neutral panel for helper copy and secondary information.
          </ClickableElement>
        </Section>

        <Section
          title="Primitive Matrix"
          description="Full primitive coverage: click any token card below to edit that exact primitive."
          editKey="--background"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={primitiveQuery}
              onChange={(event) => setPrimitiveQuery(event.target.value)}
              placeholder="Search token name or value"
              className="h-9 max-w-sm"
            />
            {primitiveFamilies.map((family) => (
              <Button key={family} size="sm" variant={activeFamily === family ? 'default' : 'outline'} onClick={() => setActiveFamily(family)}
              >
                {family}
              </Button>
            ))}
          </div>
          <div className="max-h-96 overflow-auto rounded-md border border-[var(--stroke-default)] bg-[var(--surface-base)] p-2">
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {filteredPrimitiveKeys.map((tokenKey) => (
                <ClickableElement
                  key={tokenKey}
                  editKey={tokenKey}
                  className="rounded-md border border-[var(--stroke-default)] bg-[var(--surface-raised)] p-2 block"
                >
                  <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{tokenKey}</p>
                  <p className="mt-1 text-[11px] truncate" style={{ color: 'var(--text-muted)' }}>
                    {state.tokens[tokenKey]}
                  </p>
                  {isLikelyColorValue(state.tokens[tokenKey]) ? (
                    <div
                      className="mt-2 h-5 rounded border border-[var(--stroke-subtle)]"
                      style={{ background: `var(${tokenKey})` }}
                    />
                  ) : null}
                </ClickableElement>
              ))}
            </div>
          </div>
        </Section>
      </ClickableElement>
    </PreviewFrame>
  );
}
