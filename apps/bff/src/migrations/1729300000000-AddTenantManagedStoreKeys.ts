import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantManagedStoreKeys1729300000000 implements MigrationInterface {
  name = 'AddTenantManagedStoreKeys1729300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "api_key_managed_by_tenant" boolean NOT NULL DEFAULT false'
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "stores" DROP COLUMN IF EXISTS "api_key_managed_by_tenant"');
  }
}
