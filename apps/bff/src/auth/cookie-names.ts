export type CookieNames = {
  access: string;
  refresh: string;
  csrfSecret: string;
};

export function resolveCookieNames(): CookieNames {
  return {
    access: '__Host-pp.access-token',
    refresh: '__Host-pp.refresh-token',
    csrfSecret: '__Host-pp.csrf.secret',
  };
}
