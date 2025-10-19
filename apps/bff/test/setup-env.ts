import { randomBytes } from 'crypto';

process.env.NODE_ENV = 'test';
process.env.DB_TYPE = process.env.DB_TYPE ?? 'sqlite';
process.env.DB_DATABASE = process.env.DB_DATABASE ?? ':memory:';

const strongHex = (bytes: number) => randomBytes(bytes).toString('hex');
const strongBase64 = (bytes: number) => randomBytes(bytes).toString('base64');

process.env.JWT_ACCESS_TOKEN_SECRET = process.env.JWT_ACCESS_TOKEN_SECRET ?? strongHex(48);
process.env.JWT_REFRESH_TOKEN_SECRET = process.env.JWT_REFRESH_TOKEN_SECRET ?? strongHex(48);
process.env.COOKIE_SECRET = process.env.COOKIE_SECRET ?? strongHex(48);
process.env.CSRF_PEPPER = process.env.CSRF_PEPPER ?? strongBase64(48);
process.env.FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000';
process.env.CORS_ORIGIN = process.env.CORS_ORIGIN ?? process.env.FRONTEND_ORIGIN;
process.env.PAYPAY_DOMAIN = process.env.PAYPAY_DOMAIN ?? '.iddqd.in';
process.env.PAYPAY_API_DOMAIN = process.env.PAYPAY_API_DOMAIN ?? 'api.paypay.test';
process.env.BTCPAY_SERVER_URL = process.env.BTCPAY_SERVER_URL ?? 'https://btcpay.local';
process.env.BTCPAY_ADMIN_API_KEY = process.env.BTCPAY_ADMIN_API_KEY ?? strongHex(32);
process.env.BTCPAY_MASTER_KEY = process.env.BTCPAY_MASTER_KEY ?? strongBase64(48);
process.env.BTCPAY_WEBHOOK_URL = process.env.BTCPAY_WEBHOOK_URL ?? 'https://api.local/hooks/btcpay';
process.env.BTCPAY_HEALTH_STORE_ID = process.env.BTCPAY_HEALTH_STORE_ID ?? 'store-health';
process.env.BTCPAY_HEALTH_API_KEY = process.env.BTCPAY_HEALTH_API_KEY ?? strongHex(32);
