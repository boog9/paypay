import { API_PREFIX, BFF } from './api';

const BFF_URL = new URL(BFF);
const BFF_ORIGIN = BFF_URL.origin.replace(/\/$/, '');
const BFF_API_BASE_URL = `${BFF_ORIGIN}${API_PREFIX}`.replace(/\/$/, '');

export function getBffOrigin(): string {
  return BFF_ORIGIN;
}

export function getBffApiBaseUrl(): string {
  return BFF_API_BASE_URL;
}
