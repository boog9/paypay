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
  'X-Csrf-Token',
  'x-csrf-token',
  'Idempotency-Key',
  'idempotency-key'
] as const;
export const CORS_EXPOSED_HEADERS = ['X-Csrf-Token'] as const;
