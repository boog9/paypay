import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as path from 'path';

const requireEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`[database] Missing required environment variable: ${key}`);
  }
  return value;
};

const postgresPort = Number(requireEnv('POSTGRES_PORT'));
if (Number.isNaN(postgresPort)) {
  throw new Error('[database] POSTGRES_PORT must be a valid number');
}

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: requireEnv('POSTGRES_HOST'),
  port: postgresPort,
  username: requireEnv('POSTGRES_USER'),
  password: requireEnv('POSTGRES_PASSWORD'),
  database: requireEnv('POSTGRES_DB'),
  ssl: false,
  entities: [__dirname + '/../**/*.entity.{js,ts}'],
  migrations:
    process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test'
      ? ['src/migrations/*.ts']
      : [path.join(__dirname, '../migrations/*.js')],
  migrationsTableName: 'migrations',
  synchronize: false,
  logging: ['warn', 'error']
});
