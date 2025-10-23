export class BTCPayError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'BTCPayError';
  }
}

export class BTCPayAuthError extends BTCPayError {
  constructor(message = 'BTCPay authentication failed', cause?: unknown) {
    super(message, cause);
    this.name = 'BTCPayAuthError';
  }
}

export class BTCPayUpstreamError extends BTCPayError {
  constructor(message = 'Upstream error', cause?: unknown, public readonly status?: number) {
    super(message, cause);
    this.name = 'BTCPayUpstreamError';
  }
}

export function isBTCPayAuthError(error: unknown): error is BTCPayAuthError {
  return error instanceof BTCPayAuthError;
}

export function isBTCPayUpstreamError(error: unknown): error is BTCPayUpstreamError {
  return error instanceof BTCPayUpstreamError;
}
