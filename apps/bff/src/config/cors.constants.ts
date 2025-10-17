export const CORS_ALLOWED_METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
export const CORS_ALLOWED_HEADERS = [
  'Authorization',
  'Content-Type',
  'Accept',
  'X-Requested-With',
  'X-CSRF-Token',
  'Idempotency-Key'
];
// if the frontend needs to read service headers from the response, expose them here
export const CORS_EXPOSED_HEADERS = [
  'Content-Length',
  'ETag'
];
