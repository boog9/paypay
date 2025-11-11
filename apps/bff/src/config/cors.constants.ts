import { CSRF_HEADER, CSRF_HEADER_LOWER } from '../security/csrf.constants';

export const CORS_ALLOWED_METHODS = [
  'GET',
  'HEAD',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'OPTIONS'
] as const;
export const CORS_ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  CSRF_HEADER,
  CSRF_HEADER_LOWER,
  'Idempotency-Key',
  'idempotency-key'
] as const;
export const CORS_EXPOSED_HEADERS = [CSRF_HEADER] as const;
