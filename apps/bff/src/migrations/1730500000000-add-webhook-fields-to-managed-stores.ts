import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWebhookFieldsToManagedStores1730500000000 implements MigrationInterface {
  name = 'AddWebhookFieldsToManagedStores1730500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.managed_stores
        ADD COLUMN IF NOT EXISTS webhook_id varchar(64),
        ADD COLUMN IF NOT EXISTS webhook_secret_ciphertext text,
        ADD COLUMN IF NOT EXISTS webhook_secret_dek_wrapped text
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE public.managed_stores
        DROP COLUMN IF EXISTS webhook_secret_dek_wrapped,
        DROP COLUMN IF EXISTS webhook_secret_ciphertext,
        DROP COLUMN IF EXISTS webhook_id
    `);
  }
}
