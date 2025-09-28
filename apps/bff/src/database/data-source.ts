import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as path from 'path';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.POSTGRES_HOST || 'postgres',
  port: Number(process.env.POSTGRES_PORT || 5432),
  username: process.env.POSTGRES_USER || 'paypay',
  password: process.env.POSTGRES_PASSWORD || 'paypay',
  database: process.env.POSTGRES_DB || 'paypay',
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
