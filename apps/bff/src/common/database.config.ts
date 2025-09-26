import { Injectable } from "@nestjs/common";
import { TypeOrmOptionsFactory, TypeOrmModuleOptions } from "@nestjs/typeorm";
import { entities } from "./entities";

@Injectable()
export class DatabaseConfig implements TypeOrmOptionsFactory {
  createTypeOrmOptions(): TypeOrmModuleOptions {
    return {
      type: "postgres",
      host: process.env.POSTGRES_HOST || "postgres",
      port: Number(process.env.POSTGRES_PORT) || 5432,
      username: process.env.POSTGRES_USER || "paypay",
      password: process.env.POSTGRES_PASSWORD || "paypay",
      database: process.env.POSTGRES_DB || "paypay",
      entities,
      synchronize: false,
      migrationsRun: false,
      ssl: process.env.POSTGRES_SSL === "true" ? { rejectUnauthorized: false } : false
    };
  }
}
