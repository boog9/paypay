import { getEnv } from 'src/config/env.validation';

export type CookieNames = {
  access: string;
  refresh: string;
  csrfSecret: string;
  legacyAccess: string;
  legacyRefresh: string;
  legacyCsrfSecret: string;
};

export function resolveCookieNames(): CookieNames {
  const env = getEnv();
  const url = new URL(env.FRONTEND_ORIGIN);
  const isLocal = ['localhost', '127.0.0.1'].some(
    (host) => url.hostname === host || url.hostname.endsWith(`.${host}`)
  );

  const prefix = isLocal ? '' : '__Host-';
  return {
    access: `${prefix}pp.access-token`,
    refresh: `${prefix}pp.refresh-token`,
    csrfSecret: `${prefix}pp.csrf.secret`,
    legacyAccess: 'pp.access-token',
    legacyRefresh: 'pp.refresh-token',
    legacyCsrfSecret: 'pp.csrf.secret',
  };
}
