import type { Request } from 'express';
import { AppThrottlerGuard } from '../src/app.throttler.guard';

describe('AppThrottlerGuard getTracker', () => {
  function createGuard(): AppThrottlerGuard {
    const options = { throttlers: [] } as any;
    const storageService = {
      increment: jest.fn().mockResolvedValue({ totalHits: 0, timeToExpire: 0 }),
      decrement: jest.fn(),
      getRecord: jest.fn().mockResolvedValue({ totalHits: 0, timeToExpire: 0 }),
      resetRecord: jest.fn(),
    } as any;
    const reflector = { get: jest.fn() } as any;
    return new AppThrottlerGuard(options, storageService, reflector);
  }

  function buildRequest(overrides: Partial<Request> & { user?: { id?: string | null } | undefined } = {}): Request {
    return {
      method: 'GET',
      headers: {},
      baseUrl: '/api',
      path: '/wallets',
      socket: { remoteAddress: '198.51.100.10' } as any,
      ...overrides,
    } as Request;
  }

  it('generates different keys for distinct user identifiers', async () => {
    const guard = createGuard();
    const first = (await (guard as any).getTracker(
      buildRequest({ user: { id: 'user-a' } })
    )) as string;
    const second = (await (guard as any).getTracker(
      buildRequest({ user: { id: 'user-b' } })
    )) as string;

    expect(first).not.toEqual(second);
  });

  it('prefers the first forwarded IP address when available', async () => {
    const guard = createGuard();
    const request = buildRequest({
      headers: {
        'x-forwarded-for': '203.0.113.5, 198.51.100.1',
        'cf-connecting-ip': '198.51.100.2',
      },
      user: { id: 'merchant-1' },
    });

    const tracker = (await (guard as any).getTracker(request)) as string;

    expect(tracker).toContain('merchant-1:203.0.113.5:GET:/api/wallets');
  });

  it('returns identical keys for identical context values', async () => {
    const guard = createGuard();
    const template = buildRequest({
      user: { id: 'merchant-2' },
      headers: { 'cf-connecting-ip': '203.0.113.7' },
    });

    const first = (await (guard as any).getTracker(template)) as string;
    const second = (await (guard as any).getTracker(template)) as string;

    expect(first).toEqual(second);
  });
});
