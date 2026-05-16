export function decideBootstrapEmailProvider(params: {
  hasExplicitProviderSetting: boolean;
  smtpHost: string;
  mailerSendApiKey: string;
}): "smtp" | "mailersend" | null {
  if (params.hasExplicitProviderSetting) return null;
  if (params.smtpHost.trim()) return "smtp";
  if (params.mailerSendApiKey.trim()) return "mailersend";
  return null;
}

