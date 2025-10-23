import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateManagedStoreWallets1731000000000 implements MigrationInterface {
  name = 'CreateManagedStoreWallets1731000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "managed_store_wallets" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "store_id" uuid NOT NULL,
        "payment_method_id" varchar(64) NOT NULL,
        "derivation_scheme" text NULL,
        "account_key_path" text NULL,
        "master_fingerprint" varchar(16) NULL,
        "label" varchar(160) NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "fk_wallet_store" FOREIGN KEY ("store_id") REFERENCES "managed_stores"("id") ON DELETE CASCADE,
        CONSTRAINT "uq_wallet_store_payment_method" UNIQUE ("store_id", "payment_method_id")
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "ix_wallet_store_id" ON "managed_store_wallets" ("store_id")'
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "ix_wallet_store_id"');
    await queryRunner.query('DROP TABLE IF EXISTS "managed_store_wallets"');
  }
}
