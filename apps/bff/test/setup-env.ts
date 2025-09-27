process.env.NODE_ENV = 'test';
process.env.DB_TYPE = process.env.DB_TYPE ?? 'sqlite';
process.env.DB_DATABASE = process.env.DB_DATABASE ?? ':memory:';
process.env.JWT_ACCESS_TOKEN_SECRET = process.env.JWT_ACCESS_TOKEN_SECRET ?? 'test-access-secret';
process.env.JWT_REFRESH_TOKEN_SECRET = process.env.JWT_REFRESH_TOKEN_SECRET ?? 'test-refresh-secret';
process.env.FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000';
process.env.BTCPAY_URL = process.env.BTCPAY_URL ?? 'https://btcpay.local';
process.env.BTCPAY_API_KEY = process.env.BTCPAY_API_KEY ?? 'test-api-key';
