import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStoreKeyLastFour1710000000000 implements MigrationInterface {
  name = 'AddStoreKeyLastFour1710000000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "managed_stores" ADD COLUMN "store_key_last_four" varchar(4)`
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "managed_stores" DROP COLUMN "store_key_last_four"`
    );
  }
}
