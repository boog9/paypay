describe('shared cookie domain bootstrap', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalPaypayDomain = process.env.PAYPAY_DOMAIN;
  const originalPaypayApiDomain = process.env.PAYPAY_API_DOMAIN;

  beforeEach(() => {
    jest.resetModules();
  });

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }

    if (originalPaypayDomain === undefined) {
      delete process.env.PAYPAY_DOMAIN;
    } else {
      process.env.PAYPAY_DOMAIN = originalPaypayDomain;
    }

    if (originalPaypayApiDomain === undefined) {
      delete process.env.PAYPAY_API_DOMAIN;
    } else {
      process.env.PAYPAY_API_DOMAIN = originalPaypayApiDomain;
    }

    jest.restoreAllMocks();
  });

  it('throws in production when no shared cookie domain can be resolved', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.PAYPAY_DOMAIN;
    delete process.env.PAYPAY_API_DOMAIN;

    await expect(import('../src/auth/cookies.util')).rejects.toThrow(
      /Shared cookie domain was not resolved/
    );
  });

  it('throws in production when PAYPAY_DOMAIN and PAYPAY_API_DOMAIN do not share a suffix', async () => {
    process.env.NODE_ENV = 'production';
    process.env.PAYPAY_DOMAIN = 'paypay.internal';
    process.env.PAYPAY_API_DOMAIN = 'api.example.com';

    await expect(import('../src/auth/cookies.util')).rejects.toThrow(
      /Shared cookie domain was not resolved/
    );
  });

  it('logs a warning outside production when the domain is missing', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.PAYPAY_DOMAIN;
    delete process.env.PAYPAY_API_DOMAIN;

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const module = await import('../src/auth/cookies.util');

    expect(module.sharedCookieDomain).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Shared cookie domain was not resolved')
    );
  });

  it('computes a shared domain when both hosts share the same suffix', async () => {
    process.env.NODE_ENV = 'production';
    process.env.PAYPAY_DOMAIN = 'https://paypay.iddqd.in';
    process.env.PAYPAY_API_DOMAIN = 'https://api.paypay.iddqd.in';

    const module = await import('../src/auth/cookies.util');

    expect(module.sharedCookieDomain).toBe('.paypay.iddqd.in');
  });
});
