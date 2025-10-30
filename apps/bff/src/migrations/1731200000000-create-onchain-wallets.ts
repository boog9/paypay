import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOnchainWallets1731200000000 implements MigrationInterface {
  name = 'CreateOnchainWallets1731200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto";');
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "onchain_wallets" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "store_id" uuid NOT NULL,
        "payment_method_id" varchar(64) NOT NULL,
        "enabled" boolean NOT NULL DEFAULT true,
        "derivation_scheme" text NULL,
        "account_key_path" text NULL,
        "master_fingerprint" varchar(16) NULL,
        "label" varchar(160) NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at" TIMESTAMPTZ NULL,
        CONSTRAINT "fk_onchain_wallet_store" FOREIGN KEY ("store_id") REFERENCES "managed_stores"("id") ON DELETE CASCADE,
        CONSTRAINT "uq_onchain_wallet_store_payment_method" UNIQUE ("store_id", "payment_method_id")
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "ix_onchain_wallet_store_id" ON "onchain_wallets" ("store_id")'
    );

    const hasLegacyTable = await queryRunner.hasTable('managed_store_wallets');
    if (hasLegacyTable) {
      const legacyRows: Array<{
        store_id: string;
        payment_method_id?: string | null;
        derivation_scheme?: string | null;
        account_key_path?: string | null;
        master_fingerprint?: string | null;
        label?: string | null;
      }> = await queryRunner.query(
        'SELECT store_id, payment_method_id, derivation_scheme, account_key_path, master_fingerprint, label FROM "managed_store_wallets"'
      );

      for (const row of legacyRows) {
        const paymentMethodId =
          typeof row.payment_method_id === 'string' && row.payment_method_id.trim()
            ? row.payment_method_id.trim().toUpperCase()
            : 'BTC-CHAIN';
        const derivationMarker =
          typeof row.derivation_scheme === 'string' && row.derivation_scheme.trim() ? 'PRESENT' : null;
        const accountKeyPath =
          typeof row.account_key_path === 'string' && row.account_key_path.trim()
            ? row.account_key_path.trim()
            : null;
        const masterFingerprint =
          typeof row.master_fingerprint === 'string' && row.master_fingerprint.trim()
            ? row.master_fingerprint.trim().toUpperCase()
            : null;
        const label = typeof row.label === 'string' && row.label.trim() ? row.label.trim() : null;

        await queryRunner.query(
          `INSERT INTO "onchain_wallets" (
            store_id,
            payment_method_id,
            enabled,
            derivation_scheme,
            account_key_path,
            master_fingerprint,
            label,
            created_at,
            updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, now(), now())
          ON CONFLICT (store_id, payment_method_id) DO NOTHING`,
          [
            row.store_id,
            paymentMethodId,
            true,
            derivationMarker,
            accountKeyPath,
            masterFingerprint,
            label
          ]
        );
      }

      await queryRunner.query('DROP TABLE IF EXISTS "managed_store_wallets"');
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "ix_onchain_wallet_store_id"');
    await queryRunner.query('DROP TABLE IF EXISTS "onchain_wallets"');
  }
}
