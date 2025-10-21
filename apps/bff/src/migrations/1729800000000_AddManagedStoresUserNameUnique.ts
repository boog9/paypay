import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddManagedStoresUserNameUnique1729800000000 implements MigrationInterface {
  name = 'AddManagedStoresUserNameUnique1729800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS managed_stores_user_name_uq ON "managed_stores" ("user_id", "store_name")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS managed_stores_user_name_uq`);
  }
}
