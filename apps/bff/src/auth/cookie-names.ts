export type CookieNames = {
  access: string;
  refresh: string;
  csrfSecret: string;
  legacyAccess: string;
  legacyRefresh: string;
  legacyCsrfSecret: string;
};

export function resolveCookieNames(): CookieNames {
  return {
    access: '__Host-pp.access-token',
    refresh: '__Host-pp.refresh-token',
    csrfSecret: '__Host-pp.csrf.secret',
    legacyAccess: 'pp.access-token',
    legacyRefresh: 'pp.refresh-token',
    legacyCsrfSecret: 'pp.csrf.secret',
  };
}
