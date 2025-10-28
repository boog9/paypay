// We test the side-effectful cookies.util module under different environments.
function freshImportWithEnv(env: Record<string, string | undefined>) {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  // Reset the module cache so top-level code executes again
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('../src/auth/cookies.util');
  Object.assign(process.env, saved);
  return mod;
}

describe('sharedCookieDomain policy', () => {
  const savedEnv = { ...process.env };

  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    process.env = { ...savedEnv };
  });

  it('warns (does not throw) in development when domain is missing', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.PAYPAY_DOMAIN;
    delete process.env.PAYPAY_API_DOMAIN;

    const spy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => freshImportWithEnv(process.env)).not.toThrow();
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining('Shared cookie domain was not resolved')
    );
    spy.mockRestore();
  });

  it('throws in production when domain is missing', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.PAYPAY_DOMAIN;
    delete process.env.PAYPAY_API_DOMAIN;

    expect(() => freshImportWithEnv(process.env)).toThrow(/Shared cookie domain was not resolved/);
  });

  it('does not throw when domain is resolvable', () => {
    process.env.NODE_ENV = 'production';
    process.env.PAYPAY_DOMAIN = 'paypay.iddqd.in';
    process.env.PAYPAY_API_DOMAIN = 'api.paypay.iddqd.in';

    expect(() => freshImportWithEnv(process.env)).not.toThrow();
  });
});
