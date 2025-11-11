export const CSRF_HEADER = 'X-CSRF-Token' as const;
export const CSRF_HEADER_LOWER = CSRF_HEADER.toLowerCase() as Lowercase<typeof CSRF_HEADER>;
