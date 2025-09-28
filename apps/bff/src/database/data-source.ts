import 'reflect-metadata';
import { DataSource } from 'typeorm';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.POSTGRES_HOST || 'postgres',
  port: Number(process.env.POSTGRES_PORT || 5432),
  username: process.env.POSTGRES_USER || 'paypay',
  password: process.env.POSTGRES_PASSWORD || 'paypay',
  database: process.env.POSTGRES_DB || 'paypay',
  ssl: false,
  entities: [__dirname + '/../**/*.entity.{js,ts}'],
  migrations: [__dirname + '/../migrations/*.{js,ts}'],
  migrationsTableName: 'migrations',
  synchronize: false,
  logging: ['warn', 'error']
});
