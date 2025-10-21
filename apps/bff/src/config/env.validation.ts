import { z } from 'zod';

const isHttps = (value: string): boolean => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
};

const base64Min32 = z
  .string({
    required_error: 'Environment variable is required',
    invalid_type_error: 'Environment variable must be a string'
  })
  .refine((val) => {
    try {
      const bytes = Buffer.from(val, 'base64');
      return bytes.length >= 32;
    } catch {
      return false;
    }
  }, 'must be Base64 of at least 32 bytes');

const base64Exact32 = z
  .string({
    required_error: 'Environment variable is required',
    invalid_type_error: 'Environment variable must be a string'
  })
  .refine((val) => {
    try {
      const bytes = Buffer.from(val, 'base64');
      return bytes.length === 32;
    } catch {
      return false;
    }
  }, 'must be Base64 of exactly 32 bytes');

export const EnvSchema = z
  .object({
    NODE_ENV: z.string().default('production'),
    PORT: z.coerce.number().default(3000),
    TRUST_PROXY: z.union([z.coerce.number(), z.string()]).default('loopback'),

    COOKIE_SECRET: z.string().min(32, 'must be at least 32 chars or Base64'),
    CSRF_PEPPER: base64Min32,
    JWT_ACCESS_TOKEN_SECRET: z.string().min(32),
    JWT_REFRESH_TOKEN_SECRET: z.string().min(32),

    FRONTEND_ORIGIN: z.string().url(),
    PAYPAY_DOMAIN: z.string(),
    PAYPAY_API_DOMAIN: z.string(),

    BTCPAY_SERVER_URL: z.string().url(),
    BTCPAY_ADMIN_API_KEY: z.string().min(1),
    BTCPAY_WEBHOOK_URL: z.string().url(),
    BTCPAY_MASTER_KEY: base64Exact32,
    BTCPAY_API_KEY_PEPPER: base64Min32,
    BTCPAY_HEALTH_STORE_ID: z.string().optional(),
    BTCPAY_HEALTH_API_KEY: z.string().optional(),
    REVOKE_BOOTSTRAP_AFTER_CREATE: z.coerce.boolean().default(true),

    DATABASE_URL: z.string().optional(),
    POSTGRES_HOST: z.string().min(1),
    POSTGRES_PORT: z.coerce.number().default(5432),
    POSTGRES_USER: z.string().min(1),
    POSTGRES_PASSWORD: z.string().min(1),
    POSTGRES_DB: z.string().min(1),

    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().optional(),
    SMTP_USERNAME: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    SMTP_FROM_EMAIL: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.NODE_ENV === 'production') {
      if (!process.env.BTCPAY_MASTER_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'BTCPAY_MASTER_KEY must be set in production environments.',
          path: ['BTCPAY_MASTER_KEY']
        });
      }
      if (!process.env.FRONTEND_ORIGIN || !isHttps(val.FRONTEND_ORIGIN)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'FRONTEND_ORIGIN must be set and use HTTPS in production.',
          path: ['FRONTEND_ORIGIN']
        });
      }
    }
  });

export type Env = z.infer<typeof EnvSchema>;

export function getEnv(): Env {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    // Pretty print all errors and exit fast
    console.error('[Config] Invalid environment variables:', parsed.error.format());
    process.exit(1);
  }
  const e = parsed.data;
  // Additional security assertions
  if (e.COOKIE_SECRET === e.JWT_ACCESS_TOKEN_SECRET || e.COOKIE_SECRET === e.JWT_REFRESH_TOKEN_SECRET) {
    console.error('[Config] COOKIE_SECRET must differ from JWT secrets.');
    process.exit(1);
  }
  for (const [key, value] of Object.entries(e)) {
    if (value === undefined || value === null) {
      continue;
    }
    process.env[key] = typeof value === 'string' ? value : String(value);
  }
  return e;
}
