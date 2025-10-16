import { API_PREFIX, BFF } from './api';

function parseBffUrl(value: string): URL | null {
  if (!value) {
    return null;
  }

  try {
    return new URL(value);
  } catch (error) {
    throw new Error(
      'NEXT_PUBLIC_BFF_URL must be a valid absolute URL when provided.',
      { cause: error }
    );
  }
}

const BFF_URL = parseBffUrl(BFF);
const BFF_ORIGIN = (BFF_URL?.origin ?? '').replace(/\/$/, '');
const BFF_API_BASE_URL = (BFF_ORIGIN ? `${BFF_ORIGIN}${API_PREFIX}` : API_PREFIX).replace(/\/$/, '');

export function getBffOrigin(): string {
  return BFF_ORIGIN;
}

export function getBffApiBaseUrl(): string {
  return BFF_API_BASE_URL;
}
