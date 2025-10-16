import { describe, expect, it } from 'vitest';

import config from './next.config';

describe('next.config redirects', () => {
  it('redirects /portal to /dashboard', async () => {
    const redirects = await config.redirects?.();
    expect(redirects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: '/portal',
          destination: '/dashboard',
          permanent: true
        })
      ])
    );
  });
});
