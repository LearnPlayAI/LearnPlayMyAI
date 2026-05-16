import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import QuizAdminLayout from "@/components/QuizAdminLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { RefreshCw } from "lucide-react";

type IntegrationProvider = "mailersend" | "smtp" | "gemini" | "gamma" | "elevenlabs" | "yoco";

interface SecretSummary {
  key: string;
  label: string;
  configured: boolean;
  maskedValue: string | null;
  updatedAt: string | null;
  required: boolean;
}

interface SettingSummary {
  key: string;
  label: string;
  type: "string" | "number" | "boolean" | "json";
  value: any;
  required: boolean;
  updatedAt: string | null;
}

interface ProviderSummary {
  provider: IntegrationProvider;
  label: string;
  healthy: boolean;
  secrets: SecretSummary[];
  settings: SettingSummary[];
}

interface IntegrationLog {
  id: string;
  provider: string;
  operation: string;
  status: "success" | "failure" | "degraded";
  severity: "info" | "warn" | "error";
  message: string | null;
  errorCode: string | null;
  durationMs: number | null;
  createdAt: string;
}

interface SystemChangeLog {
  id: string;
  domain: string;
  action: string;
  key: string;
  provider: string | null;
  isSecret: boolean;
  actorUserId: string | null;
  createdAt: string;
}

interface ProviderModelOption {
  value: string;
  label: string;
  capabilities?: string[];
  category?: string;
}

interface ProviderModelOptionsResponse {
  options: ProviderModelOption[];
  source?: string;
  error?: string;
  message?: string;
}
interface SettingSelectOption {
  value: string;
  label: string;
}

interface PaymentSettings {
  id: string;
  yocoMode: "test" | "live";
  updatedAt: string;
  updatedBy: string | null;
}

interface WebhookStatus {
  currentMode: "test" | "live";
  webhookSecretConfigured: boolean;
  webhookUrl: string;
  activeWebhook: {
    id: string;
    webhookId: string;
    mode: "test" | "live";
    webhookUrl: string;
    registeredAt: string;
  } | null;
}

interface ElevenLabsBalanceResponse {
  provider: "elevenlabs";
  sourceOfTruth: "provider_api";
  characterCount: number | null;
  characterLimit: number | null;
  remainingCharacters: number | null;
  nextCharacterCountResetUnix: number | null;
}

interface GammaBalanceResponse {
  provider: "gamma";
  sourceOfTruth: "reconciled_internal";
  available: boolean;
  creditsRemaining: number | null;
  lastSnapshotAt?: string | null;
  totalDeducted?: number | null;
  note?: string | null;
  billingUrl?: string | null;
}

function toFiniteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDate(value?: string | null): string {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

export default function IntegrationSettings() {
  const { toast } = useToast();
  const [activeProvider, setActiveProvider] = useState<IntegrationProvider>("mailersend");
  const [activeTopTab, setActiveTopTab] = useState<"config" | "logs" | "audit">("config");
  const [secretDrafts, setSecretDrafts] = useState<Record<string, string>>({});
  const [settingDrafts, setSettingDrafts] = useState<Record<string, string>>({});
  const [integrationLogProviderFilter, setIntegrationLogProviderFilter] = useState<string>("all");
  const [integrationLogStatusFilter, setIntegrationLogStatusFilter] = useState<string>("all");
  const [systemChangeSearch, setSystemChangeSearch] = useState<string>("");
  const [latestWebhookSecret, setLatestWebhookSecret] = useState<string | null>(null);
  const [manualWebhookId, setManualWebhookId] = useState<string>("");

  const { data: geminiModelData, isLoading: geminiModelsLoading } = useQuery<ProviderModelOptionsResponse>({
    queryKey: ["/api/admin/integrations/gemini/model-options"],
    queryFn: async () => apiRequest("/api/admin/integrations/gemini/model-options", { method: "GET" }),
    retry: false,
  });

  const { data: elevenLabsModelData, isLoading: elevenLabsModelsLoading } = useQuery<ProviderModelOptionsResponse>({
    queryKey: ["/api/admin/integrations/elevenlabs/model-options"],
    queryFn: async () => apiRequest("/api/admin/integrations/elevenlabs/model-options", { method: "GET" }),
    retry: false,
  });

  const { data: mailerSendTemplateData, isLoading: mailerSendTemplatesLoading } = useQuery<ProviderModelOptionsResponse>({
    queryKey: ["/api/admin/integrations/mailersend/template-options"],
    queryFn: async () => apiRequest("/api/admin/integrations/mailersend/template-options", { method: "GET" }),
    retry: false,
  });

  const { data, isLoading } = useQuery<{ providers: ProviderSummary[]; emailTransport: "smtp" | "mailersend" }>({
    queryKey: ["/api/admin/integrations"],
  });

  const {
    data: elevenLabsBalanceData,
    isLoading: elevenLabsBalanceLoading,
    refetch: refetchElevenLabsBalance,
    isFetching: elevenLabsBalanceFetching,
    isError: elevenLabsBalanceIsError,
    error: elevenLabsBalanceError,
  } = useQuery<ElevenLabsBalanceResponse>({
    queryKey: ["/api/admin/integrations/elevenlabs/balance"],
    queryFn: async () => apiRequest("/api/admin/integrations/elevenlabs/balance", { method: "GET" }),
    enabled: activeProvider === "elevenlabs",
    retry: false,
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const { data: gammaBalanceData, isLoading: gammaBalanceLoading } = useQuery<GammaBalanceResponse>({
    queryKey: ["/api/admin/integrations/gamma/balance"],
    queryFn: async () => apiRequest("/api/admin/integrations/gamma/balance", { method: "GET" }),
    enabled: activeProvider === "gamma",
    retry: false,
  });

  const { data: integrationLogsData, isLoading: logsLoading } = useQuery<{ logs: IntegrationLog[]; summary?: any[] }>({
    queryKey: ["/api/admin/integrations/logs", integrationLogProviderFilter, integrationLogStatusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (integrationLogProviderFilter !== "all") params.set("provider", integrationLogProviderFilter);
      if (integrationLogStatusFilter !== "all") params.set("status", integrationLogStatusFilter);
      params.set("limit", "200");
      return apiRequest(`/api/admin/integrations/logs?${params.toString()}`, { method: "GET" });
    },
  });

  const { data: systemChangesData, isLoading: systemChangesLoading } = useQuery<{ logs: SystemChangeLog[] }>({
    queryKey: ["/api/admin/system-changes", systemChangeSearch],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (systemChangeSearch.trim()) params.set("key", systemChangeSearch.trim());
      params.set("limit", "200");
      return apiRequest(`/api/admin/system-changes?${params.toString()}`, { method: "GET" });
    },
  });

  const yocoProviderAvailable = (data?.providers || []).some((provider) => provider.provider === "yoco");

  const { data: yocoPaymentSettingsData } = useQuery<{ paymentSettings: PaymentSettings }>({
    queryKey: ["/api/superadmin/payment-settings"],
    queryFn: async () => apiRequest("/api/superadmin/payment-settings", { method: "GET" }),
    enabled: yocoProviderAvailable,
    retry: false,
  });

  const { data: yocoWebhookStatusData, refetch: refetchYocoWebhookStatus } = useQuery<WebhookStatus>({
    queryKey: ["/api/superadmin/webhook-status"],
    queryFn: async () => apiRequest("/api/superadmin/webhook-status", { method: "GET" }),
    enabled: yocoProviderAvailable,
    retry: false,
  });

  const { data: yocoWebhooksData, refetch: refetchYocoWebhooks } = useQuery<{ mode: string; webhooks: any[] }>({
    queryKey: ["/api/superadmin/webhooks/list"],
    queryFn: async () => apiRequest("/api/superadmin/webhooks/list", { method: "GET" }),
    enabled: yocoProviderAvailable,
    retry: false,
  });

  const providers = data?.providers || [];
  const emailTransport = data?.emailTransport || "mailersend";
  const geminiModelOptions = geminiModelData?.options || [];
  const elevenLabsModelOptions = elevenLabsModelData?.options || [];
  const mailerSendTemplateOptions = mailerSendTemplateData?.options || [];

  const providerOptions = useMemo(() => [
    { value: "all", label: "All Providers" },
    ...providers.map((p) => ({ value: p.provider, label: p.label })),
  ], [providers]);

  const saveSecretMutation = useMutation({
    mutationFn: async ({ provider, key, value }: { provider: IntegrationProvider; key: string; value: string }) =>
      apiRequest(`/api/admin/integrations/${provider}/secrets/${encodeURIComponent(key)}`, {
        method: "PUT",
        body: JSON.stringify({ value }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/integrations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/system-changes"] });
      toast({ title: "Secret saved", description: "Integration secret was updated successfully." });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Save failed", description: error?.message || "Failed to save integration secret." });
    },
  });

  const deleteSecretMutation = useMutation({
    mutationFn: async ({ provider, key }: { provider: IntegrationProvider; key: string }) =>
      apiRequest(`/api/admin/integrations/${provider}/secrets/${encodeURIComponent(key)}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/integrations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/system-changes"] });
      toast({ title: "Secret removed", description: "Integration secret was removed." });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Delete failed", description: error?.message || "Failed to delete integration secret." });
    },
  });

  const saveSettingMutation = useMutation({
    mutationFn: async ({ provider, key, value }: { provider: IntegrationProvider; key: string; value: any }) =>
      apiRequest(`/api/admin/integrations/${provider}/settings/${encodeURIComponent(key)}`, {
        method: "PUT",
        body: JSON.stringify({ value }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/integrations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/system-changes"] });
      toast({ title: "Setting saved", description: "Integration setting was updated successfully." });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Save failed", description: error?.message || "Failed to save integration setting." });
    },
  });

  const testProviderMutation = useMutation({
    mutationFn: async (provider: IntegrationProvider) =>
      apiRequest<{ success: boolean; message: string }>(`/api/admin/integrations/${provider}/test`, { method: "POST" }),
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/integrations/logs"] });
      toast({
        title: result?.success ? "Integration test succeeded" : "Integration test failed",
        description: result?.message || "Test completed.",
        variant: result?.success ? "default" : "destructive",
      });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Test failed", description: error?.message || "Failed to run integration test." });
    },
  });

  const setEmailTransportMutation = useMutation({
    mutationFn: async (activeProvider: "smtp" | "mailersend") =>
      apiRequest(`/api/admin/integrations/email-transport`, {
        method: "PUT",
        body: JSON.stringify({ activeProvider }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/integrations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/system-changes"] });
      toast({ title: "Email transport updated" });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Update failed", description: error?.message || "Could not update email transport." });
    },
  });

  const updateYocoModeMutation = useMutation({
    mutationFn: async (yocoMode: "test" | "live") =>
      apiRequest("/api/superadmin/payment-settings", {
        method: "PATCH",
        body: JSON.stringify({ yocoMode }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/superadmin/payment-settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/superadmin/webhook-status"] });
      toast({ title: "YOCO mode updated" });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Update failed", description: error?.message || "Could not update YOCO mode." });
    },
  });

  const registerYocoWebhookMutation = useMutation({
    mutationFn: async () => apiRequest<{ webhookSecret?: string; webhookId?: string }>("/api/superadmin/register-webhook", { method: "POST" }),
    onSuccess: (result) => {
      setLatestWebhookSecret(result?.webhookSecret || null);
      queryClient.invalidateQueries({ queryKey: ["/api/superadmin/webhook-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/superadmin/webhooks/list"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/integrations"] });
      toast({ title: "YOCO webhook registered", description: "Webhook registration completed and secret saved to Integration Settings." });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Webhook registration failed", description: error?.message || "Could not register YOCO webhook." });
    },
  });

  const deleteYocoWebhookMutation = useMutation({
    mutationFn: async (webhookId: string) =>
      apiRequest(`/api/superadmin/webhook/${encodeURIComponent(webhookId)}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/superadmin/webhook-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/superadmin/webhooks/list"] });
      toast({ title: "Webhook deleted" });
    },
    onError: (error: any) => {
      toast({ variant: "destructive", title: "Delete failed", description: error?.message || "Could not delete YOCO webhook." });
    },
  });

  const parseSettingValue = (setting: SettingSummary, rawValue: string) => {
    if (setting.type === "number") {
      const numberValue = Number(rawValue);
      if (Number.isNaN(numberValue)) throw new Error("Must be a valid number.");
      return numberValue;
    }
    if (setting.type === "boolean") {
      const normalized = rawValue.trim().toLowerCase();
      if (normalized !== "true" && normalized !== "false") throw new Error("Must be true or false.");
      return normalized === "true";
    }
    if (setting.type === "json") {
      try {
        return JSON.parse(rawValue);
      } catch {
        throw new Error("Invalid JSON value.");
      }
    }
    return rawValue;
  };

  const isGeminiModelSetting = (provider: IntegrationProvider, settingKey: string) =>
    provider === "gemini" &&
    (settingKey === "defaultTextModel" || settingKey === "defaultImageModel" || settingKey === "thinkingScriptModel");

  const isElevenLabsModelSetting = (provider: IntegrationProvider, settingKey: string) =>
    provider === "elevenlabs" && settingKey === "modelId";

  const isMailerSendTemplateSetting = (provider: IntegrationProvider, settingKey: string) =>
    provider === "mailersend" && settingKey.startsWith("template");

  const isElevenLabsFormatSetting = (provider: IntegrationProvider, settingKey: string) =>
    provider === "elevenlabs" && settingKey === "defaultFormat";

  const isElevenLabsDurationSetting = (provider: IntegrationProvider, settingKey: string) =>
    provider === "elevenlabs" && settingKey === "defaultDuration";

  const isBooleanSetting = (setting: SettingSummary) => setting.type === "boolean";

  const getSettingSelectOptions = (provider: IntegrationProvider, setting: SettingSummary): SettingSelectOption[] => {
    if (isBooleanSetting(setting)) {
      return [
        { value: "true", label: "True" },
        { value: "false", label: "False" },
      ];
    }
    if (isElevenLabsFormatSetting(provider, setting.key)) {
      return [
        { value: "conversation", label: "Conversation (Host + Guest)" },
        { value: "bulletin", label: "Bulletin (Single Narrator)" },
      ];
    }
    if (isElevenLabsDurationSetting(provider, setting.key)) {
      return [
        { value: "short", label: "Short" },
        { value: "default", label: "Default" },
        { value: "long", label: "Long" },
      ];
    }
    return [];
  };

  const getSettingHelpText = (provider: IntegrationProvider, settingKey: string): string | null => {
    if (provider === "elevenlabs" && settingKey === "stability") return "Lower values sound more expressive; higher values sound more consistent.";
    if (provider === "elevenlabs" && settingKey === "similarityBoost") return "Controls how strongly the voice matches the selected voice profile.";
    if (provider === "elevenlabs" && settingKey === "style") return "Adds stylistic color for supported models. Keep at 0 for neutral output.";
    if (provider === "elevenlabs" && settingKey === "useSpeakerBoost") return "Enable clarity boost for spoken audio output.";
    if (provider === "elevenlabs" && settingKey === "defaultFormat") return "Default podcast script format when users do not explicitly choose a format.";
    if (provider === "elevenlabs" && settingKey === "defaultDuration") return "Default podcast script duration when users do not explicitly choose a duration.";
    if (provider === "gemini" && settingKey === "defaultTextModel") return "Used for text generation flows by default.";
    if (provider === "gemini" && settingKey === "defaultImageModel") return "Used for image generation flows by default.";
    if (provider === "gemini" && settingKey === "thinkingScriptModel") return "Used for deeper long-form reasoning/script generation tasks.";
    if (provider === "gamma" && settingKey === "providerMonthlyCostUsd") return "Reference provider billing amount used for planning and visibility.";
    if (provider === "gamma" && settingKey === "providerMonthlyCredits") return "Reference monthly provider credits included with your plan.";
    if (provider === "elevenlabs" && settingKey === "providerMonthlyCostUsd") return "Reference provider billing amount used for planning and visibility.";
    if (provider === "elevenlabs" && settingKey === "providerMonthlyCredits") return "Reference monthly provider credits included with your plan.";
    if (provider === "elevenlabs" && settingKey === "providerTopupCostPer1000Usd") return "Reference top-up cost from provider billing (USD per 1,000 credits).";
    return null;
  };

  const getSettingDraftValue = (provider: IntegrationProvider, setting: SettingSummary) => {
    const draftKey = `${provider}:${setting.key}`;
    return settingDrafts[draftKey] ?? String(setting.value ?? "");
  };

  return (
    <QuizAdminLayout
      title="Integration Settings"
      description="Configure integrations, key material, transport selection, and operational logs"
      activeSection="integration-settings"
    >
      <div className="space-y-4">
        <Tabs value={activeTopTab} onValueChange={(v) => setActiveTopTab(v as any)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="config">Configuration</TabsTrigger>
            <TabsTrigger value="logs">Integration Logs</TabsTrigger>
            <TabsTrigger value="audit">System Change Audit</TabsTrigger>
          </TabsList>

          <TabsContent value="config" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Email Delivery Provider</CardTitle>
                <CardDescription>SMTP and MailerSend are configured separately. Only the active provider is used at runtime.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Button variant={emailTransport === "mailersend" ? "default" : "outline"} onClick={() => setEmailTransportMutation.mutate("mailersend")}
                    disabled={setEmailTransportMutation.isPending}
                  >
                    Use MailerSend
                  </Button>
                  <Button variant={emailTransport === "smtp" ? "default" : "outline"} onClick={() => setEmailTransportMutation.mutate("smtp")}
                    disabled={setEmailTransportMutation.isPending}
                  >
                    Use SMTP
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Integration Providers</CardTitle>
                <CardDescription>All secret values are stored encrypted at rest and shown masked after save.</CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs value={activeProvider} onValueChange={(v) => setActiveProvider(v as IntegrationProvider)}>
                  <TabsList className="grid w-full grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
                    {providers.map((provider) => (
                      <TabsTrigger key={provider.provider} value={provider.provider}>
                        {provider.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>

                  {providers.map((provider) => (
                    <TabsContent key={provider.provider} value={provider.provider} className="space-y-4 mt-4">
                      {(() => {
                        const gammaMonthlyCostUsd = toFiniteNumber(provider.settings.find((s) => s.key === "providerMonthlyCostUsd")?.value);
                        const gammaMonthlyCredits = toFiniteNumber(provider.settings.find((s) => s.key === "providerMonthlyCredits")?.value);
                        const elevenMonthlyCostUsd = toFiniteNumber(provider.settings.find((s) => s.key === "providerMonthlyCostUsd")?.value);
                        const elevenMonthlyCredits = toFiniteNumber(provider.settings.find((s) => s.key === "providerMonthlyCredits")?.value);
                        const elevenTopupPer1000Usd = toFiniteNumber(provider.settings.find((s) => s.key === "providerTopupCostPer1000Usd")?.value);
                        const gammaUsdPerCredit =
                          gammaMonthlyCostUsd != null && gammaMonthlyCredits != null && gammaMonthlyCredits > 0
                            ? gammaMonthlyCostUsd / gammaMonthlyCredits
                            : null;
                        const elevenUsdPerCredit =
                          elevenMonthlyCostUsd != null && elevenMonthlyCredits != null && elevenMonthlyCredits > 0
                            ? elevenMonthlyCostUsd / elevenMonthlyCredits
                            : null;
                        return (provider.provider === "gamma" || provider.provider === "elevenlabs") ? (
                          <Card>
                            <CardHeader>
                              <CardTitle>Provider Cost Reference</CardTitle>
                              <CardDescription>
                                Reference billing values for planning. Update these in this tab only.
                              </CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-2 text-sm">
                              {provider.provider === "gamma" ? (
                                <>
                                  <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">Monthly plan</span>
                                    <span className="font-medium">
                                      {gammaMonthlyCostUsd != null && gammaMonthlyCredits != null
                                        ? `$${gammaMonthlyCostUsd.toFixed(2)} for ${Math.round(gammaMonthlyCredits).toLocaleString()} credits`
                                        : "-"}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">Approx USD per credit</span>
                                    <span className="font-medium">{gammaUsdPerCredit != null ? `$${gammaUsdPerCredit.toFixed(4)}` : "-"}</span>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">Monthly plan</span>
                                    <span className="font-medium">
                                      {elevenMonthlyCostUsd != null && elevenMonthlyCredits != null
                                        ? `$${elevenMonthlyCostUsd.toFixed(2)} for ${Math.round(elevenMonthlyCredits).toLocaleString()} credits`
                                        : "-"}
                                    </span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">Top-up cost</span>
                                    <span className="font-medium">{elevenTopupPer1000Usd != null ? `$${elevenTopupPer1000Usd.toFixed(2)} per 1,000 credits` : "-"}</span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">Approx USD per credit (plan)</span>
                                    <span className="font-medium">{elevenUsdPerCredit != null ? `$${elevenUsdPerCredit.toFixed(6)}` : "-"}</span>
                                  </div>
                                </>
                              )}
                            </CardContent>
                          </Card>
                        ) : null;
                      })()}

                      <Card>
                        <CardHeader className="flex-row items-center justify-between">
                          <div>
                            <CardTitle>{provider.label}</CardTitle>
                            <CardDescription>{provider.healthy ? "Configured" : "Missing required configuration"}</CardDescription>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={provider.healthy ? "default" : "destructive"}>
                              {provider.healthy ? "healthy" : "degraded"}
                            </Badge>
                            <Button size="sm" variant="outline" onClick={() => testProviderMutation.mutate(provider.provider)}
                              disabled={testProviderMutation.isPending}
                            >
                              Test Connection
                            </Button>
                          </div>
                        </CardHeader>
                      </Card>

                      {(provider.provider === "elevenlabs" || provider.provider === "gamma") && (
                        <Card>
                          <CardHeader className="flex-row items-center justify-between">
                            <div>
                              <CardTitle>Provider Credit Balance</CardTitle>
                              <CardDescription>
                                {provider.provider === "gamma"
                                  ? "Reconciled from latest Gamma snapshot and internal ledger."
                                  : "Live balance from provider API (source of truth)."}
                              </CardDescription>
                            </div>
                            {provider.provider === "elevenlabs" && (
                              <Button type="button" variant="outline" size="sm" onClick={() => {
                                  queryClient.invalidateQueries({ queryKey: ["/api/admin/integrations/elevenlabs/balance"] });
                                  refetchElevenLabsBalance();
                                }}
                                disabled={elevenLabsBalanceFetching}
                              >
                                <RefreshCw className={`mr-2 h-4 w-4 ${elevenLabsBalanceFetching ? "animate-spin" : ""}`} />
                                Refresh
                              </Button>
                            )}
                          </CardHeader>
                          <CardContent>
                            {provider.provider === "elevenlabs" ? (
                              elevenLabsBalanceLoading ? (
                                <div className="text-sm text-muted-foreground">Loading ElevenLabs balance...</div>
                              ) : elevenLabsBalanceIsError ? (
                                <div className="text-sm text-destructive">
                                  {String((elevenLabsBalanceError as any)?.message || "Unable to load ElevenLabs balance from provider API.")}
                                  {((elevenLabsBalanceError as any)?.upstreamStatus || (elevenLabsBalanceError as any)?.upstreamMessage) && (
                                    <div className="mt-1 text-xs text-destructive/90">
                                      Upstream {String((elevenLabsBalanceError as any)?.upstreamStatus || "-")}
                                      {`: ${String((elevenLabsBalanceError as any)?.upstreamMessage || "No provider message returned.")}`}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="space-y-2 text-sm">
                                  <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">Used characters</span>
                                    <span className="font-medium">{typeof elevenLabsBalanceData?.characterCount === "number" ? elevenLabsBalanceData.characterCount.toLocaleString() : "-"}</span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">Character limit</span>
                                    <span className="font-medium">{typeof elevenLabsBalanceData?.characterLimit === "number" ? elevenLabsBalanceData.characterLimit.toLocaleString() : "-"}</span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span className="text-muted-foreground">Remaining</span>
                                    <span className="font-medium">{typeof elevenLabsBalanceData?.remainingCharacters === "number" ? elevenLabsBalanceData.remainingCharacters.toLocaleString() : "-"}</span>
                                  </div>
                                  <div className="text-xs text-muted-foreground">Source: ElevenLabs provider API</div>
                                </div>
                              )
                            ) : gammaBalanceLoading ? (
                              <div className="text-sm text-muted-foreground">Loading Gamma balance...</div>
                            ) : gammaBalanceData?.available ? (
                              <div className="space-y-2 text-sm">
                                <div className="flex items-center justify-between">
                                  <span className="text-muted-foreground">Reconciled credits remaining</span>
                                  <span className="font-medium">{typeof gammaBalanceData?.creditsRemaining === "number" ? gammaBalanceData.creditsRemaining.toLocaleString() : "-"}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-muted-foreground">Last snapshot</span>
                                  <span className="font-medium">{formatDate(gammaBalanceData?.lastSnapshotAt || null)}</span>
                                </div>
                                <div className="text-xs text-muted-foreground">Source: Gamma reconciliation (snapshot + ledger)</div>
                              </div>
                            ) : (
                              <div className="space-y-2 text-sm">
                                <div className="text-muted-foreground">
                                  {gammaBalanceData?.note || "No reconciled Gamma balance is available yet."}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  Use provider billing page for the live balance.
                                </div>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      )}

                      <Card>
                        <CardHeader>
                          <CardTitle>Secrets</CardTitle>
                          <CardDescription>Secrets are never returned in plain text after save.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {provider.secrets.length === 0 && (
                            <div className="text-sm text-muted-foreground">No secrets for this provider.</div>
                          )}
                          {provider.secrets.map((secret) => {
                            const draftKey = `${provider.provider}:${secret.key}`;
                            return (
                              <div key={secret.key} className="rounded-md border p-3 space-y-2">
                                <div className="flex items-center justify-between">
                                  <Label>{secret.label}</Label>
                                  <Badge variant={secret.configured ? "default" : "secondary"}>
                                    {secret.configured ? "configured" : "not set"}
                                  </Badge>
                                </div>
                                <div className="text-xs text-muted-foreground">Current: {secret.maskedValue || "-"}</div>
                                <div className="flex flex-col md:flex-row gap-2">
                                  <Input
                                    type="password"
                                    placeholder={`Enter ${secret.label}`}
                                    value={secretDrafts[draftKey] || ""}
                                    onChange={(e) => setSecretDrafts((prev) => ({ ...prev, [draftKey]: e.target.value }))}
                                  />
                                  <Button onClick={() => {
                                      const value = (secretDrafts[draftKey] || "").trim();
                                      if (!value) {
                                        toast({ variant: "destructive", title: "Missing value", description: "Enter a secret value first." });
                                        return;
                                      }
                                      saveSecretMutation.mutate({ provider: provider.provider, key: secret.key, value });
                                    }}
                                    disabled={saveSecretMutation.isPending}
                                  >
                                    Save
                                  </Button>
                                  <Button variant="destructive" onClick={() => deleteSecretMutation.mutate({ provider: provider.provider, key: secret.key })}
                                    disabled={deleteSecretMutation.isPending}
                                  >
                                    Delete
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle>Defaults</CardTitle>
                          <CardDescription>Provider-specific defaults used at runtime.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {provider.settings.map((setting) => {
                            const draftKey = `${provider.provider}:${setting.key}`;
                            const draftValue = getSettingDraftValue(provider.provider, setting);
                            const renderGeminiModelSelect = isGeminiModelSetting(provider.provider, setting.key);
                            const renderElevenLabsModelSelect = isElevenLabsModelSetting(provider.provider, setting.key);
                            const renderMailerSendTemplateSelect = isMailerSendTemplateSetting(provider.provider, setting.key);
                            const selectOptions = getSettingSelectOptions(provider.provider, setting);
                            const renderSettingSelect = selectOptions.length > 0;
                            const modelOptions = renderGeminiModelSelect
                              ? geminiModelOptions
                              : renderElevenLabsModelSelect
                                ? elevenLabsModelOptions
                                : renderMailerSendTemplateSelect
                                  ? mailerSendTemplateOptions
                                : [];
                            const modelsLoading = renderGeminiModelSelect
                              ? geminiModelsLoading
                              : renderElevenLabsModelSelect
                                ? elevenLabsModelsLoading
                                : renderMailerSendTemplateSelect
                                  ? mailerSendTemplatesLoading
                                : false;
                            return (
                              <div key={setting.key} className="rounded-md border p-3 space-y-2">
                                <div className="flex items-center justify-between">
                                  <Label>{setting.label}</Label>
                                  <Badge variant="outline">{setting.type}</Badge>
                                </div>
                                {renderGeminiModelSelect || renderElevenLabsModelSelect || renderMailerSendTemplateSelect ? (
                                  <div className="space-y-2">
                                    {modelsLoading ? (
                                      <div className="text-sm text-muted-foreground">
                                        {renderMailerSendTemplateSelect ? "Loading templates..." : "Loading latest models..."}
                                      </div>
                                    ) : (
                                      <Select
                                        value={draftValue || "__none__"}
                                        onValueChange={(value) =>
                                          setSettingDrafts((prev) => ({ ...prev, [draftKey]: value === "__none__" ? "" : value }))
                                        }
                                      >
                                        <SelectTrigger>
                                          <SelectValue placeholder={renderMailerSendTemplateSelect ? "Select template" : "Select model"} />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {renderMailerSendTemplateSelect && (
                                            <SelectItem value="__none__">None (use LearnPlay built-in template)</SelectItem>
                                          )}
                                          {modelOptions.length > 0 ? (
                                            modelOptions.map((option) => (
                                              <SelectItem key={option.value} value={option.value}>
                                                {option.label}
                                              </SelectItem>
                                            ))
                                          ) : (
                                            <SelectItem value={draftValue || "__no_model_options__"} disabled>
                                              {draftValue || "No models available"}
                                            </SelectItem>
                                          )}
                                        </SelectContent>
                                      </Select>
                                    )}
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-xs text-muted-foreground">
                                        {renderGeminiModelSelect
                                          ? (geminiModelData?.error || "Latest Gemini models are loaded from provider API.")
                                          : renderElevenLabsModelSelect
                                            ? (elevenLabsModelData?.error || "Latest ElevenLabs models are loaded from provider API.")
                                            : (mailerSendTemplateData?.error || "MailerSend templates are loaded from provider API.")}
                                      </span>
                                      <Button type="button" variant="outline" size="sm" onClick={() => {
                                          if (renderGeminiModelSelect) {
                                            queryClient.invalidateQueries({ queryKey: ["/api/admin/integrations/gemini/model-options"] });
                                          } else if (renderElevenLabsModelSelect) {
                                            queryClient.invalidateQueries({ queryKey: ["/api/admin/integrations/elevenlabs/model-options"] });
                                          } else {
                                            queryClient.invalidateQueries({ queryKey: ["/api/admin/integrations/mailersend/template-options"] });
                                          }
                                        }}
                                      >
                                        <RefreshCw className="h-4 w-4 mr-1" />
                                        Refresh
                                      </Button>
                                    </div>
                                  </div>
                                ) : renderSettingSelect ? (
                                  <Select
                                    value={draftValue}
                                    onValueChange={(value) => setSettingDrafts((prev) => ({ ...prev, [draftKey]: value }))}
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select value" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {selectOptions.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                          {option.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <Input
                                    value={draftValue}
                                    onChange={(e) => setSettingDrafts((prev) => ({ ...prev, [draftKey]: e.target.value }))}
                                  />
                                )}
                                {getSettingHelpText(provider.provider, setting.key) && (
                                  <div className="text-xs text-muted-foreground">{getSettingHelpText(provider.provider, setting.key)}</div>
                                )}
                                <div className="flex justify-end gap-2">
                                  <Button size="sm" variant="outline" onClick={() => testProviderMutation.mutate(provider.provider)}
                                    disabled={testProviderMutation.isPending}
                                  >
                                    Test
                                  </Button>
                                  <Button size="sm" onClick={() => {
                                      try {
                                        const parsed = parseSettingValue(setting, settingDrafts[draftKey] ?? String(setting.value ?? ""));
                                        saveSettingMutation.mutate({ provider: provider.provider, key: setting.key, value: parsed });
                                      } catch (error: any) {
                                        toast({ variant: "destructive", title: "Invalid value", description: error?.message || "Invalid setting value." });
                                      }
                                    }}
                                    disabled={saveSettingMutation.isPending}
                                  >
                                    Save Setting
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </CardContent>
                      </Card>

                      {provider.provider === "yoco" && (
                        <>
                          <Card>
                            <CardHeader>
                              <CardTitle>YOCO Mode (Cloud)</CardTitle>
                              <CardDescription>Select test or live payment mode.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                              <div className="flex items-center gap-3">
                                <Label className="min-w-24">Mode</Label>
                                <Select
                                  value={yocoPaymentSettingsData?.paymentSettings?.yocoMode || "test"}
                                  onValueChange={(value) => updateYocoModeMutation.mutate(value as "test" | "live")}
                                >
                                  <SelectTrigger className="max-w-sm">
                                    <SelectValue placeholder="Select mode" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="test">Test</SelectItem>
                                    <SelectItem value="live">Live</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="text-xs text-muted-foreground">
                                Current webhook URL: {yocoWebhookStatusData?.webhookUrl || "-"}
                              </div>
                            </CardContent>
                          </Card>

                          <Card>
                            <CardHeader>
                              <CardTitle>YOCO Webhooks</CardTitle>
                              <CardDescription>Register, inspect, and delete YOCO webhooks.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-3">
                              <div className="flex flex-wrap gap-2">
                                <Button onClick={() => registerYocoWebhookMutation.mutate()}
                                  disabled={registerYocoWebhookMutation.isPending}
                                >
                                  Register/Re-register Webhook
                                </Button>
                                <Button variant="outline" onClick={() => {
                                    refetchYocoWebhookStatus();
                                    refetchYocoWebhooks();
                                  }}
                                >
                                  Refresh
                                </Button>
                              </div>
                              <div className="text-sm">
                                Secret configured in Integration Settings:{" "}
                                <Badge variant={yocoWebhookStatusData?.webhookSecretConfigured ? "default" : "destructive"}>
                                  {yocoWebhookStatusData?.webhookSecretConfigured ? "yes" : "no"}
                                </Badge>
                              </div>
                              {latestWebhookSecret && (
                                <div className="rounded-md border p-3 text-xs text-muted-foreground">
                                  Latest registered webhook secret: <code>{latestWebhookSecret}</code>
                                </div>
                              )}
                              <div className="overflow-x-auto rounded-md border">
                                <table className="w-full text-sm">
                                  <thead className="bg-muted/40">
                                    <tr>
                                      <th className="px-3 py-2 text-left">Webhook ID</th>
                                      <th className="px-3 py-2 text-left">Name</th>
                                      <th className="px-3 py-2 text-left">URL</th>
                                      <th className="px-3 py-2 text-left">Actions</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {(yocoWebhooksData?.webhooks || []).map((webhook: any, index: number) => (
                                      <tr key={String(webhook?.id || webhook?.webhookId || `webhook-${index}`)} className="border-t">
                                        <td className="px-3 py-2 font-mono text-xs">{String(webhook?.id || webhook?.webhookId || "-")}</td>
                                        <td className="px-3 py-2">{String(webhook?.name || "-")}</td>
                                        <td className="px-3 py-2 font-mono text-xs">{String(webhook?.url || "-")}</td>
                                        <td className="px-3 py-2">
                                          <Button size="sm" variant="destructive" onClick={() => {
                                              const id = String(webhook?.id || webhook?.webhookId || "").trim();
                                              if (id) deleteYocoWebhookMutation.mutate(id);
                                            }}
                                            disabled={deleteYocoWebhookMutation.isPending}
                                          >
                                            Delete
                                          </Button>
                                        </td>
                                      </tr>
                                    ))}
                                    {(!yocoWebhooksData?.webhooks || yocoWebhooksData.webhooks.length === 0) && (
                                      <tr>
                                        <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                                          No YOCO webhooks found.
                                        </td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                              <div className="flex gap-2">
                                <Input
                                  placeholder="Webhook ID to delete manually"
                                  value={manualWebhookId}
                                  onChange={(e) => setManualWebhookId(e.target.value)}
                                />
                                <Button variant="destructive" onClick={() => {
                                    const id = manualWebhookId.trim();
                                    if (!id) {
                                      toast({ variant: "destructive", title: "Webhook ID required" });
                                      return;
                                    }
                                    deleteYocoWebhookMutation.mutate(id);
                                  }}
                                  disabled={deleteYocoWebhookMutation.isPending}
                                >
                                  Delete by ID
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        </>
                      )}
                    </TabsContent>
                  ))}
                </Tabs>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="logs" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Integration Event Log</CardTitle>
                <CardDescription>Recent provider operations and failures for troubleshooting.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label>Provider</Label>
                    <select
                      className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                      value={integrationLogProviderFilter}
                      onChange={(e) => setIntegrationLogProviderFilter(e.target.value)}
                    >
                      {providerOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <Label>Status</Label>
                    <select
                      className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                      value={integrationLogStatusFilter}
                      onChange={(e) => setIntegrationLogStatusFilter(e.target.value)}
                    >
                      <option value="all">All Statuses</option>
                      <option value="success">Success</option>
                      <option value="failure">Failure</option>
                      <option value="degraded">Degraded</option>
                    </select>
                  </div>
                </div>

                {logsLoading && <div className="text-sm text-muted-foreground">Loading logs...</div>}

                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="px-3 py-2 text-left">Time</th>
                        <th className="px-3 py-2 text-left">Provider</th>
                        <th className="px-3 py-2 text-left">Operation</th>
                        <th className="px-3 py-2 text-left">Status</th>
                        <th className="px-3 py-2 text-left">Message</th>
                        <th className="px-3 py-2 text-left">Duration</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(integrationLogsData?.logs || []).map((log) => (
                        <tr key={log.id} className="border-t">
                          <td className="px-3 py-2">{formatDate(log.createdAt)}</td>
                          <td className="px-3 py-2">{log.provider}</td>
                          <td className="px-3 py-2">{log.operation}</td>
                          <td className="px-3 py-2">
                            <Badge variant={log.status === "success" ? "default" : log.status === "degraded" ? "secondary" : "destructive"}>
                              {log.status}
                            </Badge>
                          </td>
                          <td className="px-3 py-2">{log.message || "-"}</td>
                          <td className="px-3 py-2">{log.durationMs != null ? `${log.durationMs} ms` : "-"}</td>
                        </tr>
                      ))}
                      {(!integrationLogsData?.logs || integrationLogsData.logs.length === 0) && (
                        <tr>
                          <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">No integration logs found.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="audit" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle>System Change Audit</CardTitle>
                <CardDescription>Critical integration and settings change history.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Input
                  placeholder="Filter by key..."
                  value={systemChangeSearch}
                  onChange={(e) => setSystemChangeSearch(e.target.value)}
                />

                {systemChangesLoading && <div className="text-sm text-muted-foreground">Loading system changes...</div>}

                <div className="overflow-x-auto rounded-md border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="px-3 py-2 text-left">Time</th>
                        <th className="px-3 py-2 text-left">Domain</th>
                        <th className="px-3 py-2 text-left">Action</th>
                        <th className="px-3 py-2 text-left">Provider</th>
                        <th className="px-3 py-2 text-left">Key</th>
                        <th className="px-3 py-2 text-left">Secret</th>
                        <th className="px-3 py-2 text-left">Actor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(systemChangesData?.logs || []).map((log) => (
                        <tr key={log.id} className="border-t">
                          <td className="px-3 py-2">{formatDate(log.createdAt)}</td>
                          <td className="px-3 py-2">{log.domain}</td>
                          <td className="px-3 py-2">{log.action}</td>
                          <td className="px-3 py-2">{log.provider || "-"}</td>
                          <td className="px-3 py-2 font-mono text-xs">{log.key}</td>
                          <td className="px-3 py-2">{log.isSecret ? "yes" : "no"}</td>
                          <td className="px-3 py-2 font-mono text-xs">{log.actorUserId || "system"}</td>
                        </tr>
                      ))}
                      {(!systemChangesData?.logs || systemChangesData.logs.length === 0) && (
                        <tr>
                          <td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">No system change events found.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {isLoading && <div className="text-sm text-muted-foreground">Loading integration settings...</div>}
      {!isLoading && providers.length === 0 && (
        <div className="text-sm text-muted-foreground">No integration providers available.</div>
      )}
    </QuizAdminLayout>
  );
}
