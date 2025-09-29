function sanitizeOrigin(raw?: string | null): string | undefined {
  if (!raw) {
    return undefined;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    const url = new URL(trimmed);
    return url.origin;
  } catch {
    return trimmed.replace(/\/$/, '');
  }
}

function sanitizeBasePath(raw?: string | null): string {
  const fallback = '/api';
  if (!raw) {
    return fallback;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return fallback;
  }
  const withLeading = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeading.replace(/\/+$/, '') || fallback;
}

function resolveRuntimeOrigin(): string | undefined {
  const envOrigin = sanitizeOrigin(process.env.NEXT_PUBLIC_BFF_URL);
  if (envOrigin) {
    return envOrigin;
  }

  if (typeof window !== 'undefined') {
    return sanitizeOrigin(window.location.origin);
  }

  if (process.env.NODE_ENV !== 'production') {
    return 'http://localhost:3000';
  }

  return undefined;
}

export function getApiBasePath(): string {
  return sanitizeBasePath(process.env.NEXT_PUBLIC_API_BASE);
}

export function getBffOrigin(): string | undefined {
  return resolveRuntimeOrigin();
}

export function getBffApiBaseUrl(): string {
  const origin = resolveRuntimeOrigin();
  const basePath = getApiBasePath();

  if (!origin) {
    return basePath;
  }

  return `${origin}${basePath}`;
}
