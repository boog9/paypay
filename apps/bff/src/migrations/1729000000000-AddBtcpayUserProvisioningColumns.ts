import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBtcpayUserProvisioningColumns1729000000000 implements MigrationInterface {
  name = 'AddBtcpayUserProvisioningColumns1729000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "btcpay_user_id" varchar(64)'
    );
    await queryRunner.query(
      'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "btcpay_api_key_label" varchar(128)'
    );
    await queryRunner.query(
      'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "btcpay_api_key_hash" varchar(255)'
    );
    await queryRunner.query(
      'ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "btcpay_api_key_permissions" text'
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "users_btcpay_user_id_unique" ON "users" ("btcpay_user_id") WHERE "btcpay_user_id" IS NOT NULL'
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "users_btcpay_user_id_unique"');
    await queryRunner.query('ALTER TABLE "users" DROP COLUMN IF EXISTS "btcpay_api_key_permissions"');
    await queryRunner.query('ALTER TABLE "users" DROP COLUMN IF EXISTS "btcpay_api_key_hash"');
    await queryRunner.query('ALTER TABLE "users" DROP COLUMN IF EXISTS "btcpay_api_key_label"');
    await queryRunner.query('ALTER TABLE "users" DROP COLUMN IF EXISTS "btcpay_user_id"');
  }
}
