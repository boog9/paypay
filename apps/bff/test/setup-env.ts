process.env.NODE_ENV = 'test';
process.env.DB_TYPE = process.env.DB_TYPE ?? 'sqlite';
process.env.DB_DATABASE = process.env.DB_DATABASE ?? ':memory:';
process.env.JWT_ACCESS_TOKEN_SECRET = process.env.JWT_ACCESS_TOKEN_SECRET ?? 'test-access-secret';
process.env.JWT_REFRESH_TOKEN_SECRET = process.env.JWT_REFRESH_TOKEN_SECRET ?? 'test-refresh-secret';
process.env.FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000';
process.env.BTCPAY_URL = process.env.BTCPAY_URL ?? 'https://btcpay.local';
process.env.BTCPAY_ADMIN_API_KEY = process.env.BTCPAY_ADMIN_API_KEY ?? 'test-admin-api-key';
process.env.BTCPAY_MASTER_KEY =
  process.env.BTCPAY_MASTER_KEY ?? Buffer.from('0123456789abcdef0123456789abcdef').toString('base64');
process.env.BTCPAY_WEBHOOK_URL = process.env.BTCPAY_WEBHOOK_URL ?? 'https://api.local/hooks/btcpay';
process.env.BTCPAY_HEALTH_STORE_ID = process.env.BTCPAY_HEALTH_STORE_ID ?? 'store-health';
process.env.BTCPAY_HEALTH_API_KEY = process.env.BTCPAY_HEALTH_API_KEY ?? 'health-api-key';
