export const TIMESTAMP_COLUMN_TYPE =
  process.env.DB_TYPE === 'sqlite' || process.env.NODE_ENV === 'test' ? 'datetime' : 'timestamptz';
