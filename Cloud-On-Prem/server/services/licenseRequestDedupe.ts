type IdentityLike = {
  hardwareKey?: string | null;
  hostname?: string | null;
  serverBaseUrl?: string | null;
};

type RequestLike = IdentityLike & {
  id?: string;
  systemType?: string | null;
  requestType?: string | null;
  status?: string | null;
};

function normalizeIdentityValue(input: unknown): string {
  return String(input || '').trim().toLowerCase();
}

function extractHostname(input: string | null | undefined): string | null {
  const raw = String(input || '').trim();
  if (!raw) return null;
  try {
    const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(withProtocol);
    const host = normalizeIdentityValue(url.hostname);
    return host || null;
  } catch {
    return null;
  }
}

export function buildLicenseRequestIdentityTokens(input: IdentityLike): string[] {
  const tokens = new Set<string>();

  const hardwareKey = normalizeIdentityValue(input.hardwareKey);
  if (hardwareKey) tokens.add(`hw:${hardwareKey}`);

  const hostname = extractHostname(input.hostname || null) || normalizeIdentityValue(input.hostname);
  if (hostname) tokens.add(`host:${hostname}`);

  const serverHost = extractHostname(input.serverBaseUrl || null);
  if (serverHost) {
    tokens.add(`host:${serverHost}`);
    tokens.add(`urlhost:${serverHost}`);
  }

  return Array.from(tokens).sort();
}

function normalizeSystemType(input: unknown): string {
  const normalized = normalizeIdentityValue(input);
  if (normalized === 'dev' || normalized === 'onprem') return 'development';
  if (normalized === 'acc' || normalized === 'test' || normalized === 'testing') return 'qa';
  if (normalized === 'prod' || normalized === 'prd') return 'production';
  return normalized;
}

function sameDomain(request: RequestLike, target: RequestLike): boolean {
  const requestSystem = normalizeSystemType(request.systemType);
  const targetSystem = normalizeSystemType(target.systemType);
  if (requestSystem && targetSystem && requestSystem !== targetSystem) return false;

  const requestType = normalizeIdentityValue(request.requestType || 'initial');
  const targetType = normalizeIdentityValue(target.requestType || 'initial');
  if (requestType && targetType && requestType !== targetType) return false;

  const requestStatus = normalizeIdentityValue(request.status);
  const targetStatus = normalizeIdentityValue(target.status);
  if (requestStatus && targetStatus && requestStatus !== targetStatus) return false;

  return true;
}

function sameIdentityIgnoringStatus(request: RequestLike, target: RequestLike): boolean {
  return requestsShareIdentity(
    { ...request, status: null },
    { ...target, status: null },
  );
}

export function requestsShareIdentity(request: RequestLike, target: RequestLike): boolean {
  if (!sameDomain(request, target)) return false;
  const requestTokens = buildLicenseRequestIdentityTokens(request);
  const targetTokens = buildLicenseRequestIdentityTokens(target);
  if (requestTokens.length === 0 || targetTokens.length === 0) return false;
  const targetTokenSet = new Set(targetTokens);
  return requestTokens.some((token) => targetTokenSet.has(token));
}

export function findLatestMatchingPendingRequest<T extends RequestLike>(requests: T[], target: RequestLike): T | null {
  for (const request of requests) {
    if (requestsShareIdentity(request, target)) {
      return request;
    }
  }
  return null;
}

export function findLatestMatchingLicenseRequest<T extends RequestLike>(requests: T[], target: RequestLike): T | null {
  for (const request of requests) {
    if (requestsShareIdentity(request, target)) {
      return request;
    }
  }
  return null;
}

export function compactLicenseRequestsToLatest<T extends RequestLike>(requests: T[]): T[] {
  const kept: T[] = [];
  const compacted: T[] = [];

  for (const request of requests) {
    const tokens = buildLicenseRequestIdentityTokens(request);
    if (tokens.length === 0) {
      compacted.push(request);
      continue;
    }

    const hasMatch = kept.some((existing) => requestsShareIdentity(existing, request));
    if (hasMatch) {
      continue;
    }

    kept.push(request);
    compacted.push(request);
  }

  return compacted.filter((request) => {
    const status = normalizeIdentityValue(request.status);
    if (status !== 'pending') return true;
    return !compacted.some((candidate) => {
      if (candidate === request) return false;
      const candidateStatus = normalizeIdentityValue(candidate.status);
      if (candidateStatus !== 'approved' && candidateStatus !== 'denied') return false;
      return sameIdentityIgnoringStatus(candidate, request);
    });
  });
}

export function compactPendingLicenseRequestsToLatest<T extends RequestLike>(requests: T[]): T[] {
  return compactLicenseRequestsToLatest(requests);
}
