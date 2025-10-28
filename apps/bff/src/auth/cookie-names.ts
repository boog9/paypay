export type CookieNames = {
  access: string;
  refresh: string;
  csrfSecret: string;
  legacyAccess: readonly string[];
  legacyRefresh: readonly string[];
  legacyCsrfSecret: readonly string[];
};

export function resolveCookieNames(): CookieNames {
  return {
    access: 'pp.access-token',
    refresh: 'pp.refresh-token',
    csrfSecret: 'pp.csrf.secret',
    legacyAccess: ['__Host-pp.access-token'],
    legacyRefresh: ['__Host-pp.refresh-token'],
    legacyCsrfSecret: ['__Host-pp.csrf.secret'],
  };
}
