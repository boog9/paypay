const API_BASE_PATH = '/api';

function assertBffOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_BFF_URL;
  if (!raw) {
    throw new Error('NEXT_PUBLIC_BFF_URL must be defined at build time.');
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('NEXT_PUBLIC_BFF_URL cannot be empty.');
  }

  let origin: string;
  try {
    const url = new URL(trimmed);
    origin = url.origin;
  } catch (error) {
    throw new Error('NEXT_PUBLIC_BFF_URL must be an absolute URL including protocol.');
  }

  return origin.replace(/\/$/, '');
}

const BFF_ORIGIN = assertBffOrigin();
const BFF_API_BASE_URL = `${BFF_ORIGIN}${API_BASE_PATH}`.replace(/\/$/, '');

export function getBffOrigin(): string {
  return BFF_ORIGIN;
}

export function getBffApiBaseUrl(): string {
  return BFF_API_BASE_URL;
}
