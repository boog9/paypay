process.env.NODE_ENV = 'test';
process.env.DB_TYPE = process.env.DB_TYPE ?? 'sqlite';
process.env.DB_DATABASE = process.env.DB_DATABASE ?? ':memory:';
process.env.JWT_ACCESS_TOKEN_SECRET = process.env.JWT_ACCESS_TOKEN_SECRET ?? 'test-access-secret';
process.env.JWT_REFRESH_TOKEN_SECRET = process.env.JWT_REFRESH_TOKEN_SECRET ?? 'test-refresh-secret';
process.env.COOKIE_SECRET =
  process.env.COOKIE_SECRET ?? 'test-cookie-secret-should-be-at-least-32-characters';
process.env.FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000';
process.env.PAYPAY_DOMAIN = process.env.PAYPAY_DOMAIN ?? 'paypay.test';
process.env.PAYPAY_API_DOMAIN = process.env.PAYPAY_API_DOMAIN ?? 'api.paypay.test';
process.env.BTCPAY_SERVER_URL = process.env.BTCPAY_SERVER_URL ?? 'https://btcpay.local';
process.env.BTCPAY_ADMIN_API_KEY = process.env.BTCPAY_ADMIN_API_KEY ?? 'test-admin-api-key';
process.env.BTCPAY_MASTER_KEY =
  process.env.BTCPAY_MASTER_KEY ?? Buffer.from('0123456789abcdef0123456789abcdef').toString('base64');
process.env.BTCPAY_WEBHOOK_URL = process.env.BTCPAY_WEBHOOK_URL ?? 'https://api.local/hooks/btcpay';
process.env.BTCPAY_HEALTH_STORE_ID = process.env.BTCPAY_HEALTH_STORE_ID ?? 'store-health';
process.env.BTCPAY_HEALTH_API_KEY = process.env.BTCPAY_HEALTH_API_KEY ?? 'health-api-key';
