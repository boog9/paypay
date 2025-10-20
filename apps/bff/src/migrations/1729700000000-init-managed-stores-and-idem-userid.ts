import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitManagedStoresAndIdemUserid1729700000000 implements MigrationInterface {
  name = 'InitManagedStoresAndIdemUserid1729700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "managed_stores" (
        "id" uuid PRIMARY KEY,
        "user_id" uuid NOT NULL,
        "btcpay_store_id" varchar(64) NOT NULL,
        "store_name" varchar(200) NOT NULL,
        "default_currency" varchar(16) NOT NULL,
        "btcpay_host" varchar(200) NOT NULL,
        "api_key_ciphertext" text NOT NULL,
        "api_key_dek_wrapped" text NOT NULL,
        "last_active_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "fk_managed_stores_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "uq_managed_stores_user_store" UNIQUE ("user_id", "btcpay_store_id")
      )
    `);

    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "ix_managed_stores_user_id" ON "managed_stores" ("user_id")'
    );

    await queryRunner.query('ALTER TABLE "idempotency_keys" ADD COLUMN IF NOT EXISTS "user_id" uuid NULL');
    await queryRunner.query('ALTER TABLE "idempotency_keys" ADD COLUMN IF NOT EXISTS "route" varchar(160) NULL');
    await queryRunner.query('ALTER TABLE "idempotency_keys" ADD COLUMN IF NOT EXISTS "response_status" integer NULL');
    await queryRunner.query('ALTER TABLE "idempotency_keys" ADD COLUMN IF NOT EXISTS "response_body" text NULL');

    await queryRunner.query(
      'ALTER TABLE "idempotency_keys" ADD CONSTRAINT "fk_idem_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL'
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "ix_idem_user_key" ON "idempotency_keys" ("user_id","key")'
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "ix_idem_user_key"');
    await queryRunner.query('ALTER TABLE "idempotency_keys" DROP CONSTRAINT IF EXISTS "fk_idem_user"');
    await queryRunner.query('ALTER TABLE "idempotency_keys" DROP COLUMN IF EXISTS "response_body"');
    await queryRunner.query('ALTER TABLE "idempotency_keys" DROP COLUMN IF EXISTS "response_status"');
    await queryRunner.query('ALTER TABLE "idempotency_keys" DROP COLUMN IF EXISTS "route"');
    await queryRunner.query('ALTER TABLE "idempotency_keys" DROP COLUMN IF EXISTS "user_id"');
    await queryRunner.query('DROP INDEX IF EXISTS "ix_managed_stores_user_id"');
    await queryRunner.query('DROP TABLE IF EXISTS "managed_stores"');
  }
}
