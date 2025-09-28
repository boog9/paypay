import { AppDataSource } from '../database/data-source';

async function main() {
  await AppDataSource.initialize();
  try {
    await AppDataSource.runMigrations();
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
