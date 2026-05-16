export function getBaseUrl(): string {
  const url = process.env.BASE_URL?.trim();
  if (!url) {
    throw new Error("BASE_URL environment variable is required");
  }
  return url.replace(/\/+$/, '');
}

export function getFrontendUrl(): string {
  const url = process.env.FRONTEND_URL?.trim() || getBaseUrl();
  return url.replace(/\/+$/, '');
}

export function getEmailFrom(): string {
  return process.env.EMAIL_FROM || 'contact@learnplay.co.za';
}

export function getPlatformDomains(): string[] {
  const extraDomains = process.env.PLATFORM_DOMAINS || '';
  const baseHost = new URL(getBaseUrl()).hostname;
  const defaults = ['localhost', '127.0.0.1', baseHost];
  const extra = extraDomains.split(',').map(d => d.trim()).filter(d => d.length > 0);
  const combined = [...defaults, ...extra];
  const unique = new Set(combined);
  return Array.from(unique);
}
