import "reflect-metadata";
import { DataSource } from "typeorm";
import { DatabaseConfig } from "../common/database.config";
import { entities } from "../common/entities";
import { InitSchema1700000000000 } from "./migrations/1700000000000-init-schema";

const dataSource = new DataSource({
  ...(new DatabaseConfig().createTypeOrmOptions() as any),
  entities,
  migrations: [InitSchema1700000000000]
});

dataSource
  .initialize()
  .then(async () => {
    await dataSource.runMigrations();
    await dataSource.destroy();
  })
  .catch(async (error) => {
    console.error(error);
    await dataSource.destroy();
    process.exit(1);
  });
